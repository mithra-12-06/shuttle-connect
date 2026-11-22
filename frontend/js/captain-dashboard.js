
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. GET HTML ELEMENTS
    // ==========================================

    const loginForm = document.getElementById("captainLoginForm");

    const emailInput = document.getElementById("captainEmail");

    const passwordInput = document.getElementById("captainPassword");

    const rememberMeCheckbox = document.getElementById("rememberMe");

    const message = document.getElementById("loginMessage");

    const loginButton = document.getElementById("loginButton");

    const forgotPasswordLink = document.getElementById("forgotPasswordLink");


    // ==========================================
    // 2. CHECK REQUIRED ELEMENTS
    // ==========================================

    if (
        !loginForm ||
        !emailInput ||
        !passwordInput ||
        !message ||
        !loginButton
    ) {
        console.error("Captain login page elements are missing.");
        return;
    }


    // ==========================================
    // 3. DISPLAY STATUS MESSAGES
    // ==========================================

    function showMessage(text, type) {

        message.textContent = text;

        message.className = "login-message";

        if (type) {
            message.classList.add(type);
        }

    }


    // ==========================================
    // 4. EMAIL VALIDATION
    // ==========================================

    function isValidEmail(email) {

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        return emailPattern.test(email);

    }


    // ==========================================
    // 5. CAPTAIN LOGIN FORM
    // ==========================================

    loginForm.addEventListener("submit", (event) => {

        event.preventDefault();

        // Prevent accidental repeated submissions.
        if (loginButton.disabled) {
            return;
        }

        const email = emailInput.value.trim();

        const password = passwordInput.value;

        const rememberMe = rememberMeCheckbox
            ? rememberMeCheckbox.checked
            : false;


        // Clear previous messages.
        showMessage("", "");


        // ======================================
        // VALIDATE EMPTY FIELDS
        // ======================================

        if (!email || !password) {

            showMessage(
                "Please enter your email and password.",
                "error"
            );

            return;

        }


        // ======================================
        // VALIDATE EMAIL FORMAT
        // ======================================

        if (!isValidEmail(email)) {

            showMessage(
                "Please enter a valid email address.",
                "error"
            );

            emailInput.focus();

            return;

        }


        // ======================================
        // FRONTEND AUTHENTICATION PLACEHOLDER
        // ======================================

        console.log("Captain login form validated.");

        console.log("Remember me selected:", rememberMe);


        showMessage(
            "Your login details are validated. Captain authentication will be connected during backend integration.",
            "success"
        );

    });


    // ==========================================
    // 6. FORGOT PASSWORD
    // ==========================================

    if (forgotPasswordLink) {

        forgotPasswordLink.addEventListener("click", (event) => {

            event.preventDefault();

            const email = emailInput.value.trim();

            showMessage("", "");

            if (email && !isValidEmail(email)) {

                showMessage(
                    "Please enter a valid email address first.",
                    "error"
                );

                emailInput.focus();

                return;

            }

            if (!email) {

                showMessage(
                    "Enter your registered email address to request a password reset.",
                    "error"
                );

                emailInput.focus();

                return;

            }

            showMessage(
                "Password reset through your registered email will be available after backend integration.",
                "success"
            );

        });

    }


    // ==========================================
    // 7. CLEAR ERRORS WHEN USER TYPES
    // ==========================================

    emailInput.addEventListener("input", () => {

        showMessage("", "");

    });


    passwordInput.addEventListener("input", () => {

        showMessage("", "");

    });


});
