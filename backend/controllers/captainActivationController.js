
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

// ==========================================
// CAPTAIN ACCOUNT ACTIVATION
// POST /api/captain/activate
// ==========================================

async function activateCaptain(req, res, helpers) {
    const { readJsonBody, sendJson } = helpers;

    let connection;

    try {
        const data = await readJsonBody(req);

        const activationToken =
            typeof data.token === "string"
                ? data.token.trim()
                : "";

        const password =
            typeof data.password === "string"
                ? data.password
                : "";

        if (!activationToken || !password) {
            return sendJson(res, 400, {
                success: false,
                message: "Activation token and password are required."
            });
        }

        if (!/^[a-fA-F0-9]{64}$/.test(activationToken)) {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid or expired activation token."
            });
        }

        if (
            password.length < 8 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Password must contain at least 8 characters and must not exceed 72 UTF-8 bytes."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(activationToken)
            .digest("hex");

        const passwordHash = await bcrypt.hash(password, 12);

        connection = await pool.getConnection();

        await connection.beginTransaction();

        // Lock the token row to prevent simultaneous activation.
        const [tokenRows] = await connection.execute(
            `SELECT
                t.token_id,
                t.user_id,
                u.account_role,
                u.is_active,
                cp.captain_id,
                cp.verification_status
             FROM captain_account_tokens t
             INNER JOIN users u
                ON u.user_id = t.user_id
             INNER JOIN captain_profiles cp
                ON cp.user_id = u.user_id
             WHERE t.token_hash = ?
               AND t.token_type = 'activation'
               AND t.used_at IS NULL
               AND t.expires_at > UTC_TIMESTAMP()
             LIMIT 1
             FOR UPDATE`,
            [tokenHash]
        );

        if (tokenRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 400, {
                success: false,
                message: "Invalid, expired, or already used activation token."
            });
        }

        const captain = tokenRows[0];

        if (
            captain.account_role !== "captain" ||
            Number(captain.is_active) !== 0 ||
            captain.verification_status !== "verified"
        ) {
            await connection.rollback();

            return sendJson(res, 403, {
                success: false,
                message: "This captain account cannot be activated."
            });
        }

        // Set the password and activate the captain account.
        const [userResult] = await connection.execute(
            `UPDATE users
             SET password_hash = ?,
                 is_active = 1
             WHERE user_id = ?
               AND account_role = 'captain'
               AND is_active = 0`,
            [passwordHash, captain.user_id]
        );

        if (userResult.affectedRows !== 1) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: "Captain account activation could not be completed."
            });
        }

        // Mark the activation token as permanently used.
        const [tokenResult] = await connection.execute(
            `UPDATE captain_account_tokens
             SET used_at = UTC_TIMESTAMP()
             WHERE token_id = ?
               AND used_at IS NULL`,
            [captain.token_id]
        );

        if (tokenResult.affectedRows !== 1) {
            throw new Error("Activation token could not be consumed.");
        }

        await connection.commit();

        return sendJson(res, 200, {
            success: true,
            message: "Captain account activated successfully. You can now log in.",
            captain: {
                user_id: captain.user_id,
                captain_id: captain.captain_id,
                account_role: "captain",
                account_status: "active"
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Captain activation rollback error:",
                    rollbackError
                );
            }
        }

        console.error("Captain activation error:", error);

        if (error.message === "Invalid JSON") {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid JSON request."
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: "Unable to activate captain account. Please try again."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    activateCaptain
};
