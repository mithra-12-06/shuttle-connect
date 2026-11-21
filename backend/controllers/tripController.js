
const pool = require('../config/db');

// ==========================================
// GET /api/trips
// Search scheduled trips by origin, destination and date
// ==========================================

async function searchTrips(req, res, requestUrl, sendJson) {
    try {
        const origin = requestUrl.searchParams.get('origin');
        const destination = requestUrl.searchParams.get('destination');
        const date = requestUrl.searchParams.get('date');

        if (!origin || !destination || !date) {
            return sendJson(res, 400, {
                success: false,
                message: 'Origin, destination and date are required'
            });
        }

        const [trips] = await pool.execute(
            `SELECT
                t.trip_id,
                t.departure_datetime,
                t.arrival_datetime,
                t.fare_per_seat,
                t.trip_status,
                r.origin,
                r.destination,
                v.seating_capacity,
                (
                    SELECT COUNT(DISTINCT bs.seat_number)
                    FROM booking_seats bs
                    WHERE bs.trip_id = t.trip_id
                    AND bs.seat_status = 'booked'
                ) AS booked_seats
            FROM trips t
            JOIN routes r ON t.route_id = r.route_id
            JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            WHERE r.origin = ?
            AND r.destination = ?
            AND DATE(t.departure_datetime) = ?
            AND t.trip_status = 'scheduled'
            AND r.is_active = 1
            AND v.vehicle_status = 'active'
            ORDER BY t.departure_datetime`,
            [origin, destination, date]
        );

        const formattedTrips = trips.map(trip => ({
            ...trip,
            seating_capacity: Number(trip.seating_capacity),
            booked_seats: Number(trip.booked_seats),
            available_seats: Math.max(
                0,
                Number(trip.seating_capacity) -
                Number(trip.booked_seats)
            )
        }));

        return sendJson(res, 200, {
            success: true,
            message: 'Trips retrieved successfully',
            total_trips: formattedTrips.length,
            trips: formattedTrips
        });

    } catch (error) {
        console.error('Search trips error:', error);

        return sendJson(res, 500, {
            success: false,
            message: 'Failed to retrieve trips'
        });
    }
}

// ==========================================
// GET /api/trips/:id/seats
// Retrieve seat availability for a trip
// ==========================================

async function getSeatAvailability(req, res, tripId, sendJson) {
    try {
        const [trips] = await pool.execute(
            `SELECT
                t.trip_id,
                v.seating_capacity
            FROM trips t
            JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            WHERE t.trip_id = ?`,
            [tripId]
        );

        if (trips.length === 0) {
            return sendJson(res, 404, {
                success: false,
                message: 'Trip not found'
            });
        }

        const capacity = Number(trips[0].seating_capacity);

        const [bookedSeats] = await pool.execute(
            `SELECT DISTINCT seat_number
             FROM booking_seats
             WHERE trip_id = ?
             AND seat_status = 'booked'`,
            [tripId]
        );

        const bookedNumbers = bookedSeats.map(
            seat => Number(seat.seat_number)
        );

        const bookedSet = new Set(bookedNumbers);
        const seats = [];

        for (let number = 1; number <= capacity; number++) {
            seats.push({
                seat_number: number,
                status: bookedSet.has(number)
                    ? 'booked'
                    : 'available'
            });
        }

        return sendJson(res, 200, {
            success: true,
            trip_id: Number(tripId),
            seating_capacity: capacity,
            available_seats: capacity - bookedSet.size,
            booked_seats: bookedSet.size,
            seats
        });

    } catch (error) {
        console.error('Seat availability error:', error);

        return sendJson(res, 500, {
            success: false,
            message: 'Failed to retrieve seat availability'
        });
    }
}

module.exports = {
    searchTrips,
    getSeatAvailability
};
