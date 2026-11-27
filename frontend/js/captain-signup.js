
document.addEventListener("DOMContentLoaded", function () {

    // =====================================================
    // DOM ELEMENTS
    // =====================================================

    const form = document.getElementById("captainApplicationForm");
    const submitButton = document.getElementById("applicationSubmitButton");
    const applicationMessage = document.getElementById("applicationMessage");

    if (!form || !submitButton || !applicationMessage) {
        console.error("Captain application form elements were not found.");
        return;
    }

    // =====================================================
    // CONFIGURATION
    // =====================================================

    const API_BASE_URL = "http://localhost:3000";

    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    const ALLOWED_EXTENSIONS = [
        "pdf",
        "jpg",
        "jpeg",
        "png"
    ];

    const ALLOWED_MIME_TYPES = [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ];

    // =====================================================
    // FORM FIELDS
    // =====================================================

    const fields = {
        name: document.getElementById("captainName"),
        email: document.getElementById("captainSignupEmail"),
        mobile: document.getElementById("captainMobile"),
        address: document.getElementById("captainAddress"),

        vehicleCategory: document.getElementById("vehicleCategory"),
        vehicleRegistration: document.getElementById("vehicleRegistration"),
        vehicleModel: document.getElementById("vehicleModel"),
        vehicleYear: document.getElementById("vehicleYear"),

        licenceNumber: document.getElementById("licenceNumber"),
        licenceExpiry: document.getElementById("licenceExpiry"),

        terms: document.getElementById("captainTermsAgreement"),
        privacy: document.getElementById("captainPrivacyAgreement"),
        accuracy: document.getElementById("captainAccuracyAgreement")
    };

    // =====================================================
    // DOCUMENT UPLOAD ELEMENTS
    // =====================================================

    const documentUploads = [
        {
            input: document.getElementById("drivingLicenceFile"),
            status: document.getElementById("drivingLicenceFileName"),
            label: "Driving Licence"
        },
        {
            input: document.getElementById("vehicleRcFile"),
            status: document.getElementById("vehicleRcFileName"),
            label: "Vehicle Registration Certificate"
        },
        {
            input: document.getElementById("vehicleInsuranceFile"),
            status: document.getElementById("vehicleInsuranceFileName"),
            label: "Vehicle Insurance"
        }
    ];

    // =====================================================
    // MESSAGE HANDLING
    // =====================================================

    function showMessage(message, type = "info") {
        applicationMessage.textContent = message;
        applicationMessage.className = type;
    }

    function clearMessage() {
        applicationMessage.textContent = "";
        applicationMessage.className = "";
    }

    // =====================================================
    // EMAIL VALIDATION
    // =====================================================

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // =====================================================
    // MOBILE NUMBER VALIDATION
    // =====================================================

    function isValidMobile(mobile) {
        return /^[6-9]\d{9}$/.test(mobile);
    }

    // =====================================================
    // DATE VALIDATION
    // =====================================================

    function isFutureDate(dateValue) {

        if (!dateValue) {
            return false;
        }

        const selectedDate = new Date(dateValue + "T00:00:00");
        const today = new Date();

        today.setHours(0, 0, 0, 0);

        return !Number.isNaN(selectedDate.getTime()) &&
            selectedDate > today;
    }

    // =====================================================
    // FILE SIZE FORMATTING
    // =====================================================

    function formatFileSize(bytes) {

        if (bytes < 1024) {
            return bytes + " bytes";
        }

        if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + " KB";
        }

        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    // =====================================================
    // FILE VALIDATION
    // =====================================================

    function validateFile(file) {

        if (!file) {
            return { valid: true };
        }

        const extension = file.name
            .split(".")
            .pop()
            .toLowerCase();

        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            return {
                valid: false,
                message: "Only PDF, JPG, JPEG and PNG files are allowed."
            };
        }

        if (file.size > MAX_FILE_SIZE) {
            return {
                valid: false,
                message: "File size must not exceed 5 MB."
            };
        }

        if (
            file.type &&
            !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())
        ) {
            return {
                valid: false,
                message: "The selected file type is not supported."
            };
        }

        return { valid: true };
    }

    // =====================================================
    // DOCUMENT SELECTION PREVIEW
    // =====================================================

    function handleDocumentSelection(upload) {

        if (!upload.input || !upload.status) {
            return true;
        }

        const file = upload.input.files[0];

        if (!file) {
            upload.status.textContent = "No file selected";
            upload.status.style.color = "var(--muted)";
            return true;
        }

        const validation = validateFile(file);

        if (!validation.valid) {

            upload.input.value = "";

            upload.status.textContent = validation.message;
            upload.status.style.color = "var(--danger)";

            showMessage(
                upload.label + ": " + validation.message,
                "error"
            );

            return false;
        }

        upload.status.textContent =
            "Selected: " +
            file.name +
            " (" +
            formatFileSize(file.size) +
            ")";

        upload.status.style.color = "var(--success)";

        clearMessage();

        return true;
    }

    documentUploads.forEach(function (upload) {

        if (!upload.input) {
            return;
        }

        upload.input.addEventListener("change", function () {
            handleDocumentSelection(upload);
        });

    });

    // =====================================================
    // CHECK ALL SELECTED DOCUMENTS
    // =====================================================

    function validateAllDocuments() {

        for (const upload of documentUploads) {

            if (!upload.input) {
                continue;
            }

            const file = upload.input.files[0];

            // Documents are optional in this implementation.

            if (!file) {
                continue;
            }

            const validation = validateFile(file);

            if (!validation.valid) {

                showMessage(
                    upload.label + ": " + validation.message,
                    "error"
                );

                if (upload.status) {
                    upload.status.textContent = validation.message;
                    upload.status.style.color = "var(--danger)";
                }

                upload.input.focus();

                return false;
            }
        }

        return true;
    }

    // =====================================================
    // FORM FIELD VALIDATION
    // =====================================================

    function validateForm() {

        clearMessage();

        // Personal information

        if (!fields.name.value.trim()) {
            showMessage("Please enter your full name.", "error");
            fields.name.focus();
            return false;
        }

        if (!isValidEmail(fields.email.value.trim())) {
            showMessage("Please enter a valid email address.", "error");
            fields.email.focus();
            return false;
        }

        if (!isValidMobile(fields.mobile.value.trim())) {
            showMessage(
                "Please enter a valid 10-digit Indian mobile number.",
                "error"
            );
            fields.mobile.focus();
            return false;
        }

        if (!fields.address.value.trim()) {
            showMessage("Please enter your residential address.", "error");
            fields.address.focus();
            return false;
        }

        // Vehicle information

        if (!fields.vehicleCategory.value) {
            showMessage("Please select your vehicle category.", "error");
            fields.vehicleCategory.focus();
            return false;
        }

        if (!fields.vehicleRegistration.value.trim()) {
            showMessage(
                "Please enter your vehicle registration number.",
                "error"
            );
            fields.vehicleRegistration.focus();
            return false;
        }

        if (!fields.vehicleModel.value.trim()) {
            showMessage(
                "Please enter your vehicle make and model.",
                "error"
            );
            fields.vehicleModel.focus();
            return false;
        }

        // Manufacturing year

        if (fields.vehicleYear.value.trim()) {

            const year = Number(fields.vehicleYear.value);
            const currentYear = new Date().getFullYear();

            if (
                !Number.isInteger(year) ||
                year < 1990 ||
                year > currentYear
            ) {
                showMessage(
                    "Please enter a valid vehicle manufacturing year.",
                    "error"
                );
                fields.vehicleYear.focus();
                return false;
            }
        }

        // Driving licence

        if (!fields.licenceNumber.value.trim()) {
            showMessage(
                "Please enter your driving licence number.",
                "error"
            );
            fields.licenceNumber.focus();
            return false;
        }

        if (!fields.licenceExpiry.value) {
            showMessage(
                "Please select your driving licence expiry date.",
                "error"
            );
            fields.licenceExpiry.focus();
            return false;
        }

        if (!isFutureDate(fields.licenceExpiry.value)) {
            showMessage(
                "Your driving licence expiry date must be in the future.",
                "error"
            );
            fields.licenceExpiry.focus();
            return false;
        }

        // Agreements

        if (!fields.terms.checked) {
            showMessage(
                "Please accept the Captain Terms & Conditions.",
                "error"
            );
            fields.terms.focus();
            return false;
        }

        if (!fields.privacy.checked) {
            showMessage(
                "Please accept the Captain Privacy Policy.",
                "error"
            );
            fields.privacy.focus();
            return false;
        }

        if (!fields.accuracy.checked) {
            showMessage(
                "Please confirm that your information is accurate.",
                "error"
            );
            fields.accuracy.focus();
            return false;
        }

        // Documents

        if (!validateAllDocuments()) {
            return false;
        }

        return true;
    }

    // =====================================================
    // BUILD APPLICATION REQUEST
    // =====================================================

    function buildApplicationData() {

        return {
            full_name: fields.name.value.trim(),
            email: fields.email.value.trim().toLowerCase(),
            phone: fields.mobile.value.trim(),
            address: fields.address.value.trim(),

            vehicle_category: fields.vehicleCategory.value,
            vehicle_registration: fields.vehicleRegistration.value
                .trim()
                .toUpperCase(),

            vehicle_model: fields.vehicleModel.value.trim(),

            vehicle_year: fields.vehicleYear.value.trim()
                ? Number(fields.vehicleYear.value)
                : null,

            licence_number: fields.licenceNumber.value
                .trim()
                .toUpperCase(),

            licence_expiry: fields.licenceExpiry.value,

            terms_accepted: fields.terms.checked,
            privacy_accepted: fields.privacy.checked,
            accuracy_confirmed: fields.accuracy.checked
        };
    }

    // =====================================================
    // RESET DOCUMENT STATUS
    // =====================================================

    function resetDocumentStatuses() {

        documentUploads.forEach(function (upload) {

            if (upload.input) {
                upload.input.value = "";
            }

            if (upload.status) {
                upload.status.textContent = "No file selected";
                upload.status.style.color = "var(--muted)";
            }

        });
    }

    // =====================================================
    // CLEAR MESSAGE WHEN USER EDITS FORM
    // =====================================================

    form.addEventListener("input", function () {
        clearMessage();
    });

    form.addEventListener("change", function (event) {

        if (!event.target.matches('input[type="file"]')) {
            clearMessage();
        }

    });

    // =====================================================
    // FORM SUBMISSION - CONNECTED TO BACKEND
    // =====================================================

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (submitButton.disabled) {
            return;
        }

        if (!validateForm()) {
            return;
        }

        const originalButtonHTML = submitButton.innerHTML;

        try {

            submitButton.disabled = true;
            submitButton.textContent = "Submitting Application...";

            showMessage(
                "Submitting your application. Please wait...",
                "info"
            );

            const applicationData = buildApplicationData();

            const response = await fetch(
                `${API_BASE_URL}/api/captain/applications`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(applicationData)
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Application submission failed."
                );
            }

            showMessage(
                result.message +
                " Your Application ID is: " +
                result.application.application_id,
                "success"
            );

            console.log(
                "Captain application submitted:",
                result.application
            );

            form.reset();
            resetDocumentStatuses();

        } catch (error) {

            console.error("Captain application error:", error);

            let message = error.message;

            if (error instanceof TypeError) {
                message =
                    "Unable to connect to the ShuttleConnect server. " +
                    "Please check whether the backend is running.";
            }

            showMessage(message, "error");

        } finally {

            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonHTML;

        }

    });

    // =====================================================
    // INITIALIZE DATE LIMITS
    // =====================================================

    const today = new Date();

    const localToday = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0")
    ].join("-");

    if (fields.licenceExpiry) {
        fields.licenceExpiry.min = localToday;
    }

    if (fields.vehicleYear) {
        fields.vehicleYear.max = new Date().getFullYear();
    }

    console.log("Captain signup form initialized successfully.");

});
