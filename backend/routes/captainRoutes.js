
"use strict";

const {
    loginCaptain
} = require("../controllers/captainAuthController");

const {
    submitCaptainApplication
} = require("../controllers/captainApplicationController");

const {
    activateCaptain
} = require("../controllers/captainActivationController");

const {
    getCaptainRides,
    acceptCaptainRide,
    startCaptainRide
} = require("../controllers/captainRideController");

const {
    updateCaptainAvailability
} = require("../controllers/captainAvailabilityController");

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
    // CAPTAIN ACCOUNT ACTIVATION
    // POST /api/captain/activate
    // ======================================

    if (
        pathname === "/api/captain/activate" &&
        req.method === "POST"
    ) {
        await activateCaptain(req, res, helpers);
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

    // ======================================
    // UPDATE CAPTAIN AVAILABILITY
    // PATCH /api/captain/availability
    // ======================================

    if (
        pathname === "/api/captain/availability" &&
        req.method === "PATCH"
    ) {
        await updateCaptainAvailability(req, res, helpers);
        return true;
    }

    // ======================================
    // GET CAPTAIN RIDE REQUESTS
    // GET /api/captain/last-mile/rides
    // ======================================

    if (
        pathname === "/api/captain/last-mile/rides" &&
        req.method === "GET"
    ) {
        await getCaptainRides(req, res, helpers);
        return true;
    }

    // ======================================
    // ACCEPT A RIDE
    // POST /api/captain/last-mile/rides/:rideId/accept
    // ======================================

    const acceptMatch = pathname.match(
        /^\/api\/captain\/last-mile\/rides\/(\d+)\/accept$/
    );

    if (acceptMatch && req.method === "POST") {
        await acceptCaptainRide(
            req,
            res,
            Number(acceptMatch[1]),
            helpers
        );

        return true;
    }

    // ======================================
    // VERIFY OTP AND START RIDE
    // POST /api/captain/last-mile/rides/:rideId/start
    // ======================================

    const startMatch = pathname.match(
        /^\/api\/captain\/last-mile\/rides\/(\d+)\/start$/
    );

    if (startMatch && req.method === "POST") {
        await startCaptainRide(
            req,
            res,
            Number(startMatch[1]),
            helpers
        );

        return true;
    }

    return false;
}

module.exports = handleCaptainRoute;
