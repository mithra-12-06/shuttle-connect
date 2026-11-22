
"use strict";

// ======================================================
// SHUTTLECONNECT - DYNAMIC VEHICLE BOOKING SYSTEM
// Supports Seater, Sleeper and Mixed vehicles
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

const busContainer = document.querySelector(".bus-container");
const columnLabels = document.querySelector(".seat-column-labels");

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
// VEHICLE TYPE DETECTION
// ======================================================

function getVehicleType(trip) {
    const model = String(trip?.vehicle_model || "")
        .toLowerCase()
        .trim();

    if (model.includes("mixed")) {
        return "mixed";
    }

    if (model.includes("sleeper")) {
        return "sleeper";
    }

    if (model.includes("seater")) {
        return "seater";
    }

    // Capacity-based fallback for clearly identifiable models.
    const capacity = Number(trip?.seating_capacity);

    if (capacity === 24) {
        return "sleeper";
    }

    if (capacity === 20) {
        return "seater";
    }

    if (capacity === 40) {
        return "mixed";
    }

    return "unknown";
}

// ======================================================
// DISPLAY LABEL MAPPING
// Backend IDs remain numeric and unchanged.
// ======================================================

function getSeatDisplayLabel(seatNumber, vehicleType) {
    const id = Number(seatNumber);

    if (vehicleType === "sleeper") {
        if (id >= 1 && id <= 12) {
            return `L${id}`;
        }

        if (id >= 13 && id <= 24) {
            return `U${id - 12}`;
        }
    }

    if (vehicleType === "mixed") {
        if (id >= 1 && id <= 20) {
            return `S${id}`;
        }

        if (id >= 21 && id <= 30) {
            return `L${id - 20}`;
        }

        if (id >= 31 && id <= 40) {
            return `U${id - 30}`;
        }
    }

    return `S${id}`;
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
                ? `${trips.length} trip(s) found. Select a trip to view its layout.`
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

        const vehicleModel = trip.vehicle_model || "Vehicle type unavailable";

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
                <small class="muted-text">Per seat / berth</small>
            </div>

            <div class="trip-detail">
                <span>Vehicle</span>
                <strong>${escapeHTML(vehicleModel)}</strong>
            </div>

            <div class="trip-detail">
                <span>Available</span>
                <strong>${Number.isFinite(availableSeats)
                    ? escapeHTML(availableSeats)
                    : "Not specified"}</strong>
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

        const button = card.querySelector(".select-trip-button");

        if (button) {
            button.textContent = "Select Trip";
        }
    });

    selectedCard.classList.add("selected");

    selectedCard.querySelector(
        ".select-trip-button"
    ).textContent = "Selected";

    bookingResult.hidden = true;

    seatStatus.textContent = "Loading layout";

    seatLayout.innerHTML = `
        <div class="seat-placeholder">
            Loading vehicle layout and availability...
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

        seatStatus.textContent =
            `${getVehicleType(selectedTrip).toUpperCase()} layout`;

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
// VEHICLE LAYOUT RENDERER
// ======================================================

function renderSeatLayout() {
    seatLayout.innerHTML = "";

    if (columnLabels) {
        columnLabels.hidden = true;
    }

    if (busContainer) {
        busContainer.classList.remove(
            "seater-vehicle",
            "sleeper-vehicle",
            "mixed-vehicle"
        );
    }

    if (!Array.isArray(seatData) || seatData.length === 0) {
        seatLayout.innerHTML = `
            <div class="seat-placeholder">
                No seat information is available for this trip.
            </div>
        `;
        return;
    }

    const vehicleType = getVehicleType(selectedTrip);

    if (vehicleType === "unknown") {
        seatLayout.innerHTML = `
            <div class="seat-placeholder">
                <h3>Vehicle layout unavailable</h3>
                <p>
                    The vehicle model is not recognised.
                    Please check the vehicle configuration with the administrator.
                </p>
            </div>
        `;
        return;
    }

    const sortedSeats = [...seatData].sort(
        (a, b) => Number(a.seat_number) - Number(b.seat_number)
    );

    if (busContainer) {
        busContainer.classList.add(`${vehicleType}-vehicle`);
    }

    if (vehicleType === "seater") {
        renderSeaterLayout(sortedSeats);
    } else if (vehicleType === "sleeper") {
        renderSleeperLayout(sortedSeats);
    } else if (vehicleType === "mixed") {
        renderMixedLayout(sortedSeats);
    }
}

// ======================================================
// CREATE LAYOUT SECTION
// ======================================================

function createLayoutSection(title, subtitle = "") {
    const section = document.createElement("section");

    section.className = "vehicle-section";

    const heading = document.createElement("div");
    heading.className = "layout-section-heading";

    const headingText = document.createElement("div");

    const titleElement = document.createElement("h3");
    titleElement.textContent = title;

    headingText.appendChild(titleElement);

    if (subtitle) {
        const subtitleElement = document.createElement("p");
        subtitleElement.textContent = subtitle;
        headingText.appendChild(subtitleElement);
    }

    heading.appendChild(headingText);
    section.appendChild(heading);

    return section;
}

// ======================================================
// CREATE A SEAT / BERTH BUTTON
// ======================================================

function createPositionButton(seat, vehicleType, positionType) {
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

    const label = getSeatDisplayLabel(seatNumber, vehicleType);

    const button = document.createElement("button");

    button.type = "button";

    button.className = [
        positionType,
        isBooked ? "booked" :
        isSelected ? "selected" :
        "available"
    ].join(" ");

    button.disabled = isBooked || isBooking;

    button.textContent = label;

    button.setAttribute(
        "aria-label",
        isBooked
            ? `${label} is booked`
            : `${label}${isSelected ? ", selected" : ", available"}`
    );

    button.title = isBooked
        ? `${label} is booked`
        : isSelected
            ? `${label} selected. Click to deselect.`
            : `Select ${label}`;

    if (!isBooked) {
        button.addEventListener("click", () => {
            toggleSeat(seatNumber);
        });
    }

    return button;
}

// ======================================================
// CREATE VERTICAL GRID WITH CENTRAL AISLE
// ======================================================

function createVerticalGrid(seats, vehicleType, positionType, seatsPerRow) {
    const grid = document.createElement("div");

    grid.className = positionType === "berth"
        ? "berth-grid"
        : "seater-grid";

    for (let index = 0; index < seats.length; index += seatsPerRow) {
        const rowSeats = seats.slice(index, index + seatsPerRow);

        const row = document.createElement("div");

        row.className = positionType === "berth"
            ? "berth-row"
            : "seater-row";

        if (positionType === "berth") {
            const leftBerth = rowSeats[0];
            const rightBerth = rowSeats[1];

            if (leftBerth) {
                row.appendChild(
                    createPositionButton(
                        leftBerth,
                        vehicleType,
                        "berth"
                    )
                );
            } else {
                const empty = document.createElement("span");
                empty.className = "empty-position";
                row.appendChild(empty);
            }

            const aisle = document.createElement("div");
            aisle.className = "layout-aisle";
            row.appendChild(aisle);

            if (rightBerth) {
                row.appendChild(
                    createPositionButton(
                        rightBerth,
                        vehicleType,
                        "berth"
                    )
                );
            } else {
                const empty = document.createElement("span");
                empty.className = "empty-position";
                row.appendChild(empty);
            }

        } else {
            // Two seats on the left side.
            // Central aisle.
            // Two seats on the right side.

            for (let side = 0; side < 2; side++) {
                const seat = rowSeats[side];

                if (seat) {
                    row.appendChild(
                        createPositionButton(
                            seat,
                            vehicleType,
                            "seat-block"
                        )
                    );
                } else {
                    const empty = document.createElement("span");
                    empty.className = "empty-position";
                    row.appendChild(empty);
                }
            }

            const aisle = document.createElement("div");
            aisle.className = "layout-aisle";
            row.appendChild(aisle);

            for (let side = 2; side < 4; side++) {
                const seat = rowSeats[side];

                if (seat) {
                    row.appendChild(
                        createPositionButton(
                            seat,
                            vehicleType,
                            "seat-block"
                        )
                    );
                } else {
                    const empty = document.createElement("span");
                    empty.className = "empty-position";
                    row.appendChild(empty);
                }
            }
        }

        grid.appendChild(row);
    }

    return grid;
}

// ======================================================
// SEATER VEHICLE - 20 CONVENTIONAL SEATS
// ======================================================

function renderSeaterLayout(sortedSeats) {
    const section = createLayoutSection(
        "Seater arrangement",
        "20 conventional seats · Front to rear"
    );

    const grid = createVerticalGrid(
        sortedSeats,
        "seater",
        "seat",
        4
    );

    section.appendChild(grid);

    seatLayout.appendChild(section);
}

// ======================================================
// SLEEPER VEHICLE - 12 LOWER + 12 UPPER BERTHS
//
// IDs 1-12  = L1-L12
// IDs 13-24 = U1-U12
// ======================================================

function renderSleeperLayout(sortedSeats) {
    const lowerSeats = sortedSeats.filter(seat => {
        const id = Number(seat.seat_number);
        return id >= 1 && id <= 12;
    });

    const upperSeats = sortedSeats.filter(seat => {
        const id = Number(seat.seat_number);
        return id >= 13 && id <= 24;
    });

    const lowerSection = createLayoutSection(
        "LOWER DECK",
        "12 lower berths"
    );

    lowerSection.appendChild(
        createVerticalGrid(
            lowerSeats,
            "sleeper",
            "berth",
            2
        )
    );

    const upperSection = createLayoutSection(
        "UPPER DECK",
        "12 upper berths"
    );

    upperSection.appendChild(
        createVerticalGrid(
            upperSeats,
            "sleeper",
            "berth",
            2
        )
    );

    const decksContainer = document.createElement("div");
    decksContainer.className = "sleeper-decks";

    decksContainer.appendChild(lowerSection);
    decksContainer.appendChild(upperSection);

    seatLayout.appendChild(decksContainer);
}

// ======================================================
// MIXED VEHICLE
//
// IDs 1-20  = S1-S20
// IDs 21-30 = L1-L10
// IDs 31-40 = U1-U10
// ======================================================

function renderMixedLayout(sortedSeats) {
    const seaterSeats = sortedSeats.filter(seat => {
        const id = Number(seat.seat_number);
        return id >= 1 && id <= 20;
    });

    const lowerBerths = sortedSeats.filter(seat => {
        const id = Number(seat.seat_number);
        return id >= 21 && id <= 30;
    });

    const upperBerths = sortedSeats.filter(seat => {
        const id = Number(seat.seat_number);
        return id >= 31 && id <= 40;
    });

    const mixedContainer = document.createElement("div");
    mixedContainer.className = "mixed-layout";

    // Seater section

    const seaterSection = createLayoutSection(
        "SEATER SECTION",
        "20 conventional seats"
    );

    seaterSection.appendChild(
        createVerticalGrid(
            seaterSeats,
            "mixed",
            "seat",
            4
        )
    );

    // Sleeper section

    const sleeperSection = createLayoutSection(
        "SLEEPER SECTION",
        "10 lower + 10 upper berths"
    );

    const lowerSection = createLayoutSection(
        "LOWER BERTHS",
        "10 berths"
    );

    lowerSection.appendChild(
        createVerticalGrid(
            lowerBerths,
            "mixed",
            "berth",
            2
        )
    );

    const upperSection = createLayoutSection(
        "UPPER BERTHS",
        "10 berths"
    );

    upperSection.appendChild(
        createVerticalGrid(
            upperBerths,
            "mixed",
            "berth",
            2
        )
    );

    const berthDecks = document.createElement("div");
    berthDecks.className = "mixed-berth-decks";

    berthDecks.appendChild(lowerSection);
    berthDecks.appendChild(upperSection);

    sleeperSection.appendChild(berthDecks);

    mixedContainer.appendChild(seaterSection);
    mixedContainer.appendChild(sleeperSection);

    seatLayout.appendChild(mixedContainer);
}

// ======================================================
// SELECT OR DESELECT POSITIONS
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
                `You can select a maximum of ${MAX_SEATS_PER_BOOKING} seats or berths.`
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
// DISPLAY SELECTED SEATS / BERTHS
// ======================================================

function renderSelectedSeats() {
    selectedSeatsContainer.innerHTML = "";

    if (selectedSeats.length === 0) {
        selectedSeatsContainer.innerHTML = `
            <span class="muted-text">
                No seats or berths selected
            </span>
        `;
        return;
    }

    const vehicleType = getVehicleType(selectedTrip);

    selectedSeats.forEach(seatNumber => {
        const chip = document.createElement("span");

        chip.className = "seat-chip";

        chip.textContent = getSeatDisplayLabel(
            seatNumber,
            vehicleType
        );

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
// Numeric backend seat IDs are sent unchanged.
// ======================================================

confirmButton.addEventListener("click", async function () {
    if (isBooking) return;

    if (!selectedTrip || selectedSeats.length === 0) {
        showToast(
            "Please select a trip and at least one seat or berth."
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

        // Keep numeric IDs for backend compatibility.
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

        renderSeatLayout();
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
            Search for a trip and select it to load the vehicle layout.
        </div>
    `;

    if (busContainer) {
        busContainer.classList.remove(
            "seater-vehicle",
            "sleeper-vehicle",
            "mixed-vehicle"
        );
    }

    if (columnLabels) {
        columnLabels.hidden = true;
    }

    bookingResult.hidden = true;

    renderSelectedSeats();
    updateBookingSummary();
}
