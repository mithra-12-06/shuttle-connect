
const {
    cancelPassengerBooking,
    downloadPassengerTicket
} = require('../controllers/bookingController');

async function handleBookingRoute(
    req,
    res,
    pathname,
    helpers
) {
    // PATCH /api/passenger/bookings/:booking_id/cancel
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

    // GET /api/passenger/bookings/:booking_id/ticket.pdf
    const ticketMatch = pathname.match(
        /^\/api\/passenger\/bookings\/(\d+)\/ticket\.pdf$/
    );

    if (
        ticketMatch &&
        req.method === 'GET'
    ) {
        const bookingId = Number(ticketMatch[1]);

        await downloadPassengerTicket(
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
