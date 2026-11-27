"use strict";

const crypto = require("crypto");
const pool = require("../config/db");

// Use the same encryption key as captainRideController.js
function getEncryptionKey() {
    const key = process.env.OTP_ENCRYPTION_KEY;

    if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
        throw new Error("Invalid OTP_ENCRYPTION_KEY configuration.");
    }

    return Buffer.from(key, "hex");
}

// Decrypt the OTP generated when a captain accepts a ride.
function decryptOtp(encryptedValue) {
    if (!encryptedValue) {
        return null;
    }

    const encryptedObject = JSON.parse(encryptedValue);

    if (
        !encryptedObject.iv ||
        !encryptedObject.tag ||
        !encryptedObject.data
    ) {
        throw new Error("Invalid encrypted OTP format.");
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(encryptedObject.iv, "base64")
    );

    decipher.setAuthTag(
        Buffer.from(encryptedObject.tag, "base64")
    );

    const decrypted = Buffer.concat([
        decipher.update(
            Buffer.from(encryptedObject.data, "base64")
        ),
        decipher.final()
    ]);

    return decrypted.toString("utf8");
}

// GET /api/passenger/last-mile/rides
async function getPassengerLastMileRides(req, res, helpers) {
    try {
        // Authenticate the passenger.
        const passenger = helpers.authenticatePassenger(req);

        if (!passenger) {
            return helpers.sendJson(res, 401, {
                success: false,
                message: "Passenger authentication required."
            });
        }

        // Fetch only rides belonging to this passenger.
        // Captain details are included only when a captain is assigned.
        const [rides] = await pool.execute(
            `SELECT
                lmb.ride_id,
                lmb.ride_reference,
                lmb.shuttle_booking_id,
                lmb.transport_type,
                lmb.pickup_address,
                lmb.dropoff_address,
                lmb.estimated_fare,
                lmb.ride_status,
                lmb.requested_at,
                lmb.accepted_at,
                lmb.trip_started_at,

                u.full_name AS captain_name,

                cp.vehicle_registration,
                cp.vehicle_category AS vehicle_type,
                cp.vehicle_model,
                cp.vehicle_color,

                lmb.start_otp_encrypted,
                lmb.start_otp_expires_at,
                lmb.start_otp_used_at

             FROM last_mile_bookings lmb

             LEFT JOIN users u
                ON u.user_id = lmb.captain_user_id

             LEFT JOIN captain_profiles cp
                ON cp.user_id = lmb.captain_user_id

             WHERE lmb.passenger_user_id = ?

             ORDER BY lmb.requested_at DESC
             LIMIT 20`,
            [passenger.user_id]
        );

        // Prepare a safe response.
        const formattedRides = rides.map(ride => {
            let startOtp = null;

            const otpIsValid =
                ride.ride_status === "accepted" &&
                ride.start_otp_encrypted &&
                ride.start_otp_expires_at &&
                !ride.start_otp_used_at &&
                new Date(ride.start_otp_expires_at).getTime() > Date.now();

            if (otpIsValid) {
                try {
                    startOtp = decryptOtp(
                        ride.start_otp_encrypted
                    );
                } catch (error) {
                    console.error(
                        "Passenger OTP decryption error:",
                        error.message
                    );
                }
            }

            return {
                ride_id: ride.ride_id,
                ride_reference: ride.ride_reference,
                shuttle_booking_id: ride.shuttle_booking_id,
                transport_type: ride.transport_type,
                pickup_address: ride.pickup_address,
                dropoff_address: ride.dropoff_address,
                estimated_fare: ride.estimated_fare,
                ride_status: ride.ride_status,
                requested_at: ride.requested_at,
                accepted_at: ride.accepted_at,
                trip_started_at: ride.trip_started_at,

                captain: ride.captain_name
                    ? {
                        name: ride.captain_name,
                        vehicle_registration:
                            ride.vehicle_registration,
                        vehicle_type: ride.vehicle_type,
                        vehicle_model: ride.vehicle_model,
                        vehicle_color: ride.vehicle_color
                    }
                    : null,

                start_otp: startOtp
            };
        });

        return helpers.sendJson(res, 200, {
            success: true,
            rides: formattedRides
        });

    } catch (error) {
        console.error(
            "Get passenger last-mile rides error:",
            error
        );

        return helpers.sendJson(res, 500, {
            success: false,
            message: "Unable to retrieve your last-mile rides."
        });
    }
}

module.exports = {
    getPassengerLastMileRides
};