
"use strict";

// =====================================================
// SHUTTLECONNECT - PASSENGER RIDE TRACKING
// Captain Details + Vehicle Information + Start OTP
// =====================================================

const PASSENGER_TRACKING_API =
    "http://localhost:3000/api";

const TRACKING_STORAGE_KEY =
    "lastMileRideReference";

const TRACKING_REFRESH_INTERVAL = 7000;

let passengerTrackingTimer = null;
let passengerTrackingInProgress = false;

// =====================================================
// AUTHENTICATION
// =====================================================

function getPassengerTrackingToken() {
    return localStorage.getItem("token");
}

// =====================================================
// DOM HELPERS
// =====================================================

function getCaptainPanel() {
    return document.querySelector(".captain-placeholder");
}

function setTrackingText(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function createTrackingElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

// =====================================================
// API REQUEST
// =====================================================

async function fetchPassengerRideTracking() {
    const token = getPassengerTrackingToken();

    if (!token) {
        stopPassengerRideTracking();
        return null;
    }

    const response = await fetch(
        `${PASSENGER_TRACKING_API}/passenger/last-mile/rides`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        }
    );

    const result = await response.json();

    if (response.status === 401) {
        stopPassengerRideTracking();
        throw new Error("Your passenger session has expired.");
    }

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ||
            "Unable to retrieve ride information."
        );
    }

    return Array.isArray(result.rides)
        ? result.rides
        : [];
}

// =====================================================
// RIDE REFERENCE
// =====================================================

function rememberPassengerRideReference(reference) {
    if (!reference) return;

    localStorage.setItem(
        TRACKING_STORAGE_KEY,
        String(reference)
    );
}

function getRememberedPassengerRideReference() {
    return localStorage.getItem(
        TRACKING_STORAGE_KEY
    );
}

// =====================================================
// CAPTAIN PANEL
// =====================================================

function renderCaptainPlaceholder(message, description) {
    const panel = getCaptainPanel();

    if (!panel) return;

    panel.replaceChildren();

    const avatar = createTrackingElement(
        "div",
        "captain-avatar",
        "?"
    );

    const content = createTrackingElement(
        "div",
        "captain-tracking-content"
    );

    const heading = createTrackingElement(
        "strong",
        "",
        message
    );

    const paragraph = createTrackingElement(
        "p",
        "",
        description
    );

    content.append(heading, paragraph);
    panel.append(avatar, content);
}

function renderCaptainDetails(ride) {
    const panel = getCaptainPanel();

    if (!panel) return;

    const captain = ride.captain;

    if (!captain) {
        renderCaptainPlaceholder(
            "Waiting for Captain",
            "Your ride has been accepted, but captain information is not available yet."
        );

        return;
    }

    panel.replaceChildren();

    const avatar = createTrackingElement(
        "div",
        "captain-avatar",
        captain.name
            ? captain.name.trim().charAt(0).toUpperCase()
            : "C"
    );

    const content = createTrackingElement(
        "div",
        "captain-tracking-content"
    );

    const heading = createTrackingElement(
        "strong",
        "",
        captain.name || "Captain"
    );

    const vehicleDetails = [
        captain.vehicle_type,
        captain.vehicle_model,
        captain.vehicle_color
    ].filter(Boolean);

    const vehicle = createTrackingElement(
        "p",
        "",
        vehicleDetails.length
            ? vehicleDetails.join(" • ")
            : "Vehicle information unavailable"
    );

    const registration = createTrackingElement(
        "p",
        "captain-registration",
        captain.vehicle_registration
            ? `Registration: ${captain.vehicle_registration}`
            : "Registration unavailable"
    );

    const reference = createTrackingElement(
        "p",
        "captain-ride-reference",
        `Ride reference: ${ride.ride_reference || "Not available"}`
    );

    content.append(
        heading,
        vehicle,
        registration,
        reference
    );

    panel.append(avatar, content);
}

// =====================================================
// RIDE STATUS
// =====================================================

function formatRideStatus(status) {
    const statusLabels = {
        requested: "Waiting for Captain",
        accepted: "Captain Assigned",
        captain_en_route: "Captain On The Way",
        arrived_at_pickup: "Captain Arrived",
        passenger_boarded: "Passenger Boarded",
        in_progress: "Ride In Progress",
        completed: "Ride Completed",
        rejected: "Ride Rejected",
        cancelled: "Ride Cancelled"
    };

    return statusLabels[status] ||
        String(status || "Status unavailable")
            .replaceAll("_", " ");
}

function renderRideStatus(ride) {
    let statusElement =
        document.getElementById("passengerRideStatus");

    if (!statusElement) {
        statusElement = createTrackingElement(
            "div",
            "passenger-ride-status"
        );

        statusElement.id = "passengerRideStatus";

        const panel = getCaptainPanel();

        if (panel && panel.parentElement) {
            panel.parentElement.insertBefore(
                statusElement,
                panel
            );
        }
    }

    setTrackingText(
        statusElement,
        `Ride Status: ${formatRideStatus(ride.ride_status)}`
    );
}

// =====================================================
// START OTP
// =====================================================

function renderStartOtp(ride) {
    let otpContainer =
        document.getElementById("passengerStartOtp");

    if (!otpContainer) {
        otpContainer = createTrackingElement(
            "section",
            "passenger-start-otp"
        );

        otpContainer.id = "passengerStartOtp";

        const panel = getCaptainPanel();

        if (panel && panel.parentElement) {
            panel.parentElement.insertBefore(
                otpContainer,
                panel.nextSibling
            );
        }
    }

    otpContainer.replaceChildren();

    const status = ride.ride_status;

    if (
        status !== "accepted" ||
        !ride.start_otp
    ) {
        otpContainer.hidden = true;
        return;
    }

    otpContainer.hidden = false;

    const heading = createTrackingElement(
        "h3",
        "",
        "Your Ride Start OTP"
    );

    const instruction = createTrackingElement(
        "p",
        "",
        "Share this OTP with your captain when you are ready to start your ride."
    );

    const otp = createTrackingElement(
        "strong",
        "passenger-otp-code",
        String(ride.start_otp)
    );

    otpContainer.append(
        heading,
        instruction,
        otp
    );
}

// =====================================================
// RIDE STATUS RENDERING
// =====================================================

function renderPassengerRide(ride) {
    if (!ride) return;

    renderRideStatus(ride);

    const status = ride.ride_status;

    if (
        status === "requested"
    ) {
        renderCaptainPlaceholder(
            "Waiting for Captain",
            "Your ride request has been submitted. We are looking for an available captain."
        );
    } else if (
        [
            "accepted",
            "captain_en_route",
            "arrived_at_pickup",
            "passenger_boarded",
            "in_progress",
            "completed"
        ].includes(status)
    ) {
        renderCaptainDetails(ride);
    } else {
        renderCaptainPlaceholder(
            formatRideStatus(status),
            `Ride reference: ${ride.ride_reference || "Not available"}`
        );
    }

    renderStartOtp(ride);
}

// =====================================================
// LOAD LATEST PASSENGER RIDE
// =====================================================

async function loadPassengerRideTracking() {
    if (passengerTrackingInProgress) return;

    passengerTrackingInProgress = true;

    try {
        const rides =
            await fetchPassengerRideTracking();

        if (!rides) return;

        const rememberedReference =
            getRememberedPassengerRideReference();

        let selectedRide = null;

        if (rememberedReference) {
            selectedRide = rides.find(
                ride =>
                    String(ride.ride_reference) ===
                    String(rememberedReference)
            );
        } else if (rides.length > 0) {
            selectedRide = rides[0];

            rememberPassengerRideReference(
                selectedRide.ride_reference
            );
        }

        if (!selectedRide) {
            return;
        }

        renderPassengerRide(selectedRide);

        if (
            [
                "completed",
                "rejected",
                "cancelled"
            ].includes(selectedRide.ride_status)
        ) {
            stopPassengerRideTracking();
        }

    } catch (error) {
        console.error(
            "Passenger ride tracking error:",
            error
        );

    } finally {
        passengerTrackingInProgress = false;
    }
}

// =====================================================
// TRACKING CONTROLS
// =====================================================

function startPassengerRideTracking() {
    stopPassengerRideTracking();

    loadPassengerRideTracking();

    passengerTrackingTimer = setInterval(
        loadPassengerRideTracking,
        TRACKING_REFRESH_INTERVAL
    );
}

function stopPassengerRideTracking() {
    if (passengerTrackingTimer) {
        clearInterval(passengerTrackingTimer);
        passengerTrackingTimer = null;
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {
        if (!getPassengerTrackingToken()) {
            return;
        }

        startPassengerRideTracking();
    }
);
