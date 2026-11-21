
"use strict";

// ==========================================
// SHUTTLECONNECT - ADMIN AUTHENTICATION
// ==========================================

const ADMIN_API_BASE_URL = "http://localhost:3000/api";

// ==========================================
// DOM ELEMENTS
// ==========================================

const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");

const adminLoginButton = document.getElementById("adminLoginBtn");
const adminLoginMessage = document.getElementById("adminLoginMessage");

const adminTogglePassword = document.getElementById("adminTogglePassword");

// ==========================================
// MESSAGE HANDLER
// ==========================================

function showAdminMessage(message, type = "error") {
    if (!adminLoginMessage) return;

    adminLoginMessage.textContent = message;

    adminLoginMessage.className =
        `auth-message show ${type}`;
}

// ==========================================
// API REQUEST
// ==========================================

async function adminApiRequest(endpoint, options = {}) {

    let response;

    try {
        response = await fetch(
            `${ADMIN_API_BASE_URL}${endpoint}`,
            options
        );

    } catch (error) {

        throw new Error(
            "Cannot connect to the server. Please ensure the backend is running on port 3000."
        );
    }

    const responseText = await response.text();

    let result = {};

    if (responseText) {
        try {
            result = JSON.parse(responseText);

        } catch (error) {

            throw new Error(
                "The server returned an invalid response."
            );
        }
    }

    if (!response.ok) {

        throw new Error(
            result.message ||
            result.error ||
            "Administrator login failed."
        );
    }

    return result;
}

// ==========================================
// PASSWORD VISIBILITY TOGGLE
// ==========================================

if (adminTogglePassword && adminPasswordInput) {

    adminTogglePassword.addEventListener("click", () => {

        const showPassword =
            adminPasswordInput.type === "password";

        adminPasswordInput.type =
            showPassword ? "text" : "password";

        adminTogglePassword.textContent =
            showPassword ? "Hide" : "Show";

        adminTogglePassword.setAttribute(
            "aria-label",
            showPassword ? "Hide password" : "Show password"
        );

    });

}

// ==========================================
// ADMIN LOGIN
// ==========================================

if (adminLoginForm) {

    adminLoginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const email = adminEmailInput.value
            .trim()
            .toLowerCase();

        const password = adminPasswordInput.value;

        // Basic validation
        if (!email || !password) {

            showAdminMessage(
                "Please enter your administrator email and password."
            );

            return;
        }

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {

            showAdminMessage(
                "Please enter a valid email address."
            );

            return;
        }

        // Disable button during login
        adminLoginButton.disabled = true;

        adminLoginButton.textContent =
            "Authenticating...";

        adminLoginMessage.textContent = "";
        adminLoginMessage.className = "auth-message";

        try {

            // Dedicated administrator login endpoint
            const result = await adminApiRequest("/admin/login", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email,
                    password
                })

            });

            // Validate authentication response
            if (!result.token) {

                throw new Error(
                    "The server did not return an authentication token."
                );
            }

            if (
                !result.user ||
                result.user.account_role !== "admin"
            ) {

                throw new Error(
                    "Administrator access could not be verified."
                );
            }

            // Store admin authentication separately
            localStorage.setItem(
                "adminToken",
                result.token
            );

            localStorage.setItem(
                "adminUser",
                JSON.stringify(result.user)
            );

            showAdminMessage(
                "Administrator login successful. Opening dashboard...",
                "success"
            );

            // Redirect to admin dashboard
            window.location.replace("admin-dashboard.html");

        } catch (error) {

            showAdminMessage(
                error.message,
                "error"
            );

            adminLoginButton.disabled = false;

            adminLoginButton.textContent =
                "Sign In to Admin Portal";

        }

    });

}
