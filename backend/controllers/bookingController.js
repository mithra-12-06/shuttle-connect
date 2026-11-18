
const pool = require('../config/db');

async function cancelPassengerBooking(
    req,
    res,
    bookingId,
    helpers
) {
    const { sendJson, authenticatePassenger } = helpers;

    let connection;

    try {
        // 1. Verify passenger authentication
        const decoded = authenticatePassenger(req);

        if (!decoded) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please login before cancelling a booking'
            });
        }

        // 2. Validate booking ID
        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'Invalid booking ID'
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 3. Retrieve the trip ID belonging to this passenger's booking
        // This is a preliminary read; the trip is locked next.
        const [initialRows] = await connection.execute(
            `SELECT trip_id
             FROM bookings
             WHERE booking_id = ?
               AND user_id = ?`,
            [bookingId, decoded.user_id]
        );

        if (initialRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Booking not found'
            });
        }

        const tripId = initialRows[0].trip_id;

        // 4. Lock the trip first.
        // This follows the same lock order as booking creation.
        const [tripRows] = await connection.execute(
            `SELECT
                trip_id,
                departure_datetime,
                trip_status,
                (departure_datetime > NOW()) AS is_future_trip
             FROM trips
             WHERE trip_id = ?
             FOR UPDATE`,
            [tripId]
        );

        if (tripRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Associated trip not found'
            });
        }

        const trip = tripRows[0];

        // 5. Lock and recheck the booking after acquiring the trip lock
        const [bookingRows] = await connection.execute(
            `SELECT
                booking_id,
                booking_reference,
                booking_status,
                trip_id
             FROM bookings
             WHERE booking_id = ?
               AND user_id = ?
               AND trip_id = ?
             FOR UPDATE`,
            [bookingId, decoded.user_id, tripId]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Booking not found'
            });
        }

        const booking = bookingRows[0];

        // 6. Check current booking status
        if (booking.booking_status !== 'confirmed') {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: 'This booking is already cancelled or unavailable'
            });
        }

        // 7. Check departure time using the database clock
        if (
            Number(trip.is_future_trip) !== 1 ||
            trip.trip_status !== 'scheduled'
        ) {
            await connection.rollback();

            return sendJson(res, 400, {
                success: false,
                message: 'This booking can no longer be cancelled'
            });
        }

        // 8. Mark booked seats as cancelled
        const [seatResult] = await connection.execute(
            `UPDATE booking_seats
             SET seat_status = 'cancelled'
             WHERE booking_id = ?
               AND seat_status = 'booked'`,
            [bookingId]
        );

        // 9. Update the booking record
        const [bookingUpdate] = await connection.execute(
            `UPDATE bookings
             SET booking_status = 'cancelled',
                 cancelled_at = NOW()
             WHERE booking_id = ?
               AND user_id = ?
               AND booking_status = 'confirmed'`,
            [bookingId, decoded.user_id]
        );

        if (bookingUpdate.affectedRows !== 1) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: 'Booking could not be cancelled. Please try again.'
            });
        }

        // 10. Commit both updates together
        await connection.commit();

        return sendJson(res, 200, {
            success: true,
            message: 'Booking cancelled successfully',
            booking: {
                booking_id: booking.booking_id,
                booking_reference: booking.booking_reference,
                booking_status: 'cancelled',
                trip_id: booking.trip_id,
                cancelled_seats: seatResult.affectedRows
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }

        console.error('Booking cancellation error:', error);

        return sendJson(res, 500, {
            success: false,
            message: 'Unable to cancel booking'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    cancelPassengerBooking
};
