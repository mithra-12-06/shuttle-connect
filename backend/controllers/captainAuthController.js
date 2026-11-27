
"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// ==========================================
// CAPTAIN LOGIN
// POST /api/captain/login
// ==========================================

async function loginCaptain(req, res, helpers) {
    const { readJsonBody, sendJson } = helpers;

    try {
        const data = await readJsonBody(req);

        const email = typeof data.email === "string"
            ? data.email.trim().toLowerCase()
            : "";

        const password = typeof data.password === "string"
            ? data.password
            : "";

        if (!email || !password) {
            return sendJson(res, 400, {
                success: false,
                message: "Email and password are required."
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing.");

            return sendJson(res, 500, {
                success: false,
                message: "Authentication configuration error."
            });
        }

        // Find an active captain account.
        const [rows] = await pool.execute(
            `SELECT
                u.user_id,
                u.full_name,
                u.email,
                u.password_hash,
                u.account_role,
                u.is_active,
                cp.captain_id,
                cp.availability_status,
                cp.verification_status
             FROM users u
             INNER JOIN captain_profiles cp
                ON cp.user_id = u.user_id
             WHERE u.email = ?
               AND u.account_role = 'captain'
             LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return sendJson(res, 401, {
                success: false,
                message: "Invalid email or password."
            });
        }

        const captain = rows[0];

        if (Number(captain.is_active) !== 1) {
            return sendJson(res, 403, {
                success: false,
                message: "Your captain account is inactive. Please contact support."
            });
        }

        if (captain.verification_status !== "verified") {
            return sendJson(res, 403, {
                success: false,
                message: "Your captain account has not been verified."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            captain.password_hash
        );

        if (!passwordMatches) {
            return sendJson(res, 401, {
                success: false,
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                user_id: captain.user_id,
                captain_id: captain.captain_id,
                account_role: "captain"
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "1d"
            }
        );

        return sendJson(res, 200, {
            success: true,
            message: "Captain login successful.",
            token,
            captain: {
                user_id: captain.user_id,
                captain_id: captain.captain_id,
                full_name: captain.full_name,
                email: captain.email,
                account_role: "captain",
                availability_status: captain.availability_status
            }
        });

    } catch (error) {
        console.error("Captain login error:", error);

        if (error.message === "Invalid JSON") {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid JSON request."
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: "Captain login failed. Please try again."
        });
    }
}

module.exports = {
    loginCaptain
};
