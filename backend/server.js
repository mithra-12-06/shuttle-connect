
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./config/db');

const handleAuthRoute = require('./routes/authRoutes');
const handleTripRoute = require('./routes/tripRoutes');
const handleBookingRoute = require('./routes/bookingRoutes');

// ==========================================
// 1. READ JSON REQUEST BODY
// ==========================================

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let finished = false;

        req.on('data', chunk => {
            if (finished) return;

            body += chunk;

            if (Buffer.byteLength(body) > 1000000) {
                finished = true;
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (finished) return;

            try {
                const data = JSON.parse(body);

                if (
                    !data ||
                    typeof data !== 'object' ||
                    Array.isArray(data)
                ) {
                    return reject(new Error('Invalid JSON'));
                }

                resolve(data);
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', error => {
            if (!finished) {
                finished = true;
                reject(error);
            }
        });
    });
}

// ==========================================
// 2. SEND JSON RESPONSE
// ==========================================

function sendJson(res, statusCode, data) {
    if (res.headersSent || res.destroyed) return;

    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    res.end(JSON.stringify(data));
}

// ==========================================
// 3. PASSENGER JWT AUTHENTICATION
// ==========================================

function authenticatePassenger(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (
            decoded.account_role !== 'passenger' ||
            !decoded.user_id
        ) {
            return null;
        }

        return decoded;
    } catch {
        return null;
    }
}

// ==========================================
// 4. CREATE HTTP SERVER
// ==========================================

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = requestUrl.pathname;

    // ======================================
    // CORS PREFLIGHT
    // ======================================

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });

        return res.end();
    }

    // ======================================
    // PASSENGER AUTHENTICATION ROUTES
    // POST /api/auth/register
    // POST /api/auth/login
    // ======================================

    const authHandled = await handleAuthRoute(
        req,
        res,
        pathname,
        {
            readJsonBody,
            sendJson
        }
    );

    if (authHandled) {
        return;
    }

    // ======================================
    // HOME ROUTE
    // GET /
    // ======================================

    if (pathname === '/' && req.method === 'GET') {
        return sendJson(res, 200, {
            success: true,
            message: 'Welcome to ShuttleConnect Backend!'
        });
    }

    // ======================================
    // DATABASE HEALTH CHECK
    // GET /api/health/db
    // ======================================

    if (
        pathname === '/api/health/db' &&
        req.method === 'GET'
    ) {
        try {
            const [rows] = await pool.query(`
                SELECT
                    DATABASE() AS database_name,
                    VERSION() AS mysql_version
            `);

            return sendJson(res, 200, {
                success: true,
                message: 'MySQL connected successfully!',
                database: rows[0].database_name,
                version: rows[0].mysql_version
            });

        } catch (error) {
            console.error('Database error:', error);

            return sendJson(res, 500, {
                success: false,
                message: 'Database connection failed'
            });
        }
    }

    // ======================================
    // TRIP ROUTES
    // GET /api/trips
    // GET /api/trips/:id/seats
    // ======================================

    const tripHandled = await handleTripRoute(
        req,
        res,
        pathname,
        requestUrl,
        {
            sendJson
        }
    );

    if (tripHandled) {
        return;
    }

    // ======================================
    // PASSENGER BOOKING ROUTES
    // PATCH /api/passenger/bookings/:id/cancel
    // ======================================

    const bookingHandled = await handleBookingRoute(
        req,
        res,
        pathname,
        {
            sendJson,
            authenticatePassenger
        }
    );

    if (bookingHandled) {
        return;
    }

    // ======================================
    // PASSENGER BOOKING
    // POST /api/bookings
    // ======================================

    if (
        pathname === '/api/bookings' &&
        req.method === 'POST'
    ) {
        let connection;

        try {
            const decoded = authenticatePassenger(req);

            if (!decoded) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Please login before booking'
                });
            }

            const data = await readJsonBody(req);
            const tripId = Number(data.trip_id);

            if (
                !Number.isSafeInteger(tripId) ||
                tripId <= 0
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'A valid trip ID is required'
                });
            }

            if (
                !Array.isArray(data.seat_numbers) ||
                data.seat_numbers.length === 0
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Please select at least one seat'
                });
            }

            const seatNumbers = data.seat_numbers.map(
                seat => String(seat).trim()
            );

            if (seatNumbers.length > 20) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'You cannot select more than 20 seats'
                });
            }

            if (new Set(seatNumbers).size !== seatNumbers.length) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Duplicate seat selections are not allowed'
                });
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // Lock the trip row to serialize bookings for this trip.
            const [tripRows] = await connection.execute(
                `SELECT
                    trip_id,
                    vehicle_id,
                    route_id,
                    fare_per_seat,
                    trip_status
                 FROM trips
                 WHERE trip_id = ?
                 FOR UPDATE`,
                [tripId]
            );

            if (tripRows.length === 0) {
                await connection.rollback();

                return sendJson(res, 404, {
                    success: false,
                    message: 'Trip not found'
                });
            }

            const trip = tripRows[0];

            if (trip.trip_status !== 'scheduled') {
                await connection.rollback();

                return sendJson(res, 400, {
                    success: false,
                    message: 'This trip is not available for booking'
                });
            }

            const [serviceRows] = await connection.execute(
                `SELECT
                    r.is_active,
                    v.vehicle_status,
                    v.seating_capacity
                 FROM routes r
                 INNER JOIN vehicles v
                    ON v.vehicle_id = ?
                 WHERE r.route_id = ?
                 LIMIT 1`,
                [trip.vehicle_id, trip.route_id]
            );

            if (
                serviceRows.length === 0 ||
                Number(serviceRows[0].is_active) !== 1 ||
                serviceRows[0].vehicle_status !== 'active'
            ) {
                await connection.rollback();

                return sendJson(res, 400, {
                    success: false,
                    message: 'This route or vehicle is unavailable'
                });
            }

            const capacity = Number(serviceRows[0].seating_capacity);

            const invalidSeats = seatNumbers.filter(seat => (
                !/^\d+$/.test(seat) ||
                Number(seat) < 1 ||
                Number(seat) > capacity
            ));

            if (invalidSeats.length > 0) {
                await connection.rollback();

                return sendJson(res, 400, {
                    success: false,
                    message: 'One or more selected seat numbers are invalid',
                    invalid_seats: invalidSeats
                });
            }

            const [userRows] = await connection.execute(
                `SELECT user_id
                 FROM users
                 WHERE user_id = ?
                   AND account_role = 'passenger'
                   AND is_active = 1`,
                [decoded.user_id]
            );

            if (userRows.length === 0) {
                await connection.rollback();

                return sendJson(res, 403, {
                    success: false,
                    message: 'Passenger account is inactive or unavailable'
                });
            }

            const [occupiedRows] = await connection.execute(
                `SELECT bs.seat_number
                 FROM booking_seats bs
                 INNER JOIN bookings b
                    ON b.booking_id = bs.booking_id
                 WHERE bs.trip_id = ?
                   AND bs.seat_status = 'booked'
                   AND b.booking_status = 'confirmed'`,
                [tripId]
            );

            const occupiedSet = new Set(
                occupiedRows.map(row => String(row.seat_number))
            );

            const unavailableSeats = seatNumbers.filter(
                seat => occupiedSet.has(seat)
            );

            if (unavailableSeats.length > 0) {
                await connection.rollback();

                return sendJson(res, 409, {
                    success: false,
                    message: 'Some selected seats are already booked',
                    unavailable_seats: unavailableSeats
                });
            }

            const fare = Number(trip.fare_per_seat);

            const totalAmount = Number(
                (fare * seatNumbers.length).toFixed(2)
            );

            const bookingReference =
                'SC-' +
                Date.now() +
                '-' +
                crypto.randomBytes(3).toString('hex').toUpperCase();

            const [bookingResult] = await connection.execute(
                `INSERT INTO bookings
                    (
                        booking_reference,
                        user_id,
                        trip_id,
                        number_of_seats,
                        total_amount,
                        booking_status
                    )
                 VALUES (?, ?, ?, ?, ?, 'confirmed')`,
                [
                    bookingReference,
                    decoded.user_id,
                    tripId,
                    seatNumbers.length,
                    totalAmount
                ]
            );

            const bookingId = bookingResult.insertId;

            for (const seatNumber of seatNumbers) {
                await connection.execute(
                    `INSERT INTO booking_seats
                        (booking_id, trip_id, seat_number, seat_status)
                     VALUES (?, ?, ?, 'booked')`,
                    [bookingId, tripId, seatNumber]
                );
            }

            await connection.commit();

            return sendJson(res, 201, {
                success: true,
                message: 'Booking confirmed successfully!',
                booking: {
                    booking_id: bookingId,
                    booking_reference: bookingReference,
                    trip_id: tripId,
                    seat_numbers: seatNumbers,
                    number_of_seats: seatNumbers.length,
                    fare_per_seat: fare,
                    total_amount: totalAmount,
                    booking_status: 'confirmed'
                }
            });

        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        'Rollback error:',
                        rollbackError.message
                    );
                }
            }

            console.error('Booking error:', error);

            if (error.message === 'Invalid JSON') {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Invalid JSON request'
                });
            }

            if (error.code === 'ER_DUP_ENTRY') {
                return sendJson(res, 409, {
                    success: false,
                    message: 'One or more selected seats have already been booked'
                });
            }

            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Invalid passenger, trip or booking reference'
                });
            }

            return sendJson(res, 500, {
                success: false,
                message: 'Booking failed. Please try again.'
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    // ======================================
    // PASSENGER BOOKING HISTORY
    // GET /api/passenger/bookings
    // ======================================

    if (
        pathname === '/api/passenger/bookings' &&
        req.method === 'GET'
    ) {
        try {
            const decoded = authenticatePassenger(req);

            if (!decoded) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Unauthorized. Please login again.'
                });
            }

            const [bookingRows] = await pool.execute(
                `SELECT
                    b.booking_id,
                    b.booking_reference,
                    b.trip_id,
                    b.number_of_seats,
                    b.total_amount,
                    b.booking_status,
                    b.booked_at,
                    b.cancelled_at,
                    t.departure_datetime,
                    t.arrival_datetime,
                    t.fare_per_seat,
                    t.trip_status,
                    r.route_name,
                    r.origin,
                    r.destination,
                    v.vehicle_model,
                    v.registration_number
                 FROM bookings b
                 INNER JOIN trips t
                    ON t.trip_id = b.trip_id
                 INNER JOIN routes r
                    ON r.route_id = t.route_id
                 INNER JOIN vehicles v
                    ON v.vehicle_id = t.vehicle_id
                 WHERE b.user_id = ?
                 ORDER BY b.booked_at DESC`,
                [decoded.user_id]
            );

            if (bookingRows.length === 0) {
                return sendJson(res, 200, {
                    success: true,
                    total_bookings: 0,
                    bookings: []
                });
            }

            const bookingIds = bookingRows.map(
                booking => booking.booking_id
            );

            const placeholders = bookingIds.map(
                () => '?'
            ).join(',');

            const [seatRows] = await pool.execute(
                `SELECT
                    booking_id,
                    seat_number,
                    seat_status
                 FROM booking_seats
                 WHERE booking_id IN (${placeholders})
                 ORDER BY booking_id, CAST(seat_number AS UNSIGNED)`,
                bookingIds
            );

            const seatsByBooking = new Map();

            for (const seat of seatRows) {
                if (!seatsByBooking.has(seat.booking_id)) {
                    seatsByBooking.set(seat.booking_id, []);
                }

                seatsByBooking.get(seat.booking_id).push({
                    seat_number: seat.seat_number,
                    seat_status: seat.seat_status
                });
            }

            const bookings = bookingRows.map(booking => ({
                ...booking,
                number_of_seats: Number(booking.number_of_seats),
                total_amount: Number(booking.total_amount),
                fare_per_seat: Number(booking.fare_per_seat),
                seats: seatsByBooking.get(booking.booking_id) || []
            }));

            return sendJson(res, 200, {
                success: true,
                message: 'Booking history retrieved successfully',
                total_bookings: bookings.length,
                bookings
            });

        } catch (error) {
            console.error('Booking history error:', error);

            return sendJson(res, 500, {
                success: false,
                message: 'Unable to retrieve booking history'
            });
        }
    }

    // ======================================
    // PROTECTED PASSENGER PROFILE
    // GET /api/passenger/profile
    // ======================================

    if (
        pathname === '/api/passenger/profile' &&
        req.method === 'GET'
    ) {
        try {
            const decoded = authenticatePassenger(req);

            if (!decoded) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Unauthorized. Please login again.'
                });
            }

            const [rows] = await pool.execute(
                `SELECT
                    user_id,
                    full_name,
                    email,
                    phone,
                    account_role
                 FROM users
                 WHERE user_id = ?
                   AND account_role = 'passenger'
                   AND is_active = 1`,
                [decoded.user_id]
            );

            if (rows.length === 0) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Passenger account not found or inactive'
                });
            }

            return sendJson(res, 200, {
                success: true,
                message: 'Passenger profile retrieved successfully',
                user: rows[0]
            });

        } catch (error) {
            console.error('Profile error:', error);

            return sendJson(res, 500, {
                success: false,
                message: 'Unable to retrieve passenger profile'
            });
        }
    }

    // ======================================
    // UNKNOWN ROUTE
    // ======================================

    return sendJson(res, 404, {
        success: false,
        message: 'Route not found'
    });
});

// ==========================================
// 5. START BACKEND SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(
        `ShuttleConnect running at http://localhost:${PORT}`
    );
});
