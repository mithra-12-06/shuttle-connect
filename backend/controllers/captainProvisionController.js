
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

// ==========================================
// APPROVE APPLICATION AND CREATE CAPTAIN
// ==========================================

async function approveAndProvisionCaptain(req, res, helpers, admin) {
    const { sendJson } = helpers;
    let connection;

    try {
        const parts = new URL(req.url, "http://localhost").pathname.split("/");
        const applicationId = Number(parts[4]);

        if (
            !Number.isSafeInteger(applicationId) ||
            applicationId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid captain application ID."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [applications] = await connection.execute(
            `SELECT *
             FROM captain_applications
             WHERE application_id = ?
             FOR UPDATE`,
            [applicationId]
        );

        if (applications.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: "Captain application not found."
            });
        }

        const application = applications[0];

        // Allow pending applications and previously approved
        // applications that still need account provisioning.
        if (
            !["pending", "approved"].includes(
                application.application_status
            )
        ) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "Only pending or unprovisioned approved applications can be provisioned."
            });
        }

        if (
            application.vehicle_year === null ||
            application.vehicle_year === undefined
        ) {
            await connection.rollback();

            return sendJson(res, 422, {
                success: false,
                message: "This application has no vehicle manufacturing year. Update the application before approving it."
            });
        }

        // Prevent duplicate user accounts.
        const [existingUsers] = await connection.execute(
            `SELECT user_id
             FROM users
             WHERE email = ? OR phone = ?
             LIMIT 1`,
            [application.email, application.phone]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "A user account already exists for this email or phone number. Manual review is required."
            });
        }

        // Prevent duplicate captain profiles for this application.
        const [existingProfiles] = await connection.execute(
            `SELECT captain_id
             FROM captain_profiles
             WHERE application_id = ?
             LIMIT 1`,
            [applicationId]
        );

        if (existingProfiles.length > 0) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "A captain profile already exists for this application. Manual review is required."
            });
        }

        // Generate a random temporary password.
        // The captain will set their own password during activation.
        const temporaryPassword = crypto.randomBytes(48).toString("hex");

        const temporaryPasswordHash = await bcrypt.hash(
            temporaryPassword,
            12
        );

        const [userResult] = await connection.execute(
            `INSERT INTO users (
                full_name,
                email,
                phone,
                password_hash,
                account_role,
                is_active
            )
            VALUES (?, ?, ?, ?, 'captain', 0)`,
            [
                application.full_name,
                application.email,
                application.phone,
                temporaryPasswordHash
            ]
        );

        const userId = userResult.insertId;

        const [profileResult] = await connection.execute(
            `INSERT INTO captain_profiles (
                user_id,
                application_id,
                vehicle_category,
                vehicle_registration,
                vehicle_model,
                vehicle_year,
                licence_number,
                licence_expiry,
                availability_status,
                verification_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', 'verified')`,
            [
                userId,
                application.application_id,
                application.vehicle_category,
                application.vehicle_registration,
                application.vehicle_model,
                application.vehicle_year,
                application.licence_number,
                application.licence_expiry
            ]
        );

        // Generate a one-time activation token.
        const activationToken = crypto.randomBytes(32).toString("hex");

        const tokenHash = crypto
            .createHash("sha256")
            .update(activationToken)
            .digest("hex");

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        await connection.execute(
            `INSERT INTO captain_account_tokens (
                user_id,
                token_hash,
                token_type,
                expires_at
            )
            VALUES (?, ?, 'activation', ?)`,
            [userId, tokenHash, expiresAt]
        );

        // Mark the application approved.
        await connection.execute(
            `UPDATE captain_applications
             SET application_status = 'approved',
                 reviewed_by = ?,
                 reviewed_at = NOW(),
                 rejection_reason = NULL
             WHERE application_id = ?`,
            [admin.user_id, applicationId]
        );

        await connection.commit();

        return sendJson(res, 201, {
            success: true,
            message: "Captain account created successfully. The captain must activate the account before login.",
            captain: {
                user_id: userId,
                captain_id: profileResult.insertId,
                application_id: applicationId,
                full_name: application.full_name,
                email: application.email,
                account_status: "awaiting_activation"
            },
            activation: {
                token: activationToken,
                expires_at: expiresAt,
                note: "Development handoff only: share this token securely with the approved captain. It is shown only in this response and is not emailed."
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Captain provisioning rollback error:",
                    rollbackError
                );
            }
        }

        console.error("Captain provisioning error:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, {
                success: false,
                message: "A user account or captain profile already exists for this application."
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: "Unable to approve and provision this captain account."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// ==========================================
// REISSUE ACTIVATION TOKEN
// POST /api/admin/captain-applications/:id/reissue-activation
// ==========================================

async function reissueCaptainActivation(req, res, helpers, admin) {
    const { sendJson } = helpers;
    let connection;

    try {
        const parts = new URL(req.url, "http://localhost").pathname.split("/");
        const applicationId = Number(parts[4]);

        if (
            !Number.isSafeInteger(applicationId) ||
            applicationId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid captain application ID."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT
                ca.application_id,
                ca.application_status,
                cp.captain_id,
                cp.user_id,
                cp.verification_status,
                u.account_role,
                u.is_active
             FROM captain_applications ca
             INNER JOIN captain_profiles cp
                ON cp.application_id = ca.application_id
             INNER JOIN users u
                ON u.user_id = cp.user_id
             WHERE ca.application_id = ?
             FOR UPDATE`,
            [applicationId]
        );

        if (rows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: "Approved captain account was not found for this application."
            });
        }

        const captain = rows[0];

        if (captain.application_status !== "approved") {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "Activation can only be reissued for an approved application."
            });
        }

        if (
            captain.account_role !== "captain" ||
            captain.verification_status !== "verified"
        ) {
            await connection.rollback();

            return sendJson(res, 403, {
                success: false,
                message: "This captain account is not verified for activation."
            });
        }

        if (Number(captain.is_active) !== 0) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "This captain account is already active. A new activation token is not required."
            });
        }

        await connection.execute(
            `UPDATE captain_account_tokens
             SET used_at = UTC_TIMESTAMP()
             WHERE user_id = ?
               AND token_type = 'activation'
               AND used_at IS NULL`,
            [captain.user_id]
        );

        const activationToken = crypto.randomBytes(32).toString("hex");

        const tokenHash = crypto
            .createHash("sha256")
            .update(activationToken)
            .digest("hex");

        await connection.execute(
            `INSERT INTO captain_account_tokens (
                user_id,
                token_hash,
                token_type,
                expires_at
            )
            VALUES (
                ?,
                ?,
                'activation',
                DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
            )`,
            [captain.user_id, tokenHash]
        );

        const [expiryRows] = await connection.execute(
            `SELECT DATE_FORMAT(
                expires_at,
                '%Y-%m-%d %H:%i:%s'
             ) AS expires_at
             FROM captain_account_tokens
             WHERE token_hash = ?
             LIMIT 1`,
            [tokenHash]
        );

        await connection.commit();

        return sendJson(res, 200, {
            success: true,
            message: "A fresh activation token has been generated. Previous unused activation tokens are invalid.",
            captain: {
                application_id: captain.application_id,
                user_id: captain.user_id,
                captain_id: captain.captain_id,
                account_status: "awaiting_activation"
            },
            activation: {
                token: activationToken,
                expires_at: expiryRows[0].expires_at,
                note: "Development handoff only. This token is shown once in this response. Do not share it publicly."
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Activation reissue rollback error:",
                    rollbackError
                );
            }
        }

        console.error("Captain activation reissue error:", error);

        return sendJson(res, 500, {
            success: false,
            message: "Unable to generate a new captain activation token."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    approveAndProvisionCaptain,
    reissueCaptainActivation
};
