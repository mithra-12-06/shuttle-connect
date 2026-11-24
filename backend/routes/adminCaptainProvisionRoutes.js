
"use strict";

const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const {
    approveAndProvisionCaptain,
    reissueCaptainActivation
} = require("../controllers/captainProvisionController");

async function authenticateAdmin(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    try {
        const decoded = jwt.verify(
            authHeader.split(" ")[1],
            process.env.JWT_SECRET
        );

        if (
            decoded.account_role !== "admin" ||
            !decoded.user_id
        ) {
            return null;
        }

        const [rows] = await pool.execute(
            `SELECT user_id
             FROM users
             WHERE user_id = ?
               AND account_role = 'admin'
               AND is_active = 1`,
            [decoded.user_id]
        );

        return rows.length > 0 ? decoded : null;

    } catch {
        return null;
    }
}

async function handleAdminCaptainProvisionRoute(
    req,
    res,
    pathname,
    helpers
) {
    const approvalMatch = pathname.match(
        /^\/api\/admin\/captain-applications\/(\d+)\/provision-approval$/
    );

    const reissueMatch = pathname.match(
        /^\/api\/admin\/captain-applications\/(\d+)\/reissue-activation$/
    );

    if (
        req.method !== "POST" ||
        (!approvalMatch && !reissueMatch)
    ) {
        return false;
    }

    const { sendJson } = helpers;

    const admin = await authenticateAdmin(req);

    if (!admin) {
        sendJson(res, 401, {
            success: false,
            message: "Unauthorized. Administrator login is required."
        });

        return true;
    }

    if (approvalMatch) {
        await approveAndProvisionCaptain(
            req,
            res,
            helpers,
            admin
        );

        return true;
    }

    if (reissueMatch) {
        await reissueCaptainActivation(
            req,
            res,
            helpers,
            admin
        );

        return true;
    }

    return false;
}

module.exports = handleAdminCaptainProvisionRoute;
