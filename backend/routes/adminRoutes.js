
"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

async function authenticateAdmin(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    try {
        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (
            decoded.account_role !== "admin" ||
            !decoded.user_id
        ) {
            return null;
        }

        const [rows] = await pool.execute(
            `SELECT user_id, full_name, email, account_role
             FROM users
             WHERE user_id = ?
               AND account_role = 'admin'
               AND is_active = 1`,
            [decoded.user_id]
        );

        return rows.length ? decoded : null;

    } catch {
        return null;
    }
}

// ==========================================
// ADMIN ROUTE HANDLER
// ==========================================

async function handleAdminRoute(req, res, pathname, helpers) {
    const { readJsonBody, sendJson } = helpers;

    try {

        // ==================================
        // ADMIN LOGIN
        // POST /api/admin/login
        // ==================================

        if (
            pathname === "/api/admin/login" &&
            req.method === "POST"
        ) {
            const data = await readJsonBody(req);

            const email = String(data.email || "")
                .trim()
                .toLowerCase();

            const password = String(data.password || "");

            if (!email || !password) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Email and password are required."
                });
            }

            const [users] = await pool.execute(
                `SELECT
                    user_id,
                    full_name,
                    email,
                    password_hash,
                    account_role,
                    is_active
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [email]
            );

            if (
                users.length === 0 ||
                users[0].account_role !== "admin" ||
                Number(users[0].is_active) !== 1
            ) {
                return sendJson(res, 401, {
                    success: false,
                    message: "Invalid administrator credentials."
                });
            }

            const admin = users[0];

            const passwordMatches = await bcrypt.compare(
                password,
                admin.password_hash
            );

            if (!passwordMatches) {
                return sendJson(res, 401, {
                    success: false,
                    message: "Invalid administrator credentials."
                });
            }

            const token = jwt.sign(
                {
                    user_id: admin.user_id,
                    account_role: "admin"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRES_IN || "1d"
                }
            );

            return sendJson(res, 200, {
                success: true,
                message: "Administrator login successful.",
                token,
                user: {
                    user_id: admin.user_id,
                    full_name: admin.full_name,
                    email: admin.email,
                    account_role: admin.account_role
                }
            });
        }

        // ==================================
        // ADMIN AUTHORIZATION
        // All other endpoints require admin.
        // ==================================

        const admin = await authenticateAdmin(req);

        if (!admin) {
            return sendJson(res, 401, {
                success: false,
                message: "Unauthorized. Administrator login is required."
            });
        }

        // ==================================
        // ADMIN DASHBOARD STATISTICS
        // GET /api/admin/dashboard
        // ==================================

        if (
            pathname === "/api/admin/dashboard" &&
            req.method === "GET"
        ) {
            const [
                [tripRows],
                [routeRows],
                [vehicleRows],
                [bookingRows],
                [passengerRows],
                [upcomingRows]
            ] = await Promise.all([
                pool.query(
                    "SELECT COUNT(*) AS total FROM trips"
                ),

                pool.query(
                    "SELECT COUNT(*) AS total FROM routes WHERE is_active = 1"
                ),

                pool.query(
                    "SELECT COUNT(*) AS total FROM vehicles WHERE vehicle_status = 'active'"
                ),

                pool.query(
                    "SELECT COUNT(*) AS total FROM bookings WHERE booking_status = 'confirmed'"
                ),

                pool.query(
                    "SELECT COUNT(*) AS total FROM users WHERE account_role = 'passenger' AND is_active = 1"
                ),

                pool.query(
                    `SELECT
                        t.trip_id,
                        r.origin,
                        r.destination,
                        t.departure_datetime,
                        t.trip_status,
                        v.registration_number
                     FROM trips t
                     INNER JOIN routes r ON r.route_id = t.route_id
                     INNER JOIN vehicles v ON v.vehicle_id = t.vehicle_id
                     WHERE t.departure_datetime >= NOW()
                       AND t.trip_status IN ('scheduled', 'boarding')
                     ORDER BY t.departure_datetime ASC
                     LIMIT 10`
                )
            ]);

            return sendJson(res, 200, {
                success: true,

                statistics: {
                    total_trips: Number(tripRows[0].total),
                    active_routes: Number(routeRows[0].total),
                    active_vehicles: Number(vehicleRows[0].total),
                    confirmed_bookings: Number(bookingRows[0].total),
                    active_passengers: Number(passengerRows[0].total)
                },

                upcoming_trips: upcomingRows
            });
        }

        // ==================================
        // ROUTE MANAGEMENT
        // ==================================

        // GET ALL ROUTES

        if (
            pathname === "/api/admin/routes" &&
            req.method === "GET"
        ) {
            const [rows] = await pool.query(
                `SELECT *
                 FROM routes
                 ORDER BY route_id DESC`
            );

            return sendJson(res, 200, {
                success: true,
                total: rows.length,
                routes: rows
            });
        }

        // CREATE ROUTE

        if (
            pathname === "/api/admin/routes" &&
            req.method === "POST"
        ) {
            const data = await readJsonBody(req);

            const routeName = String(data.route_name || "").trim();
            const origin = String(data.origin || "").trim();
            const destination = String(data.destination || "").trim();

            if (
                !routeName ||
                !origin ||
                !destination ||
                origin.toLowerCase() === destination.toLowerCase()
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Enter a route name, different origin and destination."
                });
            }

            const distance =
                data.distance_km === undefined ||
                data.distance_km === null ||
                data.distance_km === ""
                    ? null
                    : Number(data.distance_km);

            const duration =
                data.estimated_duration_minutes === undefined ||
                data.estimated_duration_minutes === null ||
                data.estimated_duration_minutes === ""
                    ? null
                    : Number(data.estimated_duration_minutes);

            if (
                (distance !== null &&
                    (!Number.isFinite(distance) || distance <= 0)) ||
                (duration !== null &&
                    (!Number.isSafeInteger(duration) || duration <= 0))
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Distance and duration must be positive values."
                });
            }

            const [result] = await pool.execute(
                `INSERT INTO routes
                    (route_name, origin, destination, distance_km,
                     estimated_duration_minutes, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [routeName, origin, destination, distance, duration]
            );

            return sendJson(res, 201, {
                success: true,
                message: "Route created successfully.",
                route_id: result.insertId
            });
        }

        // UPDATE ROUTE

        const routeMatch = pathname.match(
            /^\/api\/admin\/routes\/(\d+)$/
        );

        if (routeMatch && req.method === "PATCH") {
            const routeId = Number(routeMatch[1]);
            const data = await readJsonBody(req);

            const allowed = [
                "route_name",
                "origin",
                "destination",
                "distance_km",
                "estimated_duration_minutes",
                "is_active"
            ];

            const updates = [];
            const values = [];

            for (const field of allowed) {
                if (Object.prototype.hasOwnProperty.call(data, field)) {
                    updates.push(`${field} = ?`);
                    values.push(data[field]);
                }
            }

            if (updates.length === 0) {
                return sendJson(res, 400, {
                    success: false,
                    message: "No valid route fields were supplied."
                });
            }

            if (
                data.is_active !== undefined &&
                ![0, 1, true, false].includes(data.is_active)
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "is_active must be 0 or 1."
                });
            }

            values.push(routeId);

            const [result] = await pool.execute(
                `UPDATE routes
                 SET ${updates.join(", ")}
                 WHERE route_id = ?`,
                values
            );

            if (!result.affectedRows) {
                return sendJson(res, 404, {
                    success: false,
                    message: "Route not found."
                });
            }

            return sendJson(res, 200, {
                success: true,
                message: "Route updated successfully."
            });
        }

        // ==================================
        // VEHICLE MANAGEMENT
        // ==================================

        // GET ALL VEHICLES

        if (
            pathname === "/api/admin/vehicles" &&
            req.method === "GET"
        ) {
            const [rows] = await pool.query(
                `SELECT *
                 FROM vehicles
                 ORDER BY vehicle_id DESC`
            );

            return sendJson(res, 200, {
                success: true,
                total: rows.length,
                vehicles: rows
            });
        }

        // ADD VEHICLE

        if (
            pathname === "/api/admin/vehicles" &&
            req.method === "POST"
        ) {
            const data = await readJsonBody(req);

            const registration = String(
                data.registration_number || ""
            ).trim().toUpperCase();

            const model = String(
                data.vehicle_model || ""
            ).trim();

            const capacity = Number(data.seating_capacity);

            if (
                !registration ||
                !model ||
                !Number.isSafeInteger(capacity) ||
                capacity < 1 ||
                capacity > 100
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Enter a registration number, vehicle model and valid capacity (1–100)."
                });
            }

            const status = data.vehicle_status || "active";

            if (!["active", "maintenance", "inactive"].includes(status)) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Invalid vehicle status."
                });
            }

            const [result] = await pool.execute(
                `INSERT INTO vehicles
                    (registration_number, vehicle_model,
                     seating_capacity, vehicle_status)
                 VALUES (?, ?, ?, ?)`,
                [registration, model, capacity, status]
            );

            return sendJson(res, 201, {
                success: true,
                message: "Vehicle added successfully.",
                vehicle_id: result.insertId
            });
        }

        // UPDATE VEHICLE

        const vehicleMatch = pathname.match(
            /^\/api\/admin\/vehicles\/(\d+)$/
        );

        if (vehicleMatch && req.method === "PATCH") {
            const vehicleId = Number(vehicleMatch[1]);
            const data = await readJsonBody(req);

            const allowed = [
                "registration_number",
                "vehicle_model",
                "seating_capacity",
                "vehicle_status"
            ];

            const updates = [];
            const values = [];

            for (const field of allowed) {
                if (Object.prototype.hasOwnProperty.call(data, field)) {
                    updates.push(`${field} = ?`);

                    values.push(
                        field === "registration_number"
                            ? String(data[field]).trim().toUpperCase()
                            : data[field]
                    );
                }
            }

            if (updates.length === 0) {
                return sendJson(res, 400, {
                    success: false,
                    message: "No valid vehicle fields were supplied."
                });
            }

            if (
                data.seating_capacity !== undefined &&
                (!Number.isSafeInteger(Number(data.seating_capacity)) ||
                    Number(data.seating_capacity) < 1 ||
                    Number(data.seating_capacity) > 100)
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Invalid seating capacity."
                });
            }

            if (
                data.vehicle_status !== undefined &&
                !["active", "maintenance", "inactive"].includes(data.vehicle_status)
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Invalid vehicle status."
                });
            }

            values.push(vehicleId);

            const [result] = await pool.execute(
                `UPDATE vehicles
                 SET ${updates.join(", ")}
                 WHERE vehicle_id = ?`,
                values
            );

            if (!result.affectedRows) {
                return sendJson(res, 404, {
                    success: false,
                    message: "Vehicle not found."
                });
            }

            return sendJson(res, 200, {
                success: true,
                message: "Vehicle updated successfully."
            });
        }

        // ==================================
        // TRIP / SCHEDULE MANAGEMENT
        // ==================================

        // GET ALL TRIPS

        if (
            pathname === "/api/admin/trips" &&
            req.method === "GET"
        ) {
            const [rows] = await pool.query(
                `SELECT
                    t.trip_id,
                    t.route_id,
                    t.vehicle_id,
                    t.departure_datetime,
                    t.arrival_datetime,
                    t.fare_per_seat,
                    t.trip_status,
                    r.route_name,
                    r.origin,
                    r.destination,
                    v.registration_number,
                    v.vehicle_model,
                    v.seating_capacity
                 FROM trips t
                 INNER JOIN routes r ON r.route_id = t.route_id
                 INNER JOIN vehicles v ON v.vehicle_id = t.vehicle_id
                 ORDER BY t.departure_datetime DESC`
            );

            return sendJson(res, 200, {
                success: true,
                total: rows.length,
                trips: rows
            });
        }

        // CREATE TRIP

        if (
            pathname === "/api/admin/trips" &&
            req.method === "POST"
        ) {
            const data = await readJsonBody(req);

            const routeId = Number(data.route_id);
            const vehicleId = Number(data.vehicle_id);
            const fare = Number(data.fare_per_seat);

            const departure = data.departure_datetime;
            const arrival = data.arrival_datetime;

            if (
                !Number.isSafeInteger(routeId) || routeId <= 0 ||
                !Number.isSafeInteger(vehicleId) || vehicleId <= 0 ||
                !departure ||
                !arrival ||
                !Number.isFinite(Date.parse(departure)) ||
                !Number.isFinite(Date.parse(arrival)) ||
                Date.parse(arrival) <= Date.parse(departure) ||
                !Number.isFinite(fare) || fare < 0
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Provide valid route, vehicle, departure, arrival and fare details."
                });
            }

            const [routes] = await pool.execute(
                `SELECT route_id
                 FROM routes
                 WHERE route_id = ? AND is_active = 1`,
                [routeId]
            );

            const [vehicles] = await pool.execute(
                `SELECT vehicle_id
                 FROM vehicles
                 WHERE vehicle_id = ? AND vehicle_status = 'active'`,
                [vehicleId]
            );

            if (!routes.length || !vehicles.length) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Select an active route and active vehicle."
                });
            }

            const [result] = await pool.execute(
                `INSERT INTO trips
                    (route_id, vehicle_id, departure_datetime,
                     arrival_datetime, fare_per_seat, trip_status)
                 VALUES (?, ?, ?, ?, ?, 'scheduled')`,
                [routeId, vehicleId, departure, arrival, fare]
            );

            return sendJson(res, 201, {
                success: true,
                message: "Trip scheduled successfully.",
                trip_id: result.insertId
            });
        }

        // UPDATE TRIP

        const tripMatch = pathname.match(
            /^\/api\/admin\/trips\/(\d+)$/
        );

        if (tripMatch && req.method === "PATCH") {
            const tripId = Number(tripMatch[1]);
            const data = await readJsonBody(req);

            const allowed = [
                "departure_datetime",
                "arrival_datetime",
                "fare_per_seat",
                "trip_status"
            ];

            const updates = [];
            const values = [];

            for (const field of allowed) {
                if (Object.prototype.hasOwnProperty.call(data, field)) {
                    updates.push(`${field} = ?`);
                    values.push(data[field]);
                }
            }

            if (updates.length === 0) {
                return sendJson(res, 400, {
                    success: false,
                    message: "No valid trip fields were supplied."
                });
            }

            if (
                data.trip_status !== undefined &&
                !["scheduled", "boarding", "in_progress", "completed", "cancelled"].includes(data.trip_status)
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Invalid trip status."
                });
            }

            if (
                data.fare_per_seat !== undefined &&
                (!Number.isFinite(Number(data.fare_per_seat)) ||
                    Number(data.fare_per_seat) < 0)
            ) {
                return sendJson(res, 400, {
                    success: false,
                    message: "Invalid trip fare."
                });
            }

            values.push(tripId);

            const [result] = await pool.execute(
                `UPDATE trips
                 SET ${updates.join(", ")}
                 WHERE trip_id = ?`,
                values
            );

            if (!result.affectedRows) {
                return sendJson(res, 404, {
                    success: false,
                    message: "Trip not found."
                });
            }

            return sendJson(res, 200, {
                success: true,
                message: "Trip updated successfully."
            });
        }

        // ==================================
        // BOOKING MANAGEMENT
        // GET /api/admin/bookings
        // ==================================

        if (
            pathname === "/api/admin/bookings" &&
            req.method === "GET"
        ) {
            const [rows] = await pool.query(
                `SELECT
                    b.booking_id,
                    b.booking_reference,
                    b.user_id,
                    b.trip_id,
                    b.number_of_seats,
                    b.total_amount,
                    b.booking_status,
                    b.booked_at,
                    b.cancelled_at,

                    u.full_name AS passenger_name,
                    u.email AS passenger_email,
                    u.phone AS passenger_phone,

                    r.origin,
                    r.destination,

                    t.departure_datetime,
                    t.arrival_datetime,

                    v.registration_number,

                    bt.ticket_code,
                    bt.ticket_status,

                    GROUP_CONCAT(
                        DISTINCT CASE
                            WHEN bs.seat_status = 'booked'
                            THEN bs.seat_number
                        END
                        ORDER BY bs.seat_number
                        SEPARATOR ', '
                    ) AS seat_numbers

                 FROM bookings b

                 INNER JOIN users u
                    ON u.user_id = b.user_id

                 INNER JOIN trips t
                    ON t.trip_id = b.trip_id

                 INNER JOIN routes r
                    ON r.route_id = t.route_id

                 INNER JOIN vehicles v
                    ON v.vehicle_id = t.vehicle_id

                 LEFT JOIN booking_seats bs
                    ON bs.booking_id = b.booking_id

                 LEFT JOIN boarding_tickets bt
                    ON bt.booking_id = b.booking_id

                 GROUP BY
                    b.booking_id,
                    b.booking_reference,
                    b.user_id,
                    b.trip_id,
                    b.number_of_seats,
                    b.total_amount,
                    b.booking_status,
                    b.booked_at,
                    b.cancelled_at,
                    u.full_name,
                    u.email,
                    u.phone,
                    r.origin,
                    r.destination,
                    t.departure_datetime,
                    t.arrival_datetime,
                    v.registration_number,
                    bt.ticket_code,
                    bt.ticket_status

                 ORDER BY b.booked_at DESC`
            );

            return sendJson(res, 200, {
                success: true,
                total: rows.length,
                bookings: rows
            });
        }

        // ==================================
        // PASSENGER MANAGEMENT
        // GET /api/admin/passengers
        // ==================================

        if (
            pathname === "/api/admin/passengers" &&
            req.method === "GET"
        ) {
            const [rows] = await pool.query(
                `SELECT
                    u.user_id,
                    u.full_name,
                    u.email,
                    u.phone,
                    u.is_active,
                    u.created_at,

                    COUNT(b.booking_id) AS total_bookings,

                    SUM(
                        CASE
                            WHEN b.booking_status = 'confirmed'
                            THEN 1
                            ELSE 0
                        END
                    ) AS confirmed_bookings,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN b.booking_status = 'confirmed'
                                THEN b.total_amount
                                ELSE 0
                            END
                        ),
                        0
                    ) AS total_spent

                 FROM users u

                 LEFT JOIN bookings b
                    ON b.user_id = u.user_id

                 WHERE u.account_role = 'passenger'

                 GROUP BY
                    u.user_id,
                    u.full_name,
                    u.email,
                    u.phone,
                    u.is_active,
                    u.created_at

                 ORDER BY u.user_id DESC`
            );

            return sendJson(res, 200, {
                success: true,
                total: rows.length,
                passengers: rows
            });
        }


        // ==================================
        // CAPTAIN APPLICATION REVIEW
        // ==================================

        if (pathname === "/api/admin/captain-applications" && req.method === "GET") {
            const requestUrl = new URL(req.url, "http://localhost");
            const status = requestUrl.searchParams.get("status") || "pending";
            const allowed = ["pending", "approved", "rejected", "all"];
            if (!allowed.includes(status)) {
                return sendJson(res, 400, {success:false,message:"Invalid application status filter."});
            }
            const where = status === "all" ? "" : "WHERE application_status = ?";
            const params = status === "all" ? [] : [status];
            const [rows] = await pool.execute(
                `SELECT application_id,full_name,email,phone,address,vehicle_category,
                        vehicle_registration,vehicle_model,vehicle_year,licence_number,
                        licence_expiry,application_status,
                        rejection_reason,created_at
                 FROM captain_applications ${where}
                 ORDER BY CASE WHEN application_status='pending' THEN 0 ELSE 1 END, created_at DESC`,
                params
            );
            return sendJson(res,200,{success:true,total:rows.length,applications:rows});
        }

        const captainApplicationParts = pathname.split("/");
        const captainApplicationIdPart = captainApplicationParts[4];
        const captainApplicationAction = captainApplicationParts[5];
        const isCaptainApplicationAction =
            captainApplicationParts.length === 6 &&
            captainApplicationParts[1] === "api" &&
            captainApplicationParts[2] === "admin" &&
            captainApplicationParts[3] === "captain-applications" &&
            /^[0-9]+$/.test(captainApplicationIdPart || "") &&
            ["approve", "reject"].includes(captainApplicationAction);

        if (isCaptainApplicationAction && req.method === "POST") {
            const applicationId = Number(captainApplicationIdPart);
            const action = captainApplicationAction;
            if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
                return sendJson(res,400,{success:false,message:"Invalid captain application ID."});
            }

            let reason = null;
            if (action === "reject") {
                const data = await readJsonBody(req);
                reason = String(data.rejection_reason || "").trim();
                if (!reason || reason.length > 500) {
                    return sendJson(res,400,{success:false,message:"Provide a rejection reason (maximum 500 characters)."});
                }
            }

            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const [rows] = await connection.execute(
                    "SELECT application_id,application_status FROM captain_applications WHERE application_id=? FOR UPDATE",
                    [applicationId]
                );
                if (!rows.length) {
                    await connection.rollback();
                    return sendJson(res,404,{success:false,message:"Captain application not found."});
                }
                if (rows[0].application_status !== "pending") {
                    await connection.rollback();
                    return sendJson(res,409,{success:false,message:"Only pending applications can be reviewed."});
                }

                if (action === "approve") {
                    await connection.execute(
                        `UPDATE captain_applications
                         SET application_status='approved',
                             reviewed_by=?,
                             reviewed_at=NOW(),
                             rejection_reason=NULL
                         WHERE application_id=?`,
                        [admin.user_id, applicationId]
                    );
                } else {
                    await connection.execute(
                        `UPDATE captain_applications
                         SET application_status='rejected',
                             reviewed_by=?,
                             reviewed_at=NOW(),
                             rejection_reason=?
                         WHERE application_id=?`,
                        [admin.user_id, reason, applicationId]
                    );
                }
                await connection.commit();
                return sendJson(res,200,{
                    success:true,
                    message: action === "approve"
                        ? "Application approved. Captain account activation is a separate step."
                        : "Captain application rejected successfully."
                });
            } catch(error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        }

        // ==================================
        // UNKNOWN ADMIN ENDPOINT
        // ==================================

        return sendJson(res, 404, {
            success: false,
            message: "Admin API endpoint not found."
        });

    } catch (error) {
        console.error("Admin API error:", error);

        if (error.message === "Invalid JSON") {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid JSON request."
            });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, {
                success: false,
                message: "A record with the same unique value already exists."
            });
        }

        if (error.code === "ER_NO_REFERENCED_ROW_2") {
            return sendJson(res, 400, {
                success: false,
                message: "The selected route or vehicle does not exist."
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: "Admin operation failed. Please try again."
        });
    }
}

module.exports = handleAdminRoute;
