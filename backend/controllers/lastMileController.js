
const crypto = require('crypto');
const https = require('https');
const pool = require('../config/db');

// ==========================================
// FARE CONFIGURATION
// Demonstration rates in INR.
// ==========================================

const FARE_RATES = {
    two_wheeler: {
        baseFare: 20,
        perKm: 8
    },
    auto: {
        baseFare: 30,
        perKm: 15
    },
    car: {
        baseFare: 50,
        perKm: 20
    }
};

// ==========================================
// GET ROAD DISTANCE AND DURATION USING OSRM
// Coordinates must be supplied as:
// longitude,latitude
// ==========================================

function getRoadRoute(pickup, dropoff) {
    return new Promise((resolve, reject) => {
        const coordinates =
            `${pickup.longitude},${pickup.latitude};` +
            `${dropoff.longitude},${dropoff.latitude}`;

        const url =
            `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

        const request = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'ShuttleConnect/1.0'
                }
            },
            response => {
                let body = '';

                response.on('data', chunk => {
                    body += chunk;
                });

                response.on('end', () => {
                    try {
                        if (response.statusCode !== 200) {
                            return reject(
                                new Error('Routing service is unavailable')
                            );
                        }

                        const result = JSON.parse(body);

                        if (
                            result.code !== 'Ok' ||
                            !Array.isArray(result.routes) ||
                            !result.routes.length
                        ) {
                            return reject(
                                new Error('No road route found between the selected locations')
                            );
                        }

                        const route = result.routes[0];

                        resolve({
                            distanceKm: route.distance / 1000,
                            durationMinutes: route.duration / 60
                        });

                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        request.setTimeout(12000, () => {
            request.destroy(
                new Error('Routing service request timed out')
            );
        });

        request.on('error', reject);
    });
}

// ==========================================
// CALCULATE ESTIMATED FARE
// ==========================================

function calculateFare(distanceKm, transportType) {
    const rate = FARE_RATES[transportType];

    if (!rate) {
        throw new Error('Invalid transport type');
    }

    const fare =
        rate.baseFare + (distanceKm * rate.perKm);

    return Math.round(fare * 100) / 100;
}

// ==========================================
// COORDINATE VALIDATION
// ==========================================

function validateCoordinate(value, min, max) {
    if (
        value === undefined ||
        value === null ||
        value === ''
    ) {
        return null;
    }

    const number = Number(value);

    if (
        !Number.isFinite(number) ||
        number < min ||
        number > max
    ) {
        return undefined;
    }

    return number;
}

// ==========================================
// CREATE PASSENGER LAST-MILE RIDE REQUEST
// POST /api/passenger/last-mile/rides
// ==========================================

async function createPassengerRideRequest(req, res, helpers) {
    let connection;

    try {
        const {
            readJsonBody,
            sendJson,
            authenticatePassenger
        } = helpers;

        // 1. Authenticate passenger

        const decoded = authenticatePassenger(req);

        if (!decoded) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please login to request a last-mile ride'
            });
        }

        // 2. Read request body

        const data = await readJsonBody(req);

        const bookingId = Number(data.shuttle_booking_id);

        const transportType =
            String(data.transport_type || '').trim();

        const pickupAddress =
            String(data.pickup_address || '').trim();

        const dropoffAddress =
            String(data.dropoff_address || '').trim();

        // 3. Validate shuttle booking ID

        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'A valid shuttle booking ID is required'
            });
        }

        // 4. Validate transport type

        if (!Object.prototype.hasOwnProperty.call(
            FARE_RATES,
            transportType
        )) {
            return sendJson(res, 400, {
                success: false,
                message: 'Select a valid transport type'
            });
        }

        // 5. Validate addresses

        if (
            !pickupAddress ||
            pickupAddress.length > 500 ||
            !dropoffAddress ||
            dropoffAddress.length > 500
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'Valid pickup and drop-off addresses are required (maximum 500 characters each)'
            });
        }

        // 6. Validate coordinates

        const pickupLatitude = validateCoordinate(
            data.pickup_latitude,
            -90,
            90
        );

        const pickupLongitude = validateCoordinate(
            data.pickup_longitude,
            -180,
            180
        );

        const dropoffLatitude = validateCoordinate(
            data.dropoff_latitude,
            -90,
            90
        );

        const dropoffLongitude = validateCoordinate(
            data.dropoff_longitude,
            -180,
            180
        );

        if (
            pickupLatitude === undefined ||
            pickupLongitude === undefined ||
            dropoffLatitude === undefined ||
            dropoffLongitude === undefined
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'One or more coordinates are invalid'
            });
        }

        // Both pickup and destination coordinates are
        // required for road-distance and fare calculation.

        if (
            pickupLatitude === null ||
            pickupLongitude === null ||
            dropoffLatitude === null ||
            dropoffLongitude === null
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'Please select valid pickup and destination locations'
            });
        }

        // 7. Calculate road distance and travel duration
        // before opening the database transaction.

        let route;

        try {
            route = await getRoadRoute(
                {
                    latitude: pickupLatitude,
                    longitude: pickupLongitude
                },
                {
                    latitude: dropoffLatitude,
                    longitude: dropoffLongitude
                }
            );

        } catch (routeError) {
            console.error(
                'Last-mile routing error:',
                routeError
            );

            return sendJson(res, 503, {
                success: false,
                message: 'Unable to calculate the route right now. Please try again.'
            });
        }

        const estimatedFare = calculateFare(
            route.distanceKm,
            transportType
        );

        // 8. Begin database transaction

        connection = await pool.getConnection();

        await connection.beginTransaction();

        // Lock the shuttle booking row.
        // This serializes simultaneous ride requests
        // linked to the same shuttle booking.

        const [bookingRows] = await connection.execute(
            `SELECT
                b.booking_id,
                b.booking_reference,
                b.user_id,
                b.booking_status,
                u.account_role,
                u.is_active
             FROM bookings b
             INNER JOIN users u
                ON u.user_id = b.user_id
             WHERE b.booking_id = ?
               AND b.user_id = ?
             FOR UPDATE`,
            [
                bookingId,
                decoded.user_id
            ]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Shuttle booking not found or does not belong to you'
            });
        }

        const booking = bookingRows[0];

        // 9. Validate passenger account

        if (
            booking.account_role !== 'passenger' ||
            Number(booking.is_active) !== 1
        ) {
            await connection.rollback();

            return sendJson(res, 403, {
                success: false,
                message: 'Your passenger account is inactive or unavailable'
            });
        }

        // 10. Validate confirmed shuttle booking

        if (booking.booking_status !== 'confirmed') {
            await connection.rollback();

            return sendJson(res, 400, {
                success: false,
                message: 'A confirmed shuttle booking is required for a last-mile ride'
            });
        }

        // 11. Prevent multiple active rides for the same booking

        const [existingRides] = await connection.execute(
            `SELECT ride_id
             FROM last_mile_bookings
             WHERE shuttle_booking_id = ?
               AND ride_status IN (
                   'requested',
                   'accepted',
                   'captain_en_route',
                   'arrived_at_pickup',
                   'passenger_boarded',
                   'in_progress'
               )
             LIMIT 1`,
            [bookingId]
        );

        if (existingRides.length > 0) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: 'An active last-mile ride already exists for this shuttle booking',
                ride_id: existingRides[0].ride_id
            });
        }

        // 12. Generate unique ride reference

        const rideReference =
            'LM-' +
            Date.now() +
            '-' +
            crypto.randomBytes(4)
                .toString('hex')
                .toUpperCase();

        // 13. Insert ride request and calculated fare

        const [rideResult] = await connection.execute(
            `INSERT INTO last_mile_bookings (
                ride_reference,
                shuttle_booking_id,
                passenger_user_id,
                transport_type,
                pickup_address,
                pickup_latitude,
                pickup_longitude,
                dropoff_address,
                dropoff_latitude,
                dropoff_longitude,
                estimated_fare,
                ride_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')`,
            [
                rideReference,
                bookingId,
                decoded.user_id,
                transportType,
                pickupAddress,
                pickupLatitude,
                pickupLongitude,
                dropoffAddress,
                dropoffLatitude,
                dropoffLongitude,
                estimatedFare
            ]
        );

        const rideId = rideResult.insertId;

        // 14. Record initial ride event

        await connection.execute(
            `INSERT INTO last_mile_events (
                ride_id,
                event_type,
                message
            )
            VALUES (?, ?, ?)`,
            [
                rideId,
                'ride_requested',
                'Passenger requested a last-mile ride'
            ]
        );

        // 15. Commit transaction

        await connection.commit();

        // 16. Return ride details

        return sendJson(res, 201, {
            success: true,
            message: 'Last-mile ride requested successfully',
            ride: {
                ride_id: rideId,
                ride_reference: rideReference,
                shuttle_booking_id: bookingId,
                transport_type: transportType,
                pickup_address: pickupAddress,
                dropoff_address: dropoffAddress,
                distance_km: Number(
                    route.distanceKm.toFixed(2)
                ),
                estimated_duration_minutes: Math.round(
                    route.durationMinutes
                ),
                estimated_fare: estimatedFare,
                ride_status: 'requested'
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    'Last-mile rollback error:',
                    rollbackError
                );
            }
        }

        console.error(
            'Last-mile ride request error:',
            error
        );

        if (error.message === 'Invalid JSON') {
            return helpers.sendJson(res, 400, {
                success: false,
                message: 'Invalid JSON request'
            });
        }

        return helpers.sendJson(res, 500, {
            success: false,
            message: 'Unable to create last-mile ride request'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    createPassengerRideRequest
};
