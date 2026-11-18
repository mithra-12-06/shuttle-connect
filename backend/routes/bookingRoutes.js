
const {
    cancelPassengerBooking
} = require('../controllers/bookingController');

async function handleBookingRoute(
    req,
    res,
    pathname,
    helpers
) {
    const cancellationMatch = pathname.match(
        /^\/api\/passenger\/bookings\/(\d+)\/cancel$/
    );

    if (
        cancellationMatch &&
        req.method === 'PATCH'
    ) {
        const bookingId = Number(cancellationMatch[1]);

        await cancelPassengerBooking(
            req,
            res,
            bookingId,
            helpers
        );

        return true;
    }

    return false;
}

module.exports = handleBookingRoute;
