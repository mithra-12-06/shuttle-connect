
"use strict";

const API_BASE_URL = "http://localhost:3000/api";

const dashboardMessage = document.getElementById("dashboardMessage");
const profileDetails = document.getElementById("profileDetails");
const welcomeHeading = document.getElementById("welcomeHeading");
const bookingList = document.getElementById("bookingList");
const dashboardToast = document.getElementById("dashboardToast");
const logoutButton = document.getElementById("logoutButton");

let bookings = [];
let activeView = "upcoming";

// =========================================
// AUTHENTICATION
// =========================================

function getAuthToken() {
    return localStorage.getItem("token");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// =========================================
// FORMATTING
// =========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatDateTime(value) {
    if (!value) return "Not specified";

    const date = new Date(
        String(value).includes("T")
            ? value
            : String(value).replace(" ", "T")
    );

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

// =========================================
// NOTIFICATIONS
// =========================================

function showToast(message, type = "") {
    dashboardToast.textContent = message;
    dashboardToast.className =
        `dashboard-toast show${type ? ` ${type}` : ""}`;

    window.setTimeout(() => {
        dashboardToast.className = "dashboard-toast";
    }, 3500);
}

// =========================================
// API REQUEST
// =========================================

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "login.html";
        throw new Error("Please log in again.");
    }

    const headers = { ...(options.headers || {}) };

    headers.Authorization = `Bearer ${token}`;

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    let response;

    try {
        response = await fetch(
            `${API_BASE_URL}${endpoint}`,
            { ...options, headers }
        );
    } catch {
        throw new Error(
            "Cannot connect to the server. Please make sure it is running on port 3000."
        );
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

    if (response.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "login.html";

        throw new Error(
            result.message || "Your session has expired."
        );
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            "The request could not be completed."
        );
    }

    return result;
}

// =========================================
// BOOKING STATUS
// =========================================

function isUpcoming(booking) {
    if (booking.booking_status !== "confirmed") {
        return false;
    }

    const departure = new Date(
        String(booking.departure_datetime).includes("T")
            ? booking.departure_datetime
            : String(booking.departure_datetime).replace(" ", "T")
    );

    return booking.trip_status === "scheduled" &&
        !Number.isNaN(departure.getTime()) &&
        departure.getTime() > Date.now();
}

function canCancel(booking) {
    return isUpcoming(booking);
}

// =========================================
// PASSENGER PROFILE
// =========================================

function renderProfile(user) {
    welcomeHeading.textContent =
        `Welcome, ${user.full_name || "Passenger"}`;

    profileDetails.innerHTML = `
        <div class="profile-detail">
            <span>Full name</span>
            <strong>${escapeHTML(user.full_name || "Not specified")}</strong>
        </div>

        <div class="profile-detail">
            <span>Email</span>
            <strong>${escapeHTML(user.email || "Not specified")}</strong>
        </div>

        <div class="profile-detail">
            <span>Phone</span>
            <strong>${escapeHTML(user.phone || "Not specified")}</strong>
        </div>
    `;
}

// =========================================
// DOWNLOAD PASSENGER TICKET
// =========================================

async function downloadTicket(booking, button) {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    button.disabled = true;
    button.querySelector("span").textContent = "Downloading...";

    try {
        const response = await fetch(
            `${API_BASE_URL}/passenger/bookings/${booking.booking_id}/ticket.pdf`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "login.html";
            throw new Error("Your session has expired. Please log in again.");
        }

        if (!response.ok) {
            let message = "Unable to download your ticket.";

            try {
                const errorResult = await response.json();
                message = errorResult.message || message;
            } catch {
                // Keep the default error message.
            }

            throw new Error(message);
        }

        const pdfBlob = await response.blob();

        const downloadUrl = URL.createObjectURL(pdfBlob);

        const link = document.createElement("a");
        link.href = downloadUrl;

        link.download =
            `ShuttleConnect-Ticket-${booking.booking_reference || booking.booking_id}.pdf`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(downloadUrl);

        showToast("Ticket downloaded successfully.", "success");

    } catch (error) {
        showToast(error.message, "error");

    } finally {
        button.disabled = false;
        button.querySelector("span").textContent = "Download Ticket";
    }
}

// =========================================
// RENDER BOOKING HISTORY
// =========================================

function renderBookings() {
    const filtered = bookings.filter(booking =>
        activeView === "upcoming"
            ? isUpcoming(booking)
            : !isUpcoming(booking)
    );

    if (filtered.length === 0) {
        bookingList.innerHTML = `
            <div class="dashboard-empty">
                <h3>
                    ${activeView === "upcoming"
                        ? "No upcoming bookings"
                        : "No previous bookings"}
                </h3>

                <p>
                    ${activeView === "upcoming"
                        ? "Book a journey to see your upcoming trips here."
                        : "Your cancelled or completed bookings will appear here."}
                </p>
            </div>
        `;

        return;
    }

    bookingList.innerHTML = "";

    filtered.forEach(booking => {
        const card = document.createElement("article");
        card.className = "passenger-booking-card";

        const seats = Array.isArray(booking.seats)
            ? booking.seats
                .map(seat => seat.seat_number)
                .join(", ")
            : "Not specified";

        const status = String(
            booking.booking_status || "unknown"
        );

        const statusClass =
            status === "confirmed" ? "confirmed" : "cancelled";

        card.innerHTML = `
            <div class="booking-card-top">
                <div>
                    <span class="booking-reference-label">
                        BOOKING REFERENCE
                    </span>

                    <strong class="booking-reference">
                        ${escapeHTML(booking.booking_reference || "Not specified")}
                    </strong>

                    <div class="booking-id">
                        BOOKING ID: ${escapeHTML(booking.booking_id)}
                    </div>
                </div>

                <span class="booking-status ${statusClass}">
                    ${escapeHTML(status)}
                </span>
            </div>

            <div class="booking-route">
                <strong>${escapeHTML(booking.origin || "Origin")}</strong>

                <span aria-hidden="true">→</span>

                <strong>${escapeHTML(booking.destination || "Destination")}</strong>
            </div>

            <div class="booking-details-grid">

                <div>
                    <span>Departure</span>
                    <strong>
                        ${escapeHTML(formatDateTime(booking.departure_datetime))}
                    </strong>
                </div>

                <div>
                    <span>Arrival</span>
                    <strong>
                        ${escapeHTML(formatDateTime(booking.arrival_datetime))}
                    </strong>
                </div>

                <div>
                    <span>Seats</span>
                    <strong>${escapeHTML(seats)}</strong>
                </div>

                <div>
                    <span>Total amount</span>
                    <strong>
                        ${escapeHTML(formatCurrency(booking.total_amount))}
                    </strong>
                </div>

            </div>
        `;

        // =========================================
        // DOWNLOAD TICKET BUTTON
        // =========================================

        if (status === "confirmed") {

            const downloadButton =
                document.createElement("button");

            downloadButton.type = "button";
            downloadButton.className = "download-ticket-button";

            downloadButton.innerHTML = `
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>

                <span>Download Ticket</span>
            `;

            downloadButton.addEventListener("click", () => {
                downloadTicket(booking, downloadButton);
            });

            card.appendChild(downloadButton);
        }

        // =========================================
        // CANCEL BOOKING BUTTON
        // =========================================

        if (canCancel(booking)) {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "cancel-booking-button";
            button.textContent = "Cancel Booking";

            button.addEventListener("click", () =>
                cancelBooking(booking, button)
            );

            card.appendChild(button);
        }

        bookingList.appendChild(card);
    });
}

// =========================================
// CANCEL PASSENGER BOOKING
// =========================================

async function cancelBooking(booking, button) {
    if (!window.confirm(
        `Cancel booking ${booking.booking_reference}?`
    )) {
        return;
    }

    button.disabled = true;
    button.textContent = "Cancelling...";

    try {
        await apiRequest(
            `/passenger/bookings/${booking.booking_id}/cancel`,
            {
                method: "PATCH"
            }
        );

        showToast(
            "Booking cancelled successfully.",
            "success"
        );

        await loadDashboard();

    } catch (error) {
        showToast(error.message, "error");

        button.disabled = false;
        button.textContent = "Cancel Booking";
    }
}

// =========================================
// LOAD PASSENGER DASHBOARD
// =========================================

async function loadDashboard() {
    if (!getAuthToken()) {
        window.location.href = "login.html";
        return;
    }

    dashboardMessage.className = "dashboard-message";
    dashboardMessage.textContent = "";

    profileDetails.innerHTML =
        "<p>Loading profile...</p>";

    bookingList.innerHTML =
        '<div class="dashboard-empty">Loading bookings...</div>';

    try {
        const [profileResult, bookingResult] =
            await Promise.all([
                apiRequest("/passenger/profile"),
                apiRequest("/passenger/bookings")
            ]);

        renderProfile(profileResult.user || {});

        bookings = Array.isArray(bookingResult.bookings)
            ? bookingResult.bookings
            : [];

        renderBookings();

    } catch (error) {
        dashboardMessage.className =
            "dashboard-message error";

        dashboardMessage.textContent = error.message;

        profileDetails.innerHTML =
            "<p>Profile unavailable.</p>";

        bookingList.innerHTML = `
            <div class="dashboard-empty">
                <h3>Bookings unavailable</h3>
            </div>
        `;
    }
}

// =========================================
// UPCOMING / PREVIOUS BOOKING TABS
// =========================================

document.querySelectorAll("[data-booking-view]").forEach(button => {

    button.addEventListener("click", () => {

        activeView = button.dataset.bookingView;

        document.querySelectorAll("[data-booking-view]").forEach(tab => {

            const active = tab === button;

            tab.classList.toggle("active", active);

            tab.setAttribute(
                "aria-selected",
                String(active)
            );

        });

        renderBookings();

    });

});

// =========================================
// LOGOUT
// =========================================

if (logoutButton) {

    logoutButton.addEventListener("click", () => {

        localStorage.removeItem("token");

        window.location.href = "login.html";

    });

}

// =========================================
// MOBILE NAVIGATION
// =========================================

const dashboardNavToggle =
    document.getElementById("dashboardNavToggle");

const dashboardNavigation =
    document.getElementById("dashboardNavigation");

if (dashboardNavToggle && dashboardNavigation) {

    dashboardNavToggle.addEventListener("click", () => {

        const open =
            dashboardNavigation.classList.toggle("open");

        dashboardNavToggle.setAttribute(
            "aria-expanded",
            String(open)
        );

        dashboardNavToggle.setAttribute(
            "aria-label",
            open
                ? "Close navigation menu"
                : "Open navigation menu"
        );

    });

}

// =========================================
// INITIALIZE DASHBOARD
// =========================================

loadDashboard();
