
"use strict";

// ======================================================
// SHUTTLECONNECT - 2D SHUTTLE BOOKING SYSTEM
// ======================================================

const API_BASE_URL = "http://localhost:3000/api";
const MAX_SEATS_PER_BOOKING = 20;

// ======================================================
// APPLICATION STATE
// ======================================================

let selectedTrip = null;
let seatData = [];
let selectedSeats = [];
let currentFare = 0;

let isSearching = false;
let isBooking = false;

// ======================================================
// DOM ELEMENTS
// ======================================================

const searchForm = document.getElementById("tripSearchForm");

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const travelDateInput = document.getElementById("travelDate");

const searchButton = document.getElementById("searchButton");
const searchMessage = document.getElementById("searchMessage");

const tripResults = document.getElementById("tripResults");
const tripCount = document.getElementById("tripCount");

const seatLayout = document.getElementById("seatLayout");
const seatStatus = document.getElementById("seatStatus");

const selectedSeatsContainer = document.getElementById("selectedSeats");
const seatCountElement = document.getElementById("seatCount");
const farePerSeatElement = document.getElementById("farePerSeat");
const totalAmountElement = document.getElementById("totalAmount");

const confirmButton = document.getElementById("confirmBookingButton");

const bookingResult = document.getElementById("bookingResult");
const bookingResultMessage = document.getElementById("bookingResultMessage");
const bookingReference = document.getElementById("bookingReference");
const confirmedSeatCount = document.getElementById("confirmedSeatCount");
const confirmedAmount = document.getElementById("confirmedAmount");

const toast = document.getElementById("toast");

// ======================================================
// HELPER FUNCTIONS
// ======================================================

function getLocalDateString() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getAuthToken() {
    return localStorage.getItem("token");
}

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

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function setSearchMessage(message, type = "") {
    searchMessage.textContent = message;
    searchMessage.className = "message";

    if (type) {
        searchMessage.classList.add(type);
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

// ======================================================
// API REQUEST FUNCTION
// ======================================================

async function apiRequest(endpoint, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    const token = getAuthToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Cannot connect to the backend. Please make sure Node.js is running on port 3000."
        );
    }

    const responseText = await response.text();

    let result = {};

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error("The server returned an invalid response.");
        }
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            `Request failed with status ${response.status}.`
        );
    }

    return result;
}

// ======================================================
// INITIALIZE BOOKING PAGE
// ======================================================

function initializeBookingPage() {
    travelDateInput.min = getLocalDateString();
    travelDateInput.value = getLocalDateString();

    renderSelectedSeats();
    updateBookingSummary();
}

initializeBookingPage();

// ======================================================
// SEARCH TRIPS
// ======================================================

searchForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (isSearching) return;

    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    const date = travelDateInput.value;

    if (!origin || !destination || !date) {
        setSearchMessage(
            "Please enter the origin, destination and travel date.",
            "error"
        );
        return;
    }

    if (origin.toLowerCase() === destination.toLowerCase()) {
        setSearchMessage(
            "Origin and destination cannot be the same.",
            "error"
        );
        return;
    }

    if (date < getLocalDateString()) {
        setSearchMessage(
            "Please select today or a future date.",
            "error"
        );
        return;
    }

    isSearching = true;

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";

    tripResults.innerHTML = `
        <div class="empty-state">
            <p>Searching for available trips...</p>
        </div>
    `;

    tripCount.textContent = "Searching";

    resetSelectedTrip();

    try {
        const query = new URLSearchParams({
            origin,
            destination,
            date
        });

        const result = await apiRequest(
            `/trips?${query.toString()}`
        );

        if (result.success === false) {
            throw new Error(
                result.message || "Unable to search trips."
            );
        }

        const trips = Array.isArray(result)
            ? result
            : result.trips || result.data || [];

        if (!Array.isArray(trips)) {
            throw new Error(
                "Unexpected trip data received from the server."
            );
        }

        renderTrips(trips);

        setSearchMessage(
            trips.length
                ? `${trips.length} trip(s) found. Select a trip to view its seats.`
                : "No scheduled trips found for this route and date.",
            trips.length ? "success" : ""
        );

    } catch (error) {
        tripResults.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load trips</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;

        tripCount.textContent = "0 trips";

        setSearchMessage(error.message, "error");

    } finally {
        isSearching = false;

        searchButton.disabled = false;
        searchButton.textContent = "Search Trips";
    }
});

// ======================================================
// DISPLAY TRIP RESULTS
// ======================================================

function renderTrips(trips) {
    tripResults.innerHTML = "";

    tripCount.textContent =
        `${trips.length} trip${trips.length === 1 ? "" : "s"}`;

    if (trips.length === 0) {
        tripResults.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⌕</span>
                <h3>No trips available</h3>
                <p>Try another travel date or route.</p>
            </div>
        `;
        return;
    }

    trips.forEach(trip => {
        const tripId = Number(trip.trip_id ?? trip.id);

        const fare = Number(
            trip.fare_per_seat ?? trip.fare ?? 0
        );
        const availableSeats = Number(trip.available_seats);

        const card = document.createElement("article");

        card.className = "trip-card";
        card.dataset.tripId = tripId;

        const departure = formatDateTime(
            trip.departure_datetime
        );

        const arrival = formatDateTime(
            trip.arrival_datetime
        );

        const routeName = trip.route_name ||
            `${trip.origin || originInput.value} → ${trip.destination || destinationInput.value}`;

        card.innerHTML = `
            <div class="trip-detail">
                <span>Route</span>
                <strong>${escapeHTML(routeName)}</strong>
            </div>

            <div class="trip-detail">
                <span>Departure</span>
                <strong>${escapeHTML(departure)}</strong>
            </div>

            <div class="trip-detail">
                <span>Arrival</span>
                <strong>${escapeHTML(arrival)}</strong>
            </div>

            <div>
                <div class="trip-fare">
                    ${formatCurrency(fare)}
                </div>
                <small class="muted-text">Per seat</small>
            </div>

            <div class="trip-detail">
                <span>Available seats</span>
                <strong>${Number.isFinite(availableSeats) ? escapeHTML(availableSeats) : "Not specified"}</strong>
            </div>

            <button type="button" class="select-trip-button">
                Select Trip
            </button>
        `;

        const selectButton = card.querySelector(
            ".select-trip-button"
        );

        selectButton.addEventListener("click", () => {
            selectTrip(trip, card);
        });

        tripResults.appendChild(card);
    });
}

// ======================================================
// SELECT A TRIP
// ======================================================

async function selectTrip(trip, selectedCard) {
    const tripId = Number(trip.trip_id ?? trip.id);

    if (!Number.isInteger(tripId) || tripId <= 0) {
        showToast("Invalid trip ID received.");
        return;
    }

    selectedTrip = trip;

    currentFare = Number(
        trip.fare_per_seat ?? trip.fare ?? 0
    );

    selectedSeats = [];
    seatData = [];

    document.querySelectorAll(".trip-card").forEach(card => {
        card.classList.remove("selected");

        card.querySelector(
            ".select-trip-button"
        ).textContent = "Select Trip";
    });

    selectedCard.classList.add("selected");

    selectedCard.querySelector(
        ".select-trip-button"
    ).textContent = "Selected";

    seatStatus.textContent = "Loading seats";

    seatLayout.innerHTML = `
        <div class="seat-placeholder">
            Loading seat availability...
        </div>
    `;

    updateBookingSummary();

    try {
        const result = await apiRequest(
            `/trips/${tripId}/seats`
        );

        if (result.success === false) {
            throw new Error(
                result.message || "Unable to load seat availability."
            );
        }

        seatData = Array.isArray(result)
            ? result
            : result.seats || result.data?.seats || [];

        if (!Array.isArray(seatData)) {
            throw new Error(
                "Unexpected seat data received from the server."
            );
        }

        renderSeatLayout();

        seatStatus.textContent = "Trip selected";

        document.querySelector(".seats-panel").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        seatLayout.innerHTML = `
            <div class="seat-placeholder">
                ${escapeHTML(error.message)}
            </div>
        `;

        seatStatus.textContent = "Unable to load";

        showToast(error.message);
    }
}

// ======================================================
// RENDER REDBUS-STYLE 20-SEAT LAYOUT
// ======================================================

function renderSeatLayout() {
    seatLayout.innerHTML = "";

    if (!Array.isArray(seatData) || seatData.length === 0) {
        seatLayout.innerHTML = `
            <div class="seat-placeholder">
                No seat information is available for this trip.
            </div>
        `;
        return;
    }

    const sortedSeats = [...seatData].sort(
        (a, b) => Number(a.seat_number) - Number(b.seat_number)
    );

    for (let index = 0; index < sortedSeats.length; index += 4) {
        const rowSeats = sortedSeats.slice(index, index + 4);

        const row = document.createElement("div");
        row.className = "seat-row";

        // Two seats on the left
        addSeatToRow(row, rowSeats[0]);
        addSeatToRow(row, rowSeats[1]);

        // Central aisle
        const aisle = document.createElement("div");
        aisle.className = "seat-aisle";

        row.appendChild(aisle);

        // Two seats on the right
        addSeatToRow(row, rowSeats[2]);
        addSeatToRow(row, rowSeats[3]);

        seatLayout.appendChild(row);
    }
}

// ======================================================
// CREATE INDIVIDUAL SEAT ICON
// ======================================================

function addSeatToRow(row, seat) {
    if (!seat) {
        const empty = document.createElement("span");
        row.appendChild(empty);
        return;
    }

    const seatNumber = Number(seat.seat_number);

    const status = String(
        seat.status ?? seat.seat_status ?? "available"
    ).toLowerCase();

    const isBooked = [
        "booked",
        "occupied",
        "unavailable"
    ].includes(status);

    const isSelected = selectedSeats.includes(seatNumber);

    const button = document.createElement("button");

    button.type = "button";

    button.className = `seat-icon ${
        isBooked ? "booked" :
        isSelected ? "selected" :
        "available"
    }`;

    button.disabled = isBooked;
    button.setAttribute(
        "aria-label",
        isBooked
            ? `Seat ${seatNumber} is booked`
            : `Seat ${seatNumber}${isSelected ? ", selected" : ", available"}`
    );

    button.title = isBooked
        ? `Seat ${seatNumber} is booked`
        : `Select seat ${seatNumber}`;

    button.innerHTML = `
        <svg viewBox="0 0 40 44" aria-hidden="true">
            <rect
                x="8"
                y="3"
                width="24"
                height="23"
                rx="7"
                fill="currentColor"
                opacity=".9"
            />

            <rect
                x="5"
                y="21"
                width="30"
                height="13"
                rx="5"
                fill="currentColor"
            />

            <path
                d="M9 32 V39 M31 32 V39"
                stroke="currentColor"
                stroke-width="4"
                stroke-linecap="round"
            />
        </svg>

        <span>${seatNumber}</span>
    `;

    if (!isBooked) {
        button.addEventListener("click", () => {
            toggleSeat(seatNumber);
        });
    }

    row.appendChild(button);
}

// ======================================================
// SELECT OR DESELECT SEATS
// ======================================================

function toggleSeat(seatNumber) {
    if (!selectedTrip) {
        showToast("Please select a trip first.");
        return;
    }

    const existingIndex = selectedSeats.indexOf(seatNumber);

    if (existingIndex !== -1) {
        selectedSeats.splice(existingIndex, 1);

    } else {
        if (selectedSeats.length >= MAX_SEATS_PER_BOOKING) {
            showToast(
                `You can select a maximum of ${MAX_SEATS_PER_BOOKING} seats.`
            );
            return;
        }

        selectedSeats.push(seatNumber);
    }

    selectedSeats.sort((a, b) => a - b);

    renderSeatLayout();
    renderSelectedSeats();
    updateBookingSummary();
}

// ======================================================
// DISPLAY SELECTED SEATS
// ======================================================

function renderSelectedSeats() {
    selectedSeatsContainer.innerHTML = "";

    if (selectedSeats.length === 0) {
        selectedSeatsContainer.innerHTML = `
            <span class="muted-text">
                No seats selected
            </span>
        `;
        return;
    }

    selectedSeats.forEach(seatNumber => {
        const chip = document.createElement("span");

        chip.className = "seat-chip";
        chip.textContent = `Seat ${seatNumber}`;

        selectedSeatsContainer.appendChild(chip);
    });
}

// ======================================================
// UPDATE BOOKING SUMMARY AND FARE
// ======================================================

function updateBookingSummary() {
    const total = selectedSeats.length * currentFare;

    seatCountElement.textContent = selectedSeats.length;

    farePerSeatElement.textContent =
        formatCurrency(currentFare);

    totalAmountElement.textContent =
        formatCurrency(total);

    confirmButton.disabled =
        !selectedTrip ||
        selectedSeats.length === 0 ||
        isBooking;
}

// ======================================================
// CONFIRM BOOKING
// ======================================================

confirmButton.addEventListener("click", async function () {
    if (isBooking) return;

    if (!selectedTrip || selectedSeats.length === 0) {
        showToast(
            "Please select a trip and at least one seat."
        );
        return;
    }

    const token = getAuthToken();

    if (!token) {
        showToast(
            "Please log in before confirming your booking."
        );

        const shouldLogin = confirm(
            "You need to log in before booking. Would you like to open the login page?"
        );

        if (shouldLogin) {
            window.location.href = "login.html";
        }

        return;
    }

    isBooking = true;

    confirmButton.disabled = true;
    confirmButton.textContent = "Processing...";

    const bookingPayload = {
        trip_id: Number(selectedTrip.trip_id ?? selectedTrip.id),
        seat_numbers: [...selectedSeats]
    };

    try {
        const result = await apiRequest("/bookings", {
            method: "POST",
            body: JSON.stringify(bookingPayload)
        });

        if (result.success === false) {
            throw new Error(
                result.message || "Booking could not be completed."
            );
        }

        displayBookingConfirmation(result);

        selectedSeats = [];

        renderSelectedSeats();
        updateBookingSummary();

        await refreshSeatAvailability();

        bookingResult.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {
        showToast(error.message);

        await refreshSeatAvailability();

    } finally {
        isBooking = false;

        confirmButton.textContent = "Confirm Booking";

        updateBookingSummary();
    }
});

// ======================================================
// DISPLAY BOOKING CONFIRMATION
// ======================================================

function displayBookingConfirmation(result) {
    const booking =
        result.booking ||
        result.data?.booking ||
        result;

    const reference =
        booking.booking_reference ||
        booking.reference ||
        result.booking_reference ||
        "Confirmed";

    const numberOfSeats =
        booking.number_of_seats ??
        booking.seat_numbers?.length ??
        selectedSeats.length;

    const amount =
        booking.total_amount ??
        (selectedSeats.length * currentFare);

    bookingReference.textContent = reference;

    confirmedSeatCount.textContent = numberOfSeats;

    confirmedAmount.textContent =
        formatCurrency(amount);

    bookingResultMessage.textContent =
        result.message ||
        "Your shuttle booking has been confirmed.";

    bookingResult.hidden = false;
}

// ======================================================
// REFRESH SEAT AVAILABILITY AFTER BOOKING
// ======================================================

async function refreshSeatAvailability() {
    if (!selectedTrip) return;

    try {
        const tripId = Number(
            selectedTrip.trip_id ?? selectedTrip.id
        );

        const result = await apiRequest(
            `/trips/${tripId}/seats`
        );

        if (result.success === false) {
            throw new Error(
                result.message || "Unable to refresh seats."
            );
        }

        seatData = Array.isArray(result)
            ? result
            : result.seats || result.data?.seats || [];

        renderSeatLayout();

    } catch (error) {
        console.error("Seat refresh error:", error);
    }
}

// ======================================================
// RESET TRIP AND SEAT SELECTION
// ======================================================

function resetSelectedTrip() {
    selectedTrip = null;
    seatData = [];
    selectedSeats = [];
    currentFare = 0;

    seatStatus.textContent = "No trip selected";

    seatLayout.innerHTML = `
        <div class="seat-placeholder">
            Search for a trip and select it to load the seat layout.
        </div>
    `;

    bookingResult.hidden = true;

    renderSelectedSeats();
    updateBookingSummary();
}
