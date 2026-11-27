
"use strict";

const pool = require("../config/db");

// ==========================================
// SUBMIT CAPTAIN APPLICATION
// POST /api/captain/applications
// ==========================================

async function submitCaptainApplication(req, res, helpers) {
    const { readJsonBody, sendJson } = helpers;

    try {
        const data = await readJsonBody(req);

        // Normalize applicant details
        const fullName = typeof data.full_name === "string"
            ? data.full_name.trim()
            : "";

        const email = typeof data.email === "string"
            ? data.email.trim().toLowerCase()
            : "";

        const phone = typeof data.phone === "string"
            ? data.phone.trim()
            : "";

        const address = typeof data.address === "string"
            ? data.address.trim()
            : "";

        const vehicleCategory = data.vehicle_category;
        
        const vehicleRegistration =
            typeof data.vehicle_registration === "string"
                ? data.vehicle_registration.trim().toUpperCase()
                : "";

        const vehicleModel =
            typeof data.vehicle_model === "string"
                ? data.vehicle_model.trim()
                : "";

        const vehicleYear =
            data.vehicle_year === "" ||
            data.vehicle_year === null ||
            data.vehicle_year === undefined
                ? null
                : Number(data.vehicle_year);

        const licenceNumber =
            typeof data.licence_number === "string"
                ? data.licence_number.trim().toUpperCase()
                : "";

        const licenceExpiry = data.licence_expiry;

        const accepted = value =>
            value === true || value === 1 || value === "1";

        const termsAccepted = accepted(data.terms_accepted);
        const privacyAccepted = accepted(data.privacy_accepted);
        const accuracyConfirmed = accepted(data.accuracy_confirmed);

        // ======================================
        // REQUIRED FIELD VALIDATION
        // ======================================

        if (
            !fullName ||
            !email ||
            !phone ||
            !address ||
            !vehicleCategory ||
            !vehicleRegistration ||
            !vehicleModel ||
            !licenceNumber ||
            !licenceExpiry
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Please provide all required application details."
            });
        }

        if (fullName.length > 100) {
            return sendJson(res, 400, {
                success: false,
                message: "Full name cannot exceed 100 characters."
            });
        }

        if (
            email.length > 150 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Please provide a valid email address."
            });
        }

        if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
            return sendJson(res, 400, {
                success: false,
                message: "Please provide a valid phone number."
            });
        }

        if (address.length > 65535) {
            return sendJson(res, 400, {
                success: false,
                message: "Address is too long."
            });
        }

        // ======================================
        // VEHICLE VALIDATION
        // ======================================

        const allowedCategories = [
            "two_wheeler",
            "auto",
            "car"
        ];

        if (!allowedCategories.includes(vehicleCategory)) {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid vehicle category."
            });
        }

        if (
            vehicleRegistration.length > 30 ||
            vehicleModel.length > 100
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Vehicle registration or model is too long."
            });
        }

        if (
            vehicleYear !== null &&
            (
                !Number.isInteger(vehicleYear) ||
                vehicleYear < 1900 ||
                vehicleYear > new Date().getFullYear() + 1
            )
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Please provide a valid vehicle manufacturing year."
            });
        }

        // ======================================
        // LICENCE VALIDATION
        // ======================================

        if (licenceNumber.length > 50) {
            return sendJson(res, 400, {
                success: false,
                message: "Licence number cannot exceed 50 characters."
            });
        }

        if (
            typeof licenceExpiry !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(licenceExpiry)
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Licence expiry must be a valid date in YYYY-MM-DD format."
            });
        }

        const expiryDate = new Date(
            `${licenceExpiry}T00:00:00Z`
        );

        if (
            Number.isNaN(expiryDate.getTime()) ||
            expiryDate.toISOString().slice(0, 10) !== licenceExpiry
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Please provide a valid licence expiry date."
            });
        }

        // ======================================
        // CONSENT VALIDATION
        // ======================================

        if (
            !termsAccepted ||
            !privacyAccepted ||
            !accuracyConfirmed
        ) {
            return sendJson(res, 400, {
                success: false,
                message: "Please accept all required declarations before submitting."
            });
        }

        // ======================================
        // SAVE APPLICATION
        // ======================================

        const [result] = await pool.execute(
            `INSERT INTO captain_applications
                (
                    full_name,
                    email,
                    phone,
                    address,
                    vehicle_category,
                    vehicle_registration,
                    vehicle_model,
                    vehicle_year,
                    licence_number,
                    licence_expiry,
                    terms_accepted,
                    privacy_accepted,
                    accuracy_confirmed,
                    application_status
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                fullName,
                email,
                phone,
                address,
                vehicleCategory,
                vehicleRegistration,
                vehicleModel,
                vehicleYear,
                licenceNumber,
                licenceExpiry,
                1,
                1,
                1
            ]
        );

        return sendJson(res, 201, {
            success: true,
            message: "Captain application submitted successfully. Your application is pending admin review.",
            application: {
                application_id: result.insertId,
                full_name: fullName,
                email,
                application_status: "pending"
            }
        });

    } catch (error) {
        console.error("Captain application submission error:", error);

        if (error.message === "Invalid JSON") {
            return sendJson(res, 400, {
                success: false,
                message: "Invalid JSON request."
            });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, {
                success: false,
                message: "An application with this email or phone number already exists."
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: "Unable to submit captain application. Please try again."
        });
    }
}

module.exports = {
    submitCaptainApplication
};
