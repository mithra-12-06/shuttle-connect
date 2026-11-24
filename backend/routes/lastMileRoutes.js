"use strict";

const {
    createPassengerRideRequest
} = require("../controllers/lastMileController");

const {
    getPassengerLastMileRides
} = require("../controllers/passengerLastMileController");

async function handleLastMileRoute(
    req,
    res,
    pathname,
    helpers
) {
    // GET /api/passenger/last-mile/rides
    if (
        pathname === "/api/passenger/last-mile/rides" &&
        req.method === "GET"
    ) {
        await getPassengerLastMileRides(
            req,
            res,
            helpers
        );

        return true;
    }

    // POST /api/passenger/last-mile/rides
    // Existing ride-request functionality is preserved.
    if (
        pathname === "/api/passenger/last-mile/rides" &&
        req.method === "POST"
    ) {
        await createPassengerRideRequest(
            req,
            res,
            helpers
        );

        return true;
    }

    return false;
}

module.exports = handleLastMileRoute;