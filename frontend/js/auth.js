
"use strict";

const API_BASE_URL = "http://localhost:3000/api";

function setAuthMessage(element, message, type) {
    if (!element) return;

    element.textContent = message;
    element.className = `auth-message${message ? " show" : ""}${type ? ` ${type}` : ""}`;
}

async function apiRequest(endpoint, options = {}) {
    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch {
        throw new Error("Cannot connect to the server. Please make sure it is running on port 3000.");
    }

    const text = await response.text();
    let result = {};

    if (text) {
        try {
            result = JSON.parse(text);
        } catch {
            throw new Error("The server returned an invalid response.");
        }
    }

    if (!response.ok) {
        throw new Error(result.message || result.error || "The request could not be completed.");
    }

    return result;
}

// Password visibility controls
document.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;

        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
});

const loginToggle = document.getElementById("togglePw");
const loginPassword = document.getElementById("password");

if (loginToggle && loginPassword) {
    loginToggle.addEventListener("click", () => {
        const show = loginPassword.type === "password";
        loginPassword.type = show ? "text" : "password";
        loginToggle.textContent = show ? "Hide" : "Show";
        loginToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
}

// Registration password strength
const passwordInput = document.getElementById("regPassword");

if (passwordInput) {
    passwordInput.addEventListener("input", () => {
        const value = passwordInput.value;
        const fill = document.getElementById("strengthFill");
        const label = document.getElementById("strengthLabel");

        if (!fill || !label) return;

        let strength = 0;

        if (value.length >= 8) strength++;
        if (/[A-Z]/.test(value)) strength++;
        if (/[0-9]/.test(value)) strength++;
        if (/[^A-Za-z0-9]/.test(value)) strength++;

        const levels = [
            { width: "0%", color: "transparent", text: "Enter password" },
            { width: "25%", color: "#ef4444", text: "Weak" },
            { width: "50%", color: "#f97316", text: "Fair" },
            { width: "75%", color: "#eab308", text: "Good" },
            { width: "100%", color: "#22c55e", text: "Strong" }
        ];

        const level = levels[Math.min(strength, 4)];

        fill.style.width = level.width;
        fill.style.background = level.color;
        label.textContent = level.text;
        label.style.color = level.color === "transparent"
            ? "rgba(255,255,255,0.4)"
            : level.color;
    });
}

// Passenger login
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const button = document.getElementById("signInBtn");
        const message = document.getElementById("loginMessage");

        if (!email || !password) {
            setAuthMessage(message, "Please enter your email address and password.", "error");
            return;
        }

        button.disabled = true;
        button.textContent = "Signing in...";
        setAuthMessage(message, "", "");

        try {
            const result = await apiRequest("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            if (!result.token) {
                throw new Error("The server did not return an authentication token.");
            }

            localStorage.setItem("token", result.token);

            setAuthMessage(message, "Login successful. Opening ShuttleConnect...", "success");

            window.setTimeout(() => {
                window.location.href = "index.html";
            }, 500);

        } catch (error) {
            setAuthMessage(message, error.message, "error");
            button.disabled = false;
            button.textContent = "Sign In";
        }
    });
}

// Passenger registration
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const fullName = document.getElementById("fullName").value.trim();
        const email = document.getElementById("email").value.trim().toLowerCase();
        const phone = document.getElementById("phone").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const terms = document.getElementById("terms");
        const button = document.getElementById("signUpBtn");
        const message = document.getElementById("registerMessage");

        if (!fullName || !email || !password) {
            setAuthMessage(message, "Please enter your name, email address and password.", "error");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setAuthMessage(message, "Please enter a valid email address.", "error");
            return;
        }

        if (password.length < 8) {
            setAuthMessage(message, "Password must contain at least 8 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            setAuthMessage(message, "Passwords do not match.", "error");
            return;
        }

        if (!terms.checked) {
            setAuthMessage(message, "Please accept the account registration terms.", "error");
            return;
        }

        button.disabled = true;
        button.textContent = "Creating account...";
        setAuthMessage(message, "", "");

        try {
            const result = await apiRequest("/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    phone: phone || null,
                    password
                })
            });

            setAuthMessage(
                message,
                result.message || "Registration successful. You can now sign in.",
                "success"
            );

            window.setTimeout(() => {
                window.location.href = "login.html";
            }, 900);

        } catch (error) {
            setAuthMessage(message, error.message, "error");
            button.disabled = false;
            button.textContent = "Create Passenger Account";
        }
    });
}
