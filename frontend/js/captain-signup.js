
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
    // CONFIGURATION
    // =====================================================

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
            return {
                valid: true
            };
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

        // Validate MIME type when the browser provides it.
        // Some browsers may return an empty MIME type.

        if (
            file.type &&
            !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())
        ) {
            return {
                valid: false,
                message: "The selected file type is not supported."
            };
        }

        return {
            valid: true
        };
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


    // Attach selection events to all three upload controls.

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

            // Documents are optional during local UI testing.

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


        // ---------------------------------------------
        // Personal information
        // ---------------------------------------------

        if (!fields.name.value.trim()) {

            showMessage(
                "Please enter your full name.",
                "error"
            );

            fields.name.focus();
            return false;
        }


        if (!isValidEmail(fields.email.value.trim())) {

            showMessage(
                "Please enter a valid email address.",
                "error"
            );

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

            showMessage(
                "Please enter your residential address.",
                "error"
            );

            fields.address.focus();
            return false;
        }


        // ---------------------------------------------
        // Vehicle information
        // ---------------------------------------------

        if (!fields.vehicleCategory.value) {

            showMessage(
                "Please select your vehicle category.",
                "error"
            );

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


        // ---------------------------------------------
        // Manufacturing year
        // ---------------------------------------------

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


        // ---------------------------------------------
        // Driving licence information
        // ---------------------------------------------

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


        // ---------------------------------------------
        // Agreement validation
        // ---------------------------------------------

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


        // ---------------------------------------------
        // Document validation
        // ---------------------------------------------

        if (!validateAllDocuments()) {
            return false;
        }


        return true;
    }


    // =====================================================
    // CLEAR MESSAGE WHEN USER EDITS THE FORM
    // =====================================================

    form.addEventListener("input", function () {
        clearMessage();
    });

    form.addEventListener("change", function (event) {

        // File selection has its own validation messages.
        if (!event.target.matches('input[type="file"]')) {
            clearMessage();
        }

    });


    // =====================================================
    // FORM SUBMISSION
    // =====================================================

    form.addEventListener("submit", function (event) {

        event.preventDefault();

        if (!validateForm()) {
            return;
        }


        /*
            IMPORTANT:

            This is currently a frontend demonstration.

            No application API is connected.
            No database record is created.
            No document is uploaded.
            No email is sent.

            Backend application submission and secure
            document storage will be implemented separately.
        */


        showMessage(
            "Browser validation successful! This is a demonstration only. Your application and documents have NOT been submitted or saved.",
            "success"
        );


        submitButton.textContent = "Validation Successful";
        submitButton.disabled = true;


        // Restore the button after a short delay.
        // This does not represent an actual server request.

        setTimeout(function () {

            submitButton.innerHTML =
                'Submit Application <span>→</span>';

            submitButton.disabled = false;

        }, 2500);

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
