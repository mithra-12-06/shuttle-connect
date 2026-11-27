
"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// =====================================================
// OTP ENCRYPTION
// =====================================================

function getEncryptionKey() {
    const key = process.env.OTP_ENCRYPTION_KEY;

    if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
        throw new Error("Invalid OTP_ENCRYPTION_KEY configuration.");
    }

    return Buffer.from(key, "hex");
}

function encryptOtp(otp) {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(otp, "utf8"),
        cipher.final()
    ]);

    return JSON.stringify({
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: encrypted.toString("base64")
    });
}

// =====================================================
// CAPTAIN AUTHENTICATION
// =====================================================

async function authenticateCaptain(req) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return { error: "Captain login required.", status: 401 };
    }

    if (!process.env.JWT_SECRET) {
        return { error: "Authentication configuration error.", status: 500 };
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.substring(7).trim(),
            process.env.JWT_SECRET
        );
    } catch {
        return { error: "Invalid or expired captain session.", status: 401 };
    }

    if (
        decoded.account_role !== "captain" ||
        !decoded.user_id ||
        !decoded.captain_id
    ) {
        return { error: "Captain access only.", status: 403 };
    }

    const [rows] = await pool.execute(
        `SELECT
            u.user_id,
            u.full_name,
            u.is_active,
            cp.captain_id,
            cp.vehicle_category,
            cp.availability_status,
            cp.verification_status
         FROM users u
         INNER JOIN captain_profiles cp
            ON cp.user_id = u.user_id
         WHERE u.user_id = ?
           AND cp.captain_id = ?
           AND u.account_role = 'captain'
         LIMIT 1`,
        [decoded.user_id, decoded.captain_id]
    );

    if (!rows.length) {
        return { error: "Captain account not found.", status: 403 };
    }

    const captain = rows[0];

    if (
        Number(captain.is_active) !== 1 ||
        captain.verification_status !== "verified"
    ) {
        return { error: "Your captain account is not approved or active.", status: 403 };
    }

    return { captain };
}

// =====================================================
// GET CAPTAIN RIDES
// GET /api/captain/last-mile/rides
// =====================================================

async function getCaptainRides(req, res, helpers) {
    try {
        const auth = await authenticateCaptain(req);

        if (auth.error) {
            return helpers.sendJson(res, auth.status, {
                success: false,
                message: auth.error
            });
        }

        const captain = auth.captain;

        const [rides] = await pool.execute(
            `SELECT
                ride_id,
                ride_reference,
                transport_type,
                pickup_address,
                dropoff_address,
                estimated_fare,
                ride_status,
                requested_at,
                accepted_at
             FROM last_mile_bookings
             WHERE (
                ride_status = 'requested'
                AND captain_user_id IS NULL
                AND transport_type = ?
             )
             OR (
                captain_user_id = ?
                AND ride_status IN (
                    'accepted',
                    'captain_en_route',
                    'arrived_at_pickup',
                    'passenger_boarded',
                    'in_progress'
                )
             )
             ORDER BY requested_at DESC`,
            [captain.vehicle_category, captain.user_id]
        );

        return helpers.sendJson(res, 200, {
            success: true,
            captain: {
                full_name: captain.full_name,
                availability_status: captain.availability_status,
                vehicle_category: captain.vehicle_category
            },
            rides
        });

    } catch (error) {
        console.error("Get captain rides error:", error);

        return helpers.sendJson(res, 500, {
            success: false,
            message: "Unable to load captain rides."
        });
    }
}

// =====================================================
// ACCEPT RIDE
// POST /api/captain/last-mile/rides/:rideId/accept
// =====================================================

async function acceptCaptainRide(req, res, rideId, helpers) {
    let connection;

    try {
        const auth = await authenticateCaptain(req);

        if (auth.error) {
            return helpers.sendJson(res, auth.status, {
                success: false,
                message: auth.error
            });
        }

        const captain = auth.captain;

        if (!Number.isInteger(rideId) || rideId <= 0) {
            return helpers.sendJson(res, 400, {
                success: false,
                message: "Invalid ride ID."
            });
        }

        // Validate encryption configuration before opening transaction.
        getEncryptionKey();

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Lock captain profile first. This prevents this captain
        // from accepting two rides at the same time.
        const [profileRows] = await connection.execute(
            `SELECT
                availability_status,
                verification_status
             FROM captain_profiles
             WHERE captain_id = ?
             FOR UPDATE`,
            [captain.captain_id]
        );

        if (
            !profileRows.length ||
            profileRows[0].availability_status !== "available" ||
            profileRows[0].verification_status !== "verified"
        ) {
            await connection.rollback();

            return helpers.sendJson(res, 409, {
                success: false,
                message: "You must be an approved, available captain to accept a ride."
            });
        }

        const [rideRows] = await connection.execute(
            `SELECT
                ride_id,
                transport_type,
                ride_status,
                captain_user_id
             FROM last_mile_bookings
             WHERE ride_id = ?
             FOR UPDATE`,
            [rideId]
        );

        if (!rideRows.length) {
            await connection.rollback();

            return helpers.sendJson(res, 404, {
                success: false,
                message: "Ride request not found."
            });
        }

        const ride = rideRows[0];

        if (
            ride.ride_status !== "requested" ||
            ride.captain_user_id !== null
        ) {
            await connection.rollback();

            return helpers.sendJson(res, 409, {
                success: false,
                message: "This ride is no longer available."
            });
        }

        if (ride.transport_type !== captain.vehicle_category) {
            await connection.rollback();

            return helpers.sendJson(res, 403, {
                success: false,
                message: "Your registered vehicle type does not match this ride."
            });
        }

        const otp = String(crypto.randomInt(100000, 1000000));

        const otpHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const encryptedOtp = encryptOtp(otp);

        await connection.execute(
            `UPDATE last_mile_bookings
             SET
                captain_user_id = ?,
                ride_status = 'accepted',
                accepted_at = NOW(),
                start_otp_hash = ?,
                start_otp_encrypted = ?,
                start_otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
                start_otp_attempts = 0,
                start_otp_used_at = NULL
             WHERE ride_id = ?`,
            [captain.user_id, otpHash, encryptedOtp, rideId]
        );

        await connection.execute(
            `UPDATE captain_profiles
             SET availability_status = 'on_ride'
             WHERE captain_id = ?`,
            [captain.captain_id]
        );

        await connection.execute(
            `INSERT INTO last_mile_events
                (ride_id, event_type, message)
             VALUES (?, 'ride_accepted', ?)`,
            [rideId, "Captain accepted the ride request."]
        );

        await connection.commit();

        // Never return the OTP to the captain.
        return helpers.sendJson(res, 200, {
            success: true,
            message: "Ride accepted successfully.",
            ride: {
                ride_id: rideId,
                ride_status: "accepted"
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Accept captain ride error:", error);

        return helpers.sendJson(res, 500, {
            success: false,
            message: "Unable to accept this ride."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// =====================================================
// VERIFY OTP AND START RIDE
// POST /api/captain/last-mile/rides/:rideId/start
// =====================================================

async function startCaptainRide(req, res, rideId, helpers) {
    let connection;

    try {
        const auth = await authenticateCaptain(req);

        if (auth.error) {
            return helpers.sendJson(res, auth.status, {
                success: false,
                message: auth.error
            });
        }

        const captain = auth.captain;
        const data = await helpers.readJsonBody(req);

        const otp = typeof data.otp === "string"
            ? data.otp.trim()
            : "";

        if (!/^\d{6}$/.test(otp)) {
            return helpers.sendJson(res, 400, {
                success: false,
                message: "Enter a valid six-digit OTP."
            });
        }

        if (!Number.isInteger(rideId) || rideId <= 0) {
            return helpers.sendJson(res, 400, {
                success: false,
                message: "Invalid ride ID."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT
                ride_id,
                captain_user_id,
                ride_status,
                start_otp_hash,
                start_otp_expires_at,
                start_otp_attempts,
                start_otp_used_at
             FROM last_mile_bookings
             WHERE ride_id = ?
             FOR UPDATE`,
            [rideId]
        );

        if (!rows.length) {
            await connection.rollback();

            return helpers.sendJson(res, 404, {
                success: false,
                message: "Ride not found."
            });
        }

        const ride = rows[0];

        if (Number(ride.captain_user_id) !== Number(captain.user_id)) {
            await connection.rollback();

            return helpers.sendJson(res, 403, {
                success: false,
                message: "This ride is not assigned to you."
            });
        }

        if (ride.ride_status !== "accepted") {
            await connection.rollback();

            return helpers.sendJson(res, 409, {
                success: false,
                message: "This ride cannot be started in its current status."
            });
        }

        if (ride.start_otp_used_at !== null || !ride.start_otp_hash) {
            await connection.rollback();

            return helpers.sendJson(res, 409, {
                success: false,
                message: "This OTP has already been used or is unavailable."
            });
        }

        if (Number(ride.start_otp_attempts) >= 5) {
            await connection.rollback();

            return helpers.sendJson(res, 429, {
                success: false,
                message: "OTP attempt limit reached."
            });
        }

        const [expiryRows] = await connection.execute(
            `SELECT (start_otp_expires_at > NOW()) AS valid
             FROM last_mile_bookings
             WHERE ride_id = ?`,
            [rideId]
        );

        if (
            !ride.start_otp_expires_at ||
            Number(expiryRows[0].valid) !== 1
        ) {
            await connection.rollback();

            return helpers.sendJson(res, 410, {
                success: false,
                message: "OTP has expired."
            });
        }

        const submittedHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const storedHash = String(ride.start_otp_hash);

        const matches =
            /^[a-fA-F0-9]{64}$/.test(storedHash) &&
            crypto.timingSafeEqual(
                Buffer.from(submittedHash, "hex"),
                Buffer.from(storedHash, "hex")
            );

        if (!matches) {
            await connection.execute(
                `UPDATE last_mile_bookings
                 SET start_otp_attempts = start_otp_attempts + 1
                 WHERE ride_id = ?`,
                [rideId]
            );

            await connection.commit();

            return helpers.sendJson(res, 400, {
                success: false,
                message: "Incorrect OTP."
            });
        }

        await connection.execute(
            `UPDATE last_mile_bookings
             SET
                ride_status = 'in_progress',
                trip_started_at = NOW(),
                start_otp_used_at = NOW(),
                start_otp_hash = NULL,
                start_otp_encrypted = NULL
             WHERE ride_id = ?`,
            [rideId]
        );

        await connection.execute(
            `INSERT INTO last_mile_events
                (ride_id, event_type, message)
             VALUES (?, 'ride_started', ?)`,
            [rideId, "Passenger OTP verified. Ride started."]
        );

        await connection.commit();

        return helpers.sendJson(res, 200, {
            success: true,
            message: "OTP verified. Ride started successfully.",
            ride: {
                ride_id: rideId,
                ride_status: "in_progress"
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Start captain ride error:", error);

        return helpers.sendJson(res, 500, {
            success: false,
            message: "Unable to start the ride."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    getCaptainRides,
    acceptCaptainRide,
    startCaptainRide
};
