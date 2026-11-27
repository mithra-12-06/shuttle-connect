
"use strict";

const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function updateCaptainAvailability(req, res, helpers) {
    let connection;

    try {
        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return helpers.sendJson(res, 401, {
                success: false,
                message: "Captain login required."
            });
        }

        if (!process.env.JWT_SECRET) {
            return helpers.sendJson(res, 500, {
                success: false,
                message: "Authentication configuration error."
            });
        }

        let decoded;

        try {
            decoded = jwt.verify(
                authorization.substring(7).trim(),
                process.env.JWT_SECRET
            );
        } catch {
            return helpers.sendJson(res, 401, {
                success: false,
                message: "Invalid or expired captain session."
            });
        }

        if (
            decoded.account_role !== "captain" ||
            !decoded.user_id ||
            !decoded.captain_id
        ) {
            return helpers.sendJson(res, 403, {
                success: false,
                message: "Captain access only."
            });
        }

        const data = await helpers.readJsonBody(req);
        const requestedStatus = data.availability_status;

        if (!["available", "offline"].includes(requestedStatus)) {
            return helpers.sendJson(res, 400, {
                success: false,
                message: "Choose either available or offline."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT
                u.is_active,
                u.account_role,
                cp.captain_id,
                cp.availability_status,
                cp.verification_status
             FROM users u
             INNER JOIN captain_profiles cp
                ON cp.user_id = u.user_id
             WHERE u.user_id = ?
               AND cp.captain_id = ?
             FOR UPDATE`,
            [decoded.user_id, decoded.captain_id]
        );

        if (!rows.length) {
            await connection.rollback();

            return helpers.sendJson(res, 403, {
                success: false,
                message: "Captain account not found."
            });
        }

        const captain = rows[0];

        if (
            Number(captain.is_active) !== 1 ||
            captain.account_role !== "captain" ||
            captain.verification_status !== "verified"
        ) {
            await connection.rollback();

            return helpers.sendJson(res, 403, {
                success: false,
                message: "Your captain account is not approved or active."
            });
        }

        if (captain.availability_status === "suspended") {
            await connection.rollback();

            return helpers.sendJson(res, 403, {
                success: false,
                message: "Your captain account is suspended."
            });
        }

        if (captain.availability_status === "on_ride") {
            await connection.rollback();

            return helpers.sendJson(res, 409, {
                success: false,
                message: "You cannot change availability during an active ride."
            });
        }

        await connection.execute(
            `UPDATE captain_profiles
             SET availability_status = ?
             WHERE captain_id = ?`,
            [requestedStatus, captain.captain_id]
        );

        await connection.commit();

        return helpers.sendJson(res, 200, {
            success: true,
            message: requestedStatus === "available"
                ? "You are now online and can receive ride requests."
                : "You are now offline.",
            availability_status: requestedStatus
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Update captain availability error:", error);

        return helpers.sendJson(res, 500, {
            success: false,
            message: "Unable to update your availability."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    updateCaptainAvailability
};
