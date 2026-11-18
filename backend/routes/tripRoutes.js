
const {
    searchTrips,
    getSeatAvailability
} = require('../controllers/tripController');

async function handleTripRoute(
    req,
    res,
    pathname,
    requestUrl,
    helpers
) {
    const { sendJson } = helpers;

    if (
        pathname === '/api/trips' &&
        req.method === 'GET'
    ) {
        await searchTrips(req, res, requestUrl, sendJson);
        return true;
    }

    const seatMatch = pathname.match(
        /^\/api\/trips\/(\d+)\/seats$/
    );

    if (seatMatch && req.method === 'GET') {
        const tripId = Number(seatMatch[1]);

        await getSeatAvailability(req, res, tripId, sendJson);
        return true;
    }

    return false;
}

module.exports = handleTripRoute;
