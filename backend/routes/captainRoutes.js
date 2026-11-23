
"use strict";

const {
    loginCaptain
} = require("../controllers/captainAuthController");

const {
    submitCaptainApplication
} = require("../controllers/captainApplicationController");

async function handleCaptainRoute(req, res, pathname, helpers) {

    // ======================================
    // CAPTAIN LOGIN
    // POST /api/captain/login
    // ======================================

    if (
        pathname === "/api/captain/login" &&
        req.method === "POST"
    ) {
        await loginCaptain(req, res, helpers);
        return true;
    }

    // ======================================
    // CAPTAIN APPLICATION SUBMISSION
    // POST /api/captain/applications
    // ======================================

    if (
        pathname === "/api/captain/applications" &&
        req.method === "POST"
    ) {
        await submitCaptainApplication(req, res, helpers);
        return true;
    }

    return false;
}

module.exports = handleCaptainRoute;
