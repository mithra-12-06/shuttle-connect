
"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. CONFIGURATION AND SESSION
    // ==========================================

    const API_BASE_URL = "http://localhost:3000/api";
    const LOGIN_PAGE = "captain-dashboard.html";

    const captainToken =
        localStorage.getItem("captainToken") ||
        sessionStorage.getItem("captainToken");

    const captainInfoString =
        localStorage.getItem("captainInfo") ||
        sessionStorage.getItem("captainInfo");

    if (!captainToken) {
        window.location.replace(LOGIN_PAGE);
        return;
    }

    let captainInfo = {};

    try {
        captainInfo = captainInfoString
            ? JSON.parse(captainInfoString)
            : {};
    } catch {
        captainInfo = {};
    }

    // ==========================================
    // 2. HTML ELEMENTS
    // ==========================================

    const captainName = document.getElementById("captainName");
    const availabilityStatus = document.getElementById("availabilityStatus");
    const availabilityButton = document.getElementById("availabilityButton");
    const availabilityMessage = document.getElementById("availabilityMessage");

    const requestCount = document.getElementById("requestCount");
    const activeRideStatus = document.getElementById("activeRideStatus");
    const vehicleCategory = document.getElementById("vehicleCategory");

    const availableRides = document.getElementById("availableRides");
    const requestMessage = document.getElementById("requestMessage");
    const activeRideContainer = document.getElementById("activeRideContainer");

    const refreshButton = document.getElementById("refreshButton");
    const logoutButton = document.getElementById("logoutButton");

    let currentAvailability = "offline";
    let refreshInProgress = false;
    let availabilityInProgress = false;
    let actionInProgress = false;
    let refreshTimer = null;

    const ACTIVE_STATUSES = [
        "accepted",
        "captain_en_route",
        "arrived_at_pickup",
        "passenger_boarded",
        "in_progress"
    ];

    // ==========================================
    // 3. API HELPER
    // ==========================================

    async function apiRequest(endpoint, options = {}) {

        const headers = {
            Authorization: `Bearer ${captainToken}`,
            ...(options.headers || {})
        };

        if (options.body) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,
                headers
            }
        );

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("Invalid server response.");
        }

        if (response.status === 401) {
            clearCaptainSession();
            window.location.replace(LOGIN_PAGE);

            throw new Error(
                "Your session has expired. Please sign in again."
            );
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || "Something went wrong."
            );
        }

        return result;
    }

    // ==========================================
    // 4. SESSION MANAGEMENT
    // ==========================================

    function clearCaptainSession() {

        localStorage.removeItem("captainToken");
        localStorage.removeItem("captainInfo");

        sessionStorage.removeItem("captainToken");
        sessionStorage.removeItem("captainInfo");
    }

    logoutButton.addEventListener("click", () => {

        if (refreshTimer) {
            clearInterval(refreshTimer);
        }

        clearCaptainSession();

        window.location.replace(LOGIN_PAGE);
    });

    // ==========================================
    // 5. SAFE HTML AND FORMATTING
    // ==========================================

    function escapeHtml(value) {

        return String(value ?? "").replace(
            /[&<>"']/g,
            character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[character]
        );
    }

    function formatCategory(value) {

        const labels = {
            two_wheeler: "Two-wheeler",
            auto: "Auto",
            car: "Car"
        };

        return labels[value] || value || "—";
    }

    function formatFare(value) {

        const amount = Number(value);

        return Number.isFinite(amount)
            ? `₹${amount.toFixed(2)}`
            : "Not available";
    }

    // ==========================================
    // 6. AVAILABILITY DISPLAY
    // ==========================================

    function updateAvailabilityUI(status) {

        currentAvailability = status || "offline";

        availabilityStatus.textContent =
            currentAvailability.replaceAll("_", " ");

        availabilityStatus.className =
            `status-pill ${currentAvailability}`;

        if (currentAvailability === "available") {

            availabilityButton.textContent = "Go Offline";
            availabilityButton.classList.add("offline-action");
            availabilityButton.disabled = false;

        } else if (currentAvailability === "offline") {

            availabilityButton.textContent = "Go Online";
            availabilityButton.classList.remove("offline-action");
            availabilityButton.disabled = false;

        } else {

            availabilityButton.textContent =
                currentAvailability === "on_ride"
                    ? "Ride in Progress"
                    : "Unavailable";

            availabilityButton.classList.remove("offline-action");
            availabilityButton.disabled = true;
        }
    }

    // ==========================================
    // 7. UPDATE CAPTAIN AVAILABILITY
    // ==========================================

    availabilityButton.addEventListener("click", async () => {

        if (
            availabilityInProgress ||
            !["available", "offline"].includes(currentAvailability)
        ) {
            return;
        }

        const nextStatus =
            currentAvailability === "available"
                ? "offline"
                : "available";

        availabilityInProgress = true;
        availabilityButton.disabled = true;

        availabilityMessage.textContent =
            "Updating your availability...";

        try {

            const result = await apiRequest(
                "/captain/availability",
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        availability_status: nextStatus
                    })
                }
            );

            updateAvailabilityUI(result.availability_status);

            availabilityMessage.textContent =
                result.message || "Availability updated.";

            await loadCaptainRides();

        } catch (error) {

            availabilityMessage.textContent = error.message;

        } finally {

            availabilityInProgress = false;

            if (
                currentAvailability === "available" ||
                currentAvailability === "offline"
            ) {
                availabilityButton.disabled = false;
            }
        }
    });

    // ==========================================
    // 8. RENDER AVAILABLE RIDE REQUESTS
    // ==========================================

    function renderAvailableRides(rides) {

        availableRides.replaceChildren();

        requestCount.textContent = rides.length;

        if (rides.length === 0) {

            const empty = document.createElement("div");
            empty.className = "empty-state";

            const title = document.createElement("h3");
            title.textContent = "No ride requests available";

            const description = document.createElement("p");

            description.textContent =
                currentAvailability === "available"
                    ? "New matching requests will appear here automatically."
                    : "Go online to receive matching ride requests.";

            empty.append(title, description);

            availableRides.appendChild(empty);

            return;
        }

        rides.forEach(ride => {

            const card = document.createElement("article");
            card.className = "ride-card";

            const canAccept =
                currentAvailability === "available" &&
                !actionInProgress;

            card.innerHTML = `
                <div class="ride-card-top">
                    <span class="ride-reference">
                        ${escapeHtml(ride.ride_reference)}
                    </span>

                    <span class="ride-type">
                        ${escapeHtml(formatCategory(ride.transport_type))}
                    </span>
                </div>

                <div class="ride-location">
                    <span class="location-marker"></span>

                    <div class="location-content">
                        <span>Pickup location</span>
                        <strong>
                            ${escapeHtml(ride.pickup_address)}
                        </strong>
                    </div>
                </div>

                <div class="ride-location">
                    <span class="location-marker dropoff"></span>

                    <div class="location-content">
                        <span>Drop-off location</span>
                        <strong>
                            ${escapeHtml(ride.dropoff_address)}
                        </strong>
                    </div>
                </div>

                <div class="ride-card-bottom">
                    <span class="ride-fare">
                        ${escapeHtml(formatFare(ride.estimated_fare))}
                    </span>

                    <button
                        type="button"
                        class="primary-button accept-button"
                        data-ride-id="${Number(ride.ride_id)}"
                        ${canAccept ? "" : "disabled"}
                    >
                        Accept Ride
                    </button>
                </div>
            `;

            availableRides.appendChild(card);
        });
    }

    // ==========================================
    // 9. RENDER ACTIVE RIDE
    // ==========================================

    function renderActiveRide(ride) {

        activeRideContainer.replaceChildren();

        if (!ride) {

            const empty = document.createElement("div");
            empty.className = "empty-state";

            const title = document.createElement("h3");
            title.textContent = "No active ride";

            const description = document.createElement("p");

            description.textContent =
                "When you accept a request, its details will appear here.";

            empty.append(title, description);

            activeRideContainer.appendChild(empty);

            activeRideStatus.textContent = "None";

            return;
        }

        activeRideStatus.textContent =
            ride.ride_status.replaceAll("_", " ");

        const card = document.createElement("div");
        card.className = "active-ride-card";

        // Important: Keep the ride ID on the card.
        // The OTP form uses this ID to start the correct ride.
        card.dataset.rideId = ride.ride_id;

        card.innerHTML = `
            <div class="active-ride-heading">
                <h3>
                    ${escapeHtml(ride.ride_reference)}
                </h3>

                <span class="ride-status-text">
                    ${escapeHtml(
                        ride.ride_status.replaceAll("_", " ")
                    )}
                </span>
            </div>

            <div class="ride-location">
                <span class="location-marker"></span>

                <div class="location-content">
                    <span>Pickup location</span>
                    <strong>
                        ${escapeHtml(ride.pickup_address)}
                    </strong>
                </div>
            </div>

            <div class="ride-location">
                <span class="location-marker dropoff"></span>

                <div class="location-content">
                    <span>Drop-off location</span>
                    <strong>
                        ${escapeHtml(ride.dropoff_address)}
                    </strong>
                </div>
            </div>

            <div class="ride-card-bottom">
                <span>Estimated fare</span>

                <strong class="ride-fare">
                    ${escapeHtml(formatFare(ride.estimated_fare))}
                </strong>
            </div>
        `;

        // --------------------------------------
        // ACCEPTED RIDE: SHOW OTP FORM
        // --------------------------------------

        if (ride.ride_status === "accepted") {

            const otpPanel = document.createElement("div");
            otpPanel.className = "otp-panel";

            otpPanel.innerHTML = `
                <h3>Verify Passenger OTP</h3>

                <p>
                    Ask the passenger for the six-digit OTP
                    displayed in their ShuttleConnect booking page.
                </p>

                <form class="otp-form" id="otpForm">

                    <input
                        type="text"
                        id="otpInput"
                        class="otp-input"
                        inputmode="numeric"
                        pattern="[0-9]{6}"
                        maxlength="6"
                        placeholder="000000"
                        autocomplete="one-time-code"
                        required
                    >

                    <button
                        type="submit"
                        class="primary-button"
                        id="startRideButton"
                    >
                        Verify & Start Ride
                    </button>

                </form>

                <p
                    id="otpMessage"
                    class="otp-message"
                    role="status"
                    aria-live="polite"
                ></p>
            `;

            card.appendChild(otpPanel);

            otpPanel
                .querySelector("#otpForm")
                .addEventListener(
                    "submit",
                    handleOtpSubmission
                );
        }

        // --------------------------------------
        // RIDE ALREADY STARTED
        // --------------------------------------

        else if (ride.ride_status === "in_progress") {

            const message = document.createElement("div");
            message.className = "otp-panel";

            const title = document.createElement("h3");
            title.textContent = "Ride started successfully";

            const description = document.createElement("p");

            description.textContent =
                "The passenger OTP has been verified. This ride is now in progress.";

            message.append(title, description);

            card.appendChild(message);
        }

        // --------------------------------------
        // OTHER ACTIVE STATUSES
        // --------------------------------------

        else {

            const message = document.createElement("div");
            message.className = "otp-panel";

            const description = document.createElement("p");

            description.textContent =
                "Your ride is currently assigned to you.";

            message.appendChild(description);

            card.appendChild(message);
        }

        activeRideContainer.appendChild(card);
    }

    // ==========================================
    // 10. LOAD CAPTAIN RIDES
    // ==========================================

    async function loadCaptainRides() {

        if (refreshInProgress) {
            return;
        }

        refreshInProgress = true;

        try {

            const result = await apiRequest(
                "/captain/last-mile/rides",
                {
                    method: "GET"
                }
            );

            const captain = result.captain || {};

            const rides = Array.isArray(result.rides)
                ? result.rides
                : [];

            captainName.textContent =
                captain.full_name ||
                captainInfo.full_name ||
                "Captain";

            vehicleCategory.textContent =
                formatCategory(captain.vehicle_category);

            updateAvailabilityUI(
                captain.availability_status
            );

            // Available requests are unassigned requests
            // matching the captain's registered vehicle.

            const availableRequests = rides.filter(
                ride => ride.ride_status === "requested"
            );

            // The backend returns active rides assigned
            // to the authenticated captain.

            const activeRides = rides.filter(
                ride => ACTIVE_STATUSES.includes(ride.ride_status)
            );

            const activeRide = activeRides.length > 0
                ? activeRides[0]
                : null;

            renderAvailableRides(availableRequests);

            renderActiveRide(activeRide);

            requestMessage.textContent =
                availableRequests.length > 0
                    ? `${availableRequests.length} matching ride request(s) found.`
                    : "No matching ride requests at the moment.";

            requestMessage.classList.remove("error");

        } catch (error) {

            console.error(
                "Load captain rides error:",
                error
            );

            requestMessage.textContent = error.message;
            requestMessage.classList.add("error");

        } finally {

            refreshInProgress = false;
        }
    }

    // ==========================================
    // 11. ACCEPT A RIDE
    // ==========================================

    availableRides.addEventListener(
        "click",
        async event => {

            const button = event.target.closest(".accept-button");

            if (!button || actionInProgress) {
                return;
            }

            const rideId = Number(button.dataset.rideId);

            if (!Number.isInteger(rideId) || rideId <= 0) {
                return;
            }

            if (currentAvailability !== "available") {

                requestMessage.textContent =
                    "Go online before accepting a ride.";

                requestMessage.classList.add("error");

                return;
            }

            actionInProgress = true;

            button.disabled = true;
            button.textContent = "Accepting...";

            try {

                const result = await apiRequest(
                    `/captain/last-mile/rides/${rideId}/accept`,
                    {
                        method: "POST"
                    }
                );

                requestMessage.textContent =
                    result.message ||
                    "Ride accepted successfully.";

                await loadCaptainRides();

            } catch (error) {

                requestMessage.textContent = error.message;
                requestMessage.classList.add("error");

                await loadCaptainRides();

            } finally {

                actionInProgress = false;
            }
        }
    );

    // ==========================================
    // 12. VERIFY OTP AND START RIDE
    // ==========================================

    async function handleOtpSubmission(event) {

        event.preventDefault();

        if (actionInProgress) {
            return;
        }

        const form = event.currentTarget;

        const otpInput = form.querySelector("#otpInput");
        const startButton = form.querySelector("#startRideButton");
        const otpMessage = form.querySelector("#otpMessage");

        const otp = otpInput.value.trim();

        if (!/^\d{6}$/.test(otp)) {

            otpMessage.textContent =
                "Please enter a valid six-digit OTP.";

            otpMessage.className =
                "otp-message error";

            otpInput.focus();

            return;
        }

        // Retrieve the ride ID saved on the active card.

        const activeCard = activeRideContainer.querySelector(
            ".active-ride-card"
        );

        const rideId = activeCard?.dataset.rideId;

        if (!rideId) {

            otpMessage.textContent =
                "Ride information is unavailable. Refresh and try again.";

            otpMessage.className =
                "otp-message error";

            return;
        }

        actionInProgress = true;

        startButton.disabled = true;
        startButton.textContent = "Verifying...";

        try {

            const result = await apiRequest(
                `/captain/last-mile/rides/${rideId}/start`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        otp: otp
                    })
                }
            );

            otpMessage.textContent =
                result.message ||
                "Ride started successfully.";

            otpMessage.className =
                "otp-message success";

            await loadCaptainRides();

        } catch (error) {

            otpMessage.textContent = error.message;

            otpMessage.className =
                "otp-message error";

            startButton.disabled = false;

            startButton.textContent =
                "Verify & Start Ride";

        } finally {

            actionInProgress = false;
        }
    }

    // ==========================================
    // 13. MANUAL REFRESH
    // ==========================================

    refreshButton.addEventListener("click", async () => {

        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";

        await loadCaptainRides();

        refreshButton.disabled = false;
        refreshButton.textContent = "Refresh";
    });

    // ==========================================
    // 14. INITIALIZE DASHBOARD
    // ==========================================

    async function initializeDashboard() {

        captainName.textContent =
            captainInfo.full_name || "Captain";

        await loadCaptainRides();

        refreshTimer = setInterval(() => {

            if (
                document.visibilityState === "visible" &&
                !actionInProgress &&
                !availabilityInProgress
            ) {
                loadCaptainRides();
            }

        }, 8000);
    }

    initializeDashboard();

    // ==========================================
    // 15. CLEANUP
    // ==========================================

    window.addEventListener("beforeunload", () => {

        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
    });

});
