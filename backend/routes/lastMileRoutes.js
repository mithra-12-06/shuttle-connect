
const {
    createPassengerRideRequest
} = require('../controllers/lastMileController');

async function handleLastMileRoute(
    req,
    res,
    pathname,
    helpers
) {
    // POST /api/passenger/last-mile/rides
    if (
        pathname === '/api/passenger/last-mile/rides' &&
        req.method === 'POST'
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
