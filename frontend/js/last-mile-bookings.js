
"use strict";

// =====================================================
// SHUTTLECONNECT - LAST-MILE BOOKINGS
// GPS + Manual Pickup Search + Destination Autocomplete
// Photon Geocoding + Leaflet
//
// Frontend preview only.
// No Last-Mile booking API exists yet.
// =====================================================

const API_BASE_URL = "http://localhost:3000/api";

const NOMINATIM_URL =
    "https://nominatim.openstreetmap.org/reverse";

const PHOTON_URL =
    "https://photon.komoot.io/api/";

// =====================================================
// DOM ELEMENTS
// =====================================================

const bookingLoading =
    document.getElementById("bookingLoading");

const bookingError =
    document.getElementById("bookingError");

const noBookingsMessage =
    document.getElementById("noBookingsMessage");

const bookingSelectionArea =
    document.getElementById("bookingSelectionArea");

const shuttleBookingSelect =
    document.getElementById("shuttleBookingSelect");

const dropoffLocation =
    document.getElementById("dropoffLocation");

const pickupLocationInput =
    document.getElementById("pickupLocationInput");

const pickupSuggestions =
    document.getElementById("pickupSuggestions");

const pickupSelectionStatus =
    document.getElementById("pickupSelectionStatus");

const destinationSuggestions =
    document.getElementById("destinationSuggestions");

const destinationSelectionStatus =
    document.getElementById("destinationSelectionStatus");

const finalDestination =
    document.getElementById("finalDestination");

const reviewRideButton =
    document.getElementById("reviewRideButton");

const reviewResult =
    document.getElementById("reviewResult");

const transportSelectionSection =
    document.getElementById("transportSelectionSection");

const transportServiceCards =
    document.querySelectorAll("[data-transport-service]");

const confirmTransportSelectionButton =
    document.getElementById("confirmTransportSelectionButton");

const transportSelectionStatus =
    document.getElementById("transportSelectionStatus");

const introDropoff =
    document.getElementById("introDropoff");

const introDestination =
    document.getElementById("introDestination");

// =====================================================
// APPLICATION STATE
// =====================================================

let upcomingBookings = [];
let selectedBooking = null;
let selectedTransportService = "";

// Pickup location
let passengerCoordinates = null;
let passengerLocationText = "";

// Destination location
let destinationCoordinates = null;
let destinationLocationText = "";

// Leaflet map
let lastMileMap = null;

let passengerMarker = null;
let destinationMarker = null;
let accuracyCircle = null;

let mapInitialized = false;

// GPS interface
let locationButton = null;
let locationStatus = null;

// Search state
let pickupSearchTimer = null;
let destinationSearchTimer = null;

let pickupSearchController = null;
let destinationSearchController = null;

let pickupSearchRequestId = 0;
let destinationSearchRequestId = 0;

let pickupSearchResults = [];
let destinationSearchResults = [];

// =====================================================
// AUTHENTICATION
// =====================================================

function getAuthToken() {
    return localStorage.getItem("token");
}

// =====================================================
// DATE FORMATTING
// =====================================================

function parseDate(value) {
    if (!value) return null;

    const normalized = String(value).includes("T")
        ? String(value)
        : String(value).replace(" ", "T");

    const date = new Date(normalized);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    const date = parseDate(value);

    if (!date) return "Not specified";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

// =====================================================
// API REQUEST
// Existing backend endpoints are unchanged.
// =====================================================

async function apiRequest(endpoint) {
    const token = getAuthToken();

    if (!token) {
        throw new Error(
            "Please log in to view your shuttle bookings."
        );
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
    } catch {
        throw new Error(
            "Unable to connect to ShuttleConnect. Please check whether the backend server is running."
        );
    }

    const responseText = await response.text();

    let result = {};

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(
                "The server returned an invalid response."
            );
        }
    }

    if (response.status === 401) {
        localStorage.removeItem("token");

        throw new Error(
            "Your session has expired. Please log in again."
        );
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            "Unable to retrieve your shuttle bookings."
        );
    }

    return result;
}

// =====================================================
// UPCOMING BOOKING ELIGIBILITY
// Confirmed + scheduled + future departure.
// =====================================================

function isUpcomingBooking(booking) {
    if (
        String(booking.booking_status).toLowerCase() !== "confirmed"
    ) {
        return false;
    }

    if (
        String(booking.trip_status).toLowerCase() !== "scheduled"
    ) {
        return false;
    }

    const departure = parseDate(
        booking.departure_datetime
    );

    return departure && departure.getTime() > Date.now();
}

// =====================================================
// LOAD PASSENGER BOOKINGS
// =====================================================

async function loadUpcomingBookings() {
    if (bookingLoading) bookingLoading.hidden = false;
    if (bookingError) bookingError.hidden = true;
    if (noBookingsMessage) noBookingsMessage.hidden = true;
    if (bookingSelectionArea) bookingSelectionArea.hidden = true;

    try {
        if (!getAuthToken()) {
            if (bookingLoading) {
                bookingLoading.hidden = true;
            }

            if (bookingError) {
                bookingError.textContent =
                    "Please log in to view your upcoming shuttle bookings.";

                bookingError.hidden = false;
            }

            return;
        }

        const result = await apiRequest(
            "/passenger/bookings"
        );

        const allBookings = Array.isArray(result.bookings)
            ? result.bookings
            : [];

        upcomingBookings = allBookings
            .filter(isUpcomingBooking)
            .sort((a, b) => {
                return (
                    parseDate(a.departure_datetime) -
                    parseDate(b.departure_datetime)
                );
            });

        if (bookingLoading) {
            bookingLoading.hidden = true;
        }

        if (upcomingBookings.length === 0) {
            if (noBookingsMessage) {
                noBookingsMessage.hidden = false;
            }

            return;
        }

        populateBookingSelector();

        if (bookingSelectionArea) {
            bookingSelectionArea.hidden = false;
        }

        selectBooking(
            upcomingBookings[0].booking_id
        );

    } catch (error) {
        if (bookingLoading) {
            bookingLoading.hidden = true;
        }

        if (bookingError) {
            bookingError.textContent = error.message;
            bookingError.hidden = false;

            if (
                error.message.toLowerCase().includes("log in") ||
                error.message.toLowerCase().includes("session has expired")
            ) {
                const loginLink =
                    document.createElement("a");

                loginLink.href = "login.html";
                loginLink.textContent = " Go to Login";
                loginLink.className = "outline-link";

                bookingError.appendChild(
                    document.createElement("br")
                );

                bookingError.appendChild(loginLink);
            }
        }

        console.error(
            "Last-Mile booking loading error:",
            error
        );
    }
}

// =====================================================
// BOOKING SELECTOR
// =====================================================

function populateBookingSelector() {
    if (!shuttleBookingSelect) return;

    shuttleBookingSelect.innerHTML = `
        <option value="">Choose a shuttle booking</option>
    `;

    upcomingBookings.forEach(booking => {
        const option = document.createElement("option");

        option.value = String(booking.booking_id);

        option.textContent =
            `${booking.booking_reference || "Booking"} — ` +
            `${booking.origin || "Origin"} to ${booking.destination || "Destination"} — ` +
            `${formatDateTime(booking.departure_datetime)}`;

        shuttleBookingSelect.appendChild(option);
    });
}

function selectBooking(bookingId) {
    selectedBooking = upcomingBookings.find(
        booking =>
            String(booking.booking_id) === String(bookingId)
    );

    if (!selectedBooking) return;

    if (shuttleBookingSelect) {
        shuttleBookingSelect.value = String(bookingId);
    }

    renderSelectedBooking();
    updatePagePreview();
    updateReviewSummary();
}

// =====================================================
// SELECTED SHUTTLE BOOKING
// =====================================================

function renderSelectedBooking() {
    if (!selectedBooking) return;

    const setText = (id, value) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    };

    setText(
        "selectedBookingReference",
        selectedBooking.booking_reference || "Not specified"
    );

    setText(
        "shuttleOrigin",
        selectedBooking.origin || "Not specified"
    );

    setText(
        "shuttleDestination",
        selectedBooking.destination || "Not specified"
    );

    setText(
        "shuttleDeparture",
        formatDateTime(
            selectedBooking.departure_datetime
        )
    );

    setText(
        "shuttleArrival",
        formatDateTime(
            selectedBooking.arrival_datetime
        )
    );

    const seats = Array.isArray(selectedBooking.seats)
        ? selectedBooking.seats
            .filter(seat => seat.seat_status === "booked")
            .map(seat => seat.seat_number)
        : [];

    setText(
        "shuttleSeats",
        seats.length
            ? seats.join(", ")
            : String(
                selectedBooking.number_of_seats ||
                "Not specified"
            )
    );
}

// =====================================================
// GPS PICKUP INTERFACE
// =====================================================

function initializeGPSInterface() {
    if (dropoffLocation) {
        dropoffLocation.hidden = true;
        dropoffLocation.style.display = "none";
    }

    locationButton = document.getElementById(
        "useCurrentLocationButton"
    );

    locationStatus = document.getElementById(
        "gpsLocationStatus"
    );

    if (!locationButton || !locationStatus) {
        console.error(
            "GPS interface elements are missing from the HTML."
        );

        return;
    }

    locationButton.addEventListener(
        "click",
        detectPassengerLocation
    );
}

// =====================================================
// MAP INITIALIZATION
// Initial view covers Tamil Nadu.
// This is not a location restriction.
// =====================================================

async function initializeLastMileMap() {
    if (mapInitialized && lastMileMap) {
        return;
    }

    if (!window.L) {
        throw new Error(
            "Leaflet could not be loaded. Check your internet connection."
        );
    }

    const mapContainer =
        document.getElementById("lastMileMap");

    if (!mapContainer) {
        throw new Error(
            "The map container was not found."
        );
    }

    lastMileMap = L.map(mapContainer, {
        scrollWheelZoom: true
    }).setView([10.95, 78.35], 7);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
            maxZoom: 19
        }
    ).addTo(lastMileMap);

    mapInitialized = true;

    requestAnimationFrame(() => {
        lastMileMap.invalidateSize();
    });

    console.log(
        "Tamil Nadu-wide Last-Mile map initialized."
    );
}

// =====================================================
// MAP MARKER ICONS
// =====================================================

function createPickupIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="gps-passenger-marker"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

function createDestinationIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="destination-map-marker"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

// =====================================================
// UPDATE PICKUP MARKER
// =====================================================

async function updatePickupMarker() {
    await initializeLastMileMap();

    const coordinates = [
        passengerCoordinates.latitude,
        passengerCoordinates.longitude
    ];

    if (passengerMarker) {
        lastMileMap.removeLayer(passengerMarker);
    }

    if (accuracyCircle) {
        lastMileMap.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }

    passengerMarker = L.marker(coordinates, {
        icon: createPickupIcon()
    }).addTo(lastMileMap);

    passengerMarker.bindPopup(
        `<strong>${escapeHTML(passengerLocationText)}</strong>`
    );

    if (passengerCoordinates.accuracy) {
        accuracyCircle = L.circle(coordinates, {
            radius: passengerCoordinates.accuracy,
            color: "#d4a94f",
            fillColor: "#d4a94f",
            fillOpacity: 0.10,
            weight: 1
        }).addTo(lastMileMap);
    }

    fitMapToSelectedLocations();
}

// =====================================================
// UPDATE DESTINATION MARKER
// =====================================================

async function updateDestinationMarker() {
    await initializeLastMileMap();

    if (!destinationCoordinates) return;

    const coordinates = [
        destinationCoordinates.latitude,
        destinationCoordinates.longitude
    ];

    if (destinationMarker) {
        lastMileMap.removeLayer(destinationMarker);
    }

    destinationMarker = L.marker(coordinates, {
        icon: createDestinationIcon()
    }).addTo(lastMileMap);

    destinationMarker.bindPopup(
        `<strong>${escapeHTML(destinationLocationText)}</strong>`
    );

    fitMapToSelectedLocations();
}

// =====================================================
// FIT MAP TO PICKUP AND DESTINATION
// =====================================================

function fitMapToSelectedLocations() {
    if (!lastMileMap) return;

    const points = [];

    if (passengerCoordinates) {
        points.push([
            passengerCoordinates.latitude,
            passengerCoordinates.longitude
        ]);
    }

    if (destinationCoordinates) {
        points.push([
            destinationCoordinates.latitude,
            destinationCoordinates.longitude
        ]);
    }

    if (points.length === 2) {
        const bounds = L.latLngBounds(points);

        lastMileMap.fitBounds(bounds, {
            padding: [45, 45],
            maxZoom: 15
        });

    } else if (points.length === 1) {
        lastMileMap.setView(points[0], 15);
    }

    requestAnimationFrame(() => {
        lastMileMap.invalidateSize();
    });
}

// =====================================================
// REVERSE GEOCODING
// GPS coordinates -> readable address.
// =====================================================

async function reverseGeocode(latitude, longitude) {
    const url = new URL(NOMINATIM_URL);

    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(
            `Address lookup failed with status ${response.status}.`
        );
    }

    const data = await response.json();

    if (!data) {
        throw new Error(
            "No readable address was returned."
        );
    }

    if (data.address) {
        const address = data.address;

        const placeName =
            address.amenity ||
            address.building ||
            address.shop ||
            address.tourism ||
            address.road ||
            address.neighbourhood ||
            address.suburb ||
            address.village ||
            address.town ||
            address.city ||
            address.county;

        const area =
            address.neighbourhood ||
            address.suburb ||
            address.village ||
            address.town ||
            address.city ||
            address.county;

        const district =
            address.state_district ||
            address.county;

        const state = address.state;

        const parts = [];

        if (placeName) parts.push(placeName);

        if (area && area !== placeName) {
            parts.push(area);
        }

        if (
            district &&
            district !== area &&
            district !== placeName
        ) {
            parts.push(district);
        }

        if (state && !parts.includes(state)) {
            parts.push(state);
        }

        if (parts.length > 0) {
            return parts.join(", ");
        }
    }

    if (data.display_name) {
        return data.display_name;
    }

    throw new Error(
        "No readable address was returned."
    );
}

// =====================================================
// GPS LOCATION DETECTION
// =====================================================

function detectPassengerLocation() {
    if (!navigator.geolocation) {
        setLocationStatus(
            "Your browser does not support GPS location detection."
        );

        return;
    }

    if (!window.isSecureContext) {
        setLocationStatus(
            "Location access requires HTTPS or localhost."
        );

        return;
    }

    if (locationButton) {
        locationButton.disabled = true;

        locationButton.textContent =
            "Detecting your location...";
    }

    setLocationStatus(
        "Waiting for your device's location permission..."
    );

    navigator.geolocation.getCurrentPosition(
        handleLocationSuccess,
        handleLocationError,
        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

// =====================================================
// GPS SUCCESS
// =====================================================

async function handleLocationSuccess(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    passengerCoordinates = {
        latitude,
        longitude,
        accuracy
    };

    passengerLocationText =
        `Current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;

    if (pickupLocationInput) {
        pickupLocationInput.value = "";
    }

    if (pickupSuggestions) {
        pickupSuggestions.hidden = true;
        pickupSuggestions.replaceChildren();
    }

    if (pickupSelectionStatus) {
        pickupSelectionStatus.textContent =
            "Using your device's current GPS location.";
    }

    setLocationStatus(
        "GPS detected. Finding your place name..."
    );

    updatePagePreview();
    updateReviewSummary();

    try {
        await updatePickupMarker();

    } catch (error) {
        console.error(
            "Pickup map marker error:",
            error
        );

        setLocationStatus(
            "GPS detected, but the map could not be displayed. Check your internet connection."
        );
    }

    try {
        const readableAddress = await reverseGeocode(
            latitude,
            longitude
        );

        passengerLocationText = readableAddress;

        if (passengerMarker) {
            passengerMarker.setPopupContent(
                `<strong>${escapeHTML(readableAddress)}</strong>`
            );
        }

        setLocationStatus(
            `Pickup detected: ${readableAddress}. GPS accuracy: approximately ${Math.round(accuracy)} metres.`
        );

        if (pickupSelectionStatus) {
            pickupSelectionStatus.textContent =
                `Selected pickup: ${readableAddress}`;
        }

    } catch (error) {
        console.error(
            "Reverse geocoding error:",
            error
        );

        setLocationStatus(
            `GPS detected, but the place name could not be retrieved. Coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`
        );
    }

    if (locationButton) {
        locationButton.disabled = false;

        locationButton.innerHTML =
            '<span aria-hidden="true">✓</span> Refresh My Location';
    }

    updatePagePreview();
    updateReviewSummary();
}

// =====================================================
// GPS ERROR HANDLING
// =====================================================

function handleLocationError(error) {
    let message =
        "Unable to detect your location.";

    switch (error.code) {
        case error.PERMISSION_DENIED:
            message =
                "Location permission was denied. Allow location access in your browser settings and try again.";
            break;

        case error.POSITION_UNAVAILABLE:
            message =
                "Your device could not determine your location. Check your device location settings.";
            break;

        case error.TIMEOUT:
            message =
                "Location detection timed out. Please try again.";
            break;
    }

    setLocationStatus(message);

    if (locationButton) {
        locationButton.disabled = false;

        locationButton.innerHTML =
            '<span aria-hidden="true">◎</span> Try Again';
    }

    console.error(
        "GPS detection error:",
        error
    );
}

function setLocationStatus(message) {
    if (locationStatus) {
        locationStatus.textContent = message;
    }
}

// =====================================================
// PHOTON LOCATION SEARCH
// Uses OpenStreetMap-based global geocoding.
// =====================================================

async function searchLocations(query, signal) {
    const url = new URL(PHOTON_URL);

    url.searchParams.set("q", query);
    url.searchParams.set("limit", "7");

    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Accept: "application/json"
        },
        signal
    });

    if (!response.ok) {
        throw new Error(
            `Location search failed with status ${response.status}.`
        );
    }

    const data = await response.json();

    return Array.isArray(data.features)
        ? data.features
        : [];
}

// =====================================================
// FORMAT PHOTON RESULT
// =====================================================

function formatPhotonResult(feature) {
    const properties = feature.properties || {};

    const primary =
        properties.name ||
        properties.street ||
        properties.city ||
        properties.county ||
        "Unknown location";

    const secondaryParts = [];

    const possibleParts = [
        properties.housenumber,
        properties.street,
        properties.district,
        properties.suburb,
        properties.city,
        properties.county,
        properties.state,
        properties.country
    ];

    possibleParts.forEach(part => {
        if (
            part &&
            part !== primary &&
            !secondaryParts.includes(part)
        ) {
            secondaryParts.push(part);
        }
    });

    return {
        label: primary,
        description: secondaryParts.join(", "),
        fullAddress: [
            primary,
            ...secondaryParts
        ].join(", "),
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0]
    };
}

// =====================================================
// SAFE SUGGESTION RENDERING
// =====================================================

function renderSuggestions(container, results, onSelect) {
    if (!container) return;

    container.replaceChildren();

    if (!results.length) {
        const message =
            document.createElement("div");

        message.className =
            "location-search-message";

        message.textContent =
            "No matching locations found. Try another search.";

        container.appendChild(message);
        container.hidden = false;

        return;
    }

    results.forEach((result, index) => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "location-suggestion";
        button.setAttribute("role", "option");
        button.setAttribute(
            "aria-selected",
            "false"
        );

        const icon =
            document.createElement("span");

        icon.className = "suggestion-icon";
        icon.textContent = "⌖";

        const textWrapper =
            document.createElement("span");

        textWrapper.className =
            "suggestion-text";

        const title =
            document.createElement("strong");

        title.textContent = result.label;

        const description =
            document.createElement("span");

        description.textContent =
            result.description
                ? ` — ${result.description}`
                : "";

        textWrapper.appendChild(title);
        textWrapper.appendChild(description);

        button.appendChild(icon);
        button.appendChild(textWrapper);

        // mousedown prevents input blur before selection.
        button.addEventListener(
            "mousedown",
            event => event.preventDefault()
        );

        button.addEventListener(
            "click",
            () => onSelect(result, index)
        );

        container.appendChild(button);
    });

    container.hidden = false;
}

// =====================================================
// PICKUP SEARCH
// =====================================================

function handlePickupSearchInput() {
    const query =
        pickupLocationInput.value.trim();

    // A changed query invalidates the old selected location.
    passengerCoordinates = null;
    passengerLocationText = "";

    if (passengerMarker && lastMileMap) {
        lastMileMap.removeLayer(passengerMarker);
        passengerMarker = null;
    }

    if (accuracyCircle && lastMileMap) {
        lastMileMap.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }

    if (pickupSelectionStatus) {
        pickupSelectionStatus.textContent =
            query
                ? "Select a pickup suggestion to confirm this location."
                : "";
    }

    updatePagePreview();
    updateReviewSummary();

    if (pickupSuggestions) {
        pickupSuggestions.hidden = true;
        pickupSuggestions.replaceChildren();
    }

    clearTimeout(pickupSearchTimer);

    if (pickupSearchController) {
        pickupSearchController.abort();
    }

    if (query.length < 3) {
        return;
    }

    pickupSearchTimer = setTimeout(() => {
        performPickupSearch(query);
    }, 450);
}

async function performPickupSearch(query) {
    const requestId = ++pickupSearchRequestId;

    if (pickupSearchController) {
        pickupSearchController.abort();
    }

    pickupSearchController =
        new AbortController();

    if (pickupSuggestions) {
        pickupSuggestions.replaceChildren();

        const message =
            document.createElement("div");

        message.className =
            "location-search-message";

        message.textContent =
            "Searching locations...";

        pickupSuggestions.appendChild(message);
        pickupSuggestions.hidden = false;
    }

    try {
        const features = await searchLocations(
            query,
            pickupSearchController.signal
        );

        if (requestId !== pickupSearchRequestId) {
            return;
        }

        pickupSearchResults =
            features
                .filter(feature => {
                    return (
                        feature.geometry &&
                        Array.isArray(feature.geometry.coordinates) &&
                        feature.geometry.coordinates.length >= 2
                    );
                })
                .map(formatPhotonResult);

        renderSuggestions(
            pickupSuggestions,
            pickupSearchResults,
            selectPickupSuggestion
        );

    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(
            "Pickup location search error:",
            error
        );

        showSearchError(
            pickupSuggestions,
            "Unable to search locations. Check your internet connection and try again."
        );
    }
}

// =====================================================
// SELECT MANUAL PICKUP SUGGESTION
// =====================================================

async function selectPickupSuggestion(result) {
    passengerCoordinates = {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: null
    };

    passengerLocationText = result.fullAddress;

    if (pickupLocationInput) {
        pickupLocationInput.value =
            result.fullAddress;
    }

    if (pickupSuggestions) {
        pickupSuggestions.hidden = true;
        pickupSuggestions.replaceChildren();
    }

    if (pickupSelectionStatus) {
        pickupSelectionStatus.textContent =
            `Selected pickup: ${result.fullAddress}`;
    }

    setLocationStatus(
        "Pickup location selected from search results."
    );

    if (locationButton) {
        locationButton.disabled = false;

        locationButton.innerHTML =
            '<span aria-hidden="true">◎</span> Use My Current Location';
    }

    updatePagePreview();
    updateReviewSummary();

    try {
        await updatePickupMarker();
    } catch (error) {
        console.error(
            "Unable to display pickup marker:",
            error
        );

        setLocationStatus(
            "Pickup selected, but the map could not be updated."
        );
    }
}

// =====================================================
// DESTINATION SEARCH
// =====================================================

function handleDestinationSearchInput() {
    const query =
        finalDestination.value.trim();

    // Typing again invalidates the previous selected destination.
    destinationCoordinates = null;
    destinationLocationText = "";

    if (destinationMarker && lastMileMap) {
        lastMileMap.removeLayer(destinationMarker);
        destinationMarker = null;
    }

    if (destinationSelectionStatus) {
        destinationSelectionStatus.textContent =
            query
                ? "Select a destination suggestion to confirm your destination."
                : "";
    }

    updatePagePreview();
    updateReviewSummary();

    if (destinationSuggestions) {
        destinationSuggestions.hidden = true;
        destinationSuggestions.replaceChildren();
    }

    clearTimeout(destinationSearchTimer);

    if (destinationSearchController) {
        destinationSearchController.abort();
    }

    if (query.length < 3) {
        return;
    }

    destinationSearchTimer = setTimeout(() => {
        performDestinationSearch(query);
    }, 450);
}

async function performDestinationSearch(query) {
    const requestId =
        ++destinationSearchRequestId;

    if (destinationSearchController) {
        destinationSearchController.abort();
    }

    destinationSearchController =
        new AbortController();

    if (destinationSuggestions) {
        destinationSuggestions.replaceChildren();

        const message =
            document.createElement("div");

        message.className =
            "location-search-message";

        message.textContent =
            "Searching locations...";

        destinationSuggestions.appendChild(message);
        destinationSuggestions.hidden = false;
    }

    try {
        const features = await searchLocations(
            query,
            destinationSearchController.signal
        );

        if (
            requestId !== destinationSearchRequestId
        ) {
            return;
        }

        destinationSearchResults =
            features
                .filter(feature => {
                    return (
                        feature.geometry &&
                        Array.isArray(feature.geometry.coordinates) &&
                        feature.geometry.coordinates.length >= 2
                    );
                })
                .map(formatPhotonResult);

        renderSuggestions(
            destinationSuggestions,
            destinationSearchResults,
            selectDestinationSuggestion
        );

    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(
            "Destination search error:",
            error
        );

        showSearchError(
            destinationSuggestions,
            "Unable to search destinations. Check your internet connection and try again."
        );
    }
}

// =====================================================
// SELECT DESTINATION SUGGESTION
// =====================================================

async function selectDestinationSuggestion(result) {
    destinationCoordinates = {
        latitude: result.latitude,
        longitude: result.longitude
    };

    destinationLocationText = result.fullAddress;

    if (finalDestination) {
        finalDestination.value =
            result.fullAddress;
    }

    if (destinationSuggestions) {
        destinationSuggestions.hidden = true;
        destinationSuggestions.replaceChildren();
    }

    if (destinationSelectionStatus) {
        destinationSelectionStatus.textContent =
            `Selected destination: ${result.fullAddress}`;
    }

    updatePagePreview();
    updateReviewSummary();

    try {
        await updateDestinationMarker();
    } catch (error) {
        console.error(
            "Unable to display destination marker:",
            error
        );
    }
}

// =====================================================
// SEARCH ERROR DISPLAY
// =====================================================

function showSearchError(container, message) {
    if (!container) return;

    container.replaceChildren();

    const errorElement =
        document.createElement("div");

    errorElement.className =
        "location-search-message";

    errorElement.textContent = message;

    container.appendChild(errorElement);
    container.hidden = false;
}

// =====================================================
// SAFE HTML ESCAPING
// =====================================================

function escapeHTML(value) {
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

// =====================================================
// PAGE PREVIEW
// =====================================================

function updatePagePreview() {
    const pickup =
        passengerLocationText ||
        "Detect or select your pickup location";

    const destination =
        destinationLocationText ||
        "Where you're heading";

    if (introDropoff) {
        introDropoff.textContent = pickup;
    }

    if (introDestination) {
        introDestination.textContent = destination;
    }
}

// =====================================================
// REVIEW SUMMARY
// =====================================================

function updateReviewSummary() {
    const bookingReference =
        selectedBooking?.booking_reference ||
        "Not selected";

    const pickup =
        passengerLocationText ||
        "Not selected";

    const destination =
        destinationLocationText ||
        "Not selected";

    const setText = (id, value) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    };

    setText("reviewBooking", bookingReference);
    setText("reviewPickup", pickup);
    setText("reviewDestination", destination);

    const canReview =
        Boolean(selectedBooking) &&
        Boolean(passengerCoordinates) &&
        Boolean(destinationCoordinates);

    if (reviewRideButton) {
        reviewRideButton.disabled = !canReview;
    }

    if (reviewResult) {
        reviewResult.hidden = true;
    }
}

// =====================================================
// REVIEW BUTTON
// Frontend preview only.
// =====================================================

function reviewRideDetails() {
    if (!selectedBooking) {
        alert(
            "Please select an upcoming shuttle booking."
        );

        return;
    }

    if (!passengerCoordinates) {
        alert(
            "Please detect or select your pickup location."
        );

        return;
    }

    if (!destinationCoordinates) {
        alert(
            "Please search for and select your final destination."
        );

        finalDestination?.focus();

        return;
    }

    updateReviewSummary();

    if (reviewResult) {
        reviewResult.hidden = false;
    }

    if (transportSelectionSection) {
        transportSelectionSection.hidden = false;

        transportSelectionSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// =====================================================
// CLOSE SUGGESTIONS WHEN CLICKING OUTSIDE
// =====================================================

function initializeSuggestionDismissal() {
    document.addEventListener("click", event => {
        const clickedPickup =
            event.target.closest(
                "#pickupLocationInput, #pickupSuggestions"
            );

        const clickedDestination =
            event.target.closest(
                "#finalDestination, #destinationSuggestions"
            );

        if (!clickedPickup && pickupSuggestions) {
            pickupSuggestions.hidden = true;
        }

        if (
            !clickedDestination &&
            destinationSuggestions
        ) {
            destinationSuggestions.hidden = true;
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            if (pickupSuggestions) {
                pickupSuggestions.hidden = true;
            }

            if (destinationSuggestions) {
                destinationSuggestions.hidden = true;
            }
        }
    });
}

// =====================================================
// PASSENGER NAVBAR PROFILE
// =====================================================

async function loadPassengerProfile() {
    const token = getAuthToken();

    if (!token) return;

    try {
        const result = await apiRequest(
            "/passenger/profile"
        );

        const passenger =
            result.user ||
            result.profile ||
            result;

        const name =
            passenger.full_name ||
            passenger.name;

        if (!name) return;

        const profileName =
            document.getElementById("profileName");

        const profileInitial =
            document.getElementById("profileInitial");

        const loginNavLink =
            document.getElementById("loginNavLink");

        const registerNavLink =
            document.getElementById("registerNavLink");

        const profileNavLink =
            document.getElementById("profileNavLink");

        if (profileName) {
            profileName.textContent = name;
        }

        if (profileInitial) {
            profileInitial.textContent =
                name.trim().charAt(0).toUpperCase();
        }

        if (loginNavLink) {
            loginNavLink.hidden = true;
        }

        if (registerNavLink) {
            registerNavLink.hidden = true;
        }

        if (profileNavLink) {
            profileNavLink.hidden = false;
        }

    } catch (error) {
        console.error(
            "Unable to load passenger profile:",
            error
        );
    }
}

// =====================================================
// MOBILE NAVIGATION
// =====================================================

function initializeMobileNavigation() {
    const navbar =
        document.querySelector(".navbar");

    const navToggle =
        document.getElementById("mobileNavToggle");

    const navLinks =
        document.getElementById("primaryNavLinks");

    if (!navbar || !navToggle || !navLinks) {
        return;
    }

    function closeMenu() {
        navbar.classList.remove("menu-open");

        navToggle.setAttribute(
            "aria-expanded",
            "false"
        );

        navToggle.setAttribute(
            "aria-label",
            "Open navigation menu"
        );
    }

    navToggle.addEventListener("click", () => {
        const isOpen =
            navbar.classList.toggle("menu-open");

        navToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        navToggle.setAttribute(
            "aria-label",
            isOpen
                ? "Close navigation menu"
                : "Open navigation menu"
        );
    });

    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", event => {
        if (!navbar.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });
}

// =====================================================
// EVENT LISTENERS
// =====================================================

if (shuttleBookingSelect) {
    shuttleBookingSelect.addEventListener(
        "change",
        () => {
            if (shuttleBookingSelect.value) {
                selectBooking(
                    shuttleBookingSelect.value
                );
            }
        }
    );
}

if (pickupLocationInput) {
    pickupLocationInput.addEventListener(
        "input",
        handlePickupSearchInput
    );
}

if (finalDestination) {
    finalDestination.addEventListener(
        "input",
        handleDestinationSearchInput
    );
}

if (reviewRideButton) {
    reviewRideButton.addEventListener(
        "click",
        reviewRideDetails
    );
}

// =====================================================
// TRANSPORT SERVICE SELECTION
// Frontend UI only. No request is sent to the backend.
// =====================================================

transportServiceCards.forEach(card => {
    card.addEventListener("click", () => {
        selectedTransportService =
            card.dataset.transportService || "";

        transportServiceCards.forEach(option => {
            const isSelected = option === card;

            option.setAttribute(
                "aria-pressed",
                String(isSelected)
            );
        });

        if (confirmTransportSelectionButton) {
            confirmTransportSelectionButton.disabled =
                !selectedTransportService;
        }

        if (transportSelectionStatus) {
            transportSelectionStatus.hidden = true;
            transportSelectionStatus.textContent = "";
        }
    });
});

if (confirmTransportSelectionButton) {
    confirmTransportSelectionButton.addEventListener("click", () => {
        if (!selectedTransportService) {
            return;
        }

        if (transportSelectionStatus) {
            transportSelectionStatus.textContent =
                `${selectedTransportService} selected. Your transport preference is displayed here; the admin will allocate a captain separately.`;

            transportSelectionStatus.hidden = false;
        }

        transportSelectionStatus?.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    });
}

// =====================================================
// PAGE INITIALIZATION
// =====================================================

async function initializeLastMileBookingsPage() {
    initializeMobileNavigation();
    initializeGPSInterface();
    initializeSuggestionDismissal();

    try {
        await initializeLastMileMap();
    } catch (error) {
        console.error(
            "Initial map loading failed:",
            error
        );
    }

    await loadPassengerProfile();
    await loadUpcomingBookings();
}

initializeLastMileBookingsPage();
