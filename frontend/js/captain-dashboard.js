
"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================

    const API_BASE_URL = "http://localhost:3000/api";
    const CAPTAIN_DASHBOARD_URL = "captain-rides.html";

    // ==========================================
    // 2. HTML ELEMENTS
    // ==========================================

    const loginForm = document.getElementById("captainLoginForm");
    const emailInput = document.getElementById("captainEmail");
    const passwordInput = document.getElementById("captainPassword");
    const rememberMeCheckbox = document.getElementById("rememberMe");
    const message = document.getElementById("loginMessage");
    const loginButton = document.getElementById("loginButton");
    const forgotPasswordLink = document.getElementById("forgotPasswordLink");

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
    // 3. MESSAGE HANDLER
    // ==========================================

    function showMessage(text, type = "") {
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
    // 5. CAPTAIN LOGIN
    // ==========================================

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        if (loginButton.disabled) {
            return;
        }

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox
            ? rememberMeCheckbox.checked
            : false;

        showMessage("");

        if (!email || !password) {
            showMessage(
                "Please enter your email and password.",
                "error"
            );
            return;
        }

        if (!isValidEmail(email)) {
            showMessage(
                "Please enter a valid email address.",
                "error"
            );
            emailInput.focus();
            return;
        }

        // Clear any previous captain session.
        localStorage.removeItem("captainToken");
        sessionStorage.removeItem("captainToken");

        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";

        try {

            const response = await fetch(
                `${API_BASE_URL}/captain/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Captain login failed."
                );
            }

            if (!result.token) {
                throw new Error(
                    "The server did not return an authentication token."
                );
            }

            if (
                !result.captain ||
                result.captain.account_role !== "captain"
            ) {
                throw new Error(
                    "Invalid captain account response."
                );
            }

            // Remember me:
            // Checked = persistent localStorage session.
            // Unchecked = sessionStorage session.
            if (rememberMe) {
                localStorage.setItem(
                    "captainToken",
                    result.token
                );

                sessionStorage.removeItem("captainToken");

            } else {
                sessionStorage.setItem(
                    "captainToken",
                    result.token
                );

                localStorage.removeItem("captainToken");
            }

            // Store basic captain information for display.
            const captainInfo = {
                full_name: result.captain.full_name,
                email: result.captain.email,
                availability_status:
                    result.captain.availability_status
            };

            const captainInfoString = JSON.stringify(captainInfo);

            if (rememberMe) {
                localStorage.setItem(
                    "captainInfo",
                    captainInfoString
                );

                sessionStorage.removeItem("captainInfo");

            } else {
                sessionStorage.setItem(
                    "captainInfo",
                    captainInfoString
                );

                localStorage.removeItem("captainInfo");
            }

            showMessage(
                "Login successful! Redirecting to your dashboard...",
                "success"
            );

            window.location.href = CAPTAIN_DASHBOARD_URL;

        } catch (error) {

            console.error("Captain login error:", error);

            showMessage(
                error.message ||
                "Unable to connect to the server. Please try again.",
                "error"
            );

            loginButton.disabled = false;
            loginButton.textContent = "Sign In";
        }

    });

    // ==========================================
    // 6. FORGOT PASSWORD
    // ==========================================

    if (forgotPasswordLink) {

        forgotPasswordLink.addEventListener("click", (event) => {

            event.preventDefault();

            const email = emailInput.value.trim();

            showMessage("");

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
                "Password reset through your registered email is not available yet.",
                "error"
            );
        });
    }

    // ==========================================
    // 7. CLEAR MESSAGES WHEN TYPING
    // ==========================================

    emailInput.addEventListener("input", () => {
        showMessage("");
    });

    passwordInput.addEventListener("input", () => {
        showMessage("");
    });

});
