"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const API = "http://localhost:3000/api";
    const token = localStorage.getItem("adminToken");

    if (!token) {
        window.location.href = "admin-login.html";
        return;
    }

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };

    const sidebar = document.getElementById("adminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const menuToggle = document.getElementById("menuToggle");
    const logoutButton = document.getElementById("logoutButton");
    const pageHeading = document.getElementById("pageHeading");
    const breadcrumbName = document.getElementById("breadcrumbName");
    const todayDate = document.getElementById("todayDate");

    const pageTitles = {
        overview: "Dashboard Overview",
        trips: "Trips Management",
        routes: "Routes Management",
        vehicles: "Vehicle Management",
        bookings: "Booking Management",
        passengers: "Passenger Management",
        captainApplications: "Captain Applications",
        connectivity: "Connectivity Requests",
        service: "Service Status",
        settings: "Settings"
    };

    let routes = [];
    let vehicles = [];
    let trips = [];

    // ------------------------------------------
    // COMMON HELPERS
    // ------------------------------------------

    async function apiRequest(endpoint, options = {}) {
        const response = await fetch(`${API}${endpoint}`, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers || {})
            }
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function dateForInput(value) {
        if (!value) return "";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        const pad = number => String(number).padStart(2, "0");

        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function mysqlDate(value) {
        return value ? value.replace("T", " ") + ":00" : "";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return escapeHTML(value);

        return date.toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    function showMessage(message, type = "success") {
        let toast = document.getElementById("adminToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "adminToast";
            toast.className = "admin-toast";
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className = `admin-toast ${type} show`;

        clearTimeout(toast.hideTimer);

        toast.hideTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }

    function closeSidebar() {
        sidebar?.classList.remove("open");
        overlay?.classList.remove("show");
    }

    // ------------------------------------------
    // MODAL
    // ------------------------------------------

    function closeModal() {
        document.getElementById("adminModal")?.remove();
    }

    function openForm(title, fields, initialValues, onSave) {

        closeModal();

        const modal = document.createElement("div");
        modal.id = "adminModal";
        modal.className = "admin-modal-overlay";

        const fieldHTML = fields.map(field => {
            const value = initialValues[field.name] ?? "";

            if (field.type === "select") {
                return `
                    <label class="admin-form-field">
                        <span>${escapeHTML(field.label)}</span>
                        <select name="${escapeHTML(field.name)}"
                            ${field.required ? "required" : ""}>
                            ${field.options.map(option => `
                                <option value="${escapeHTML(option.value)}"
                                    ${String(value) === String(option.value) ? "selected" : ""}>
                                    ${escapeHTML(option.label)}
                                </option>
                            `).join("")}
                        </select>
                    </label>
                `;
            }

            return `
                <label class="admin-form-field">
                    <span>${escapeHTML(field.label)}</span>
                    <input
                        name="${escapeHTML(field.name)}"
                        type="${escapeHTML(field.type || "text")}"
                        value="${escapeHTML(value)}"
                        ${field.required ? "required" : ""}
                        ${field.min !== undefined ? `min="${field.min}"` : ""}
                        ${field.step !== undefined ? `step="${field.step}"` : ""}
                        ${field.max !== undefined ? `max="${field.max}"` : ""}
                    >
                </label>
            `;
        }).join("");

        modal.innerHTML = `
            <div class="admin-modal">
                <div class="admin-modal-header">
                    <h3>${escapeHTML(title)}</h3>
                    <button type="button" class="modal-close" id="modalClose">×</button>
                </div>

                <form id="adminRecordForm">
                    <div class="admin-form-grid">
                        ${fieldHTML}
                    </div>

                    <div class="admin-modal-actions">
                        <button type="button" class="secondary-button" id="modalCancel">
                            Cancel
                        </button>
                        <button type="submit" class="primary-button" id="modalSave">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector("#modalClose").addEventListener("click", closeModal);
        modal.querySelector("#modalCancel").addEventListener("click", closeModal);

        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });

        modal.querySelector("#adminRecordForm").addEventListener("submit", async event => {
            event.preventDefault();

            const form = event.currentTarget;
            const button = form.querySelector("#modalSave");
            const formData = new FormData(form);
            const data = {};

            fields.forEach(field => {
                const value = formData.get(field.name);

                if (field.type === "number") {
                    data[field.name] = value === "" ? null : Number(value);
                } else {
                    data[field.name] = value;
                }
            });

            button.disabled = true;
            button.textContent = "Saving...";

            try {
                await onSave(data);
                closeModal();
            } catch (error) {
                showMessage(error.message, "error");
                button.disabled = false;
                button.textContent = "Save Changes";
            }
        });
    }

    // ------------------------------------------
    // NAVIGATION
    // ------------------------------------------

    function showView(viewName) {
        const target = document.getElementById(`view-${viewName}`);

        if (!target) return;

        document.querySelectorAll(".admin-view").forEach(view => {
            view.classList.remove("active");
        });

        target.classList.add("active");

        document.querySelectorAll(".nav-item[data-view]").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.view === viewName
            );
        });

        const title = pageTitles[viewName] || "Dashboard";

        pageHeading.textContent = title;
        breadcrumbName.textContent = title;

        closeSidebar();

        window.scrollTo({ top: 0, behavior: "smooth" });

        if (viewName === "overview") loadDashboard();
        if (viewName === "trips") loadTrips();
        if (viewName === "routes") loadRoutes();
        if (viewName === "vehicles") loadVehicles();
        if (viewName === "bookings") loadBookings();
        if (viewName === "passengers") loadPassengers();
        if (viewName === "captainApplications") loadCaptainApplications();
    }

    document.querySelectorAll(".nav-item[data-view]").forEach(button => {
        button.addEventListener("click", () => {
            showView(button.dataset.view);
        });
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            showView(button.dataset.go);
        });
    });

    menuToggle?.addEventListener("click", () => {
        sidebar?.classList.toggle("open");
        overlay?.classList.toggle("show");
    });

    overlay?.addEventListener("click", closeSidebar);

    // ------------------------------------------
    // DASHBOARD STATISTICS
    // ------------------------------------------

    async function loadDashboard() {
        try {
            const result = await apiRequest("/admin/dashboard");

            const statistics = result.statistics;

            const cards = document.querySelectorAll(
                "#view-overview .stat-card"
            );

            const values = [
                statistics.total_trips,
                statistics.confirmed_bookings,
                statistics.active_vehicles,
                statistics.active_passengers
            ];

            cards.forEach((card, index) => {
                const heading = card.querySelector("h3");
                const description = card.querySelector("p");

                if (heading) heading.textContent = values[index] ?? 0;
                if (description) description.textContent = "Live database data";
            });

            const notice = document.querySelector(
                "#view-overview .integration-notice"
            );

            if (notice) {
                notice.innerHTML = `
                    <span class="notice-icon">✓</span>
                    <div>
                        <strong>Admin backend connected</strong>
                        <p>Dashboard statistics are being retrieved from the ShuttleConnect database.</p>
                    </div>
                `;
            }

            const status = document.querySelector(".system-status");

            if (status) {
                status.innerHTML = `
                    <span class="status-dot admin-online"></span>
                    Live backend connected
                `;
            }

        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    // ------------------------------------------
    // MANAGEMENT SCREEN LAYOUT
    // ------------------------------------------

    function prepareManagementView(viewName, title, description, buttonLabel, tableHTML) {
        const section = document.getElementById(`view-${viewName}`);
        if (!section) return;

        section.innerHTML = `
            <div class="section-intro">
                <div>
                    <h2>${title}</h2>
                    <p>${description}</p>
                </div>
                ${buttonLabel ? `<button class="primary-button" id="add${viewName}Button">+ ${buttonLabel}</button>` : ""}
            </div>

            <div class="panel">
                <div class="table-toolbar">
                    <input type="search"
                        class="table-search"
                        id="${viewName}Search"
                        placeholder="Search ${viewName}...">
                    <span class="panel-tag" id="${viewName}Count">Loading...</span>
                </div>

                <div class="table-scroll">
                    ${tableHTML}
                </div>
            </div>
        `;
    }

    // ------------------------------------------
    // ROUTES CRUD
    // ------------------------------------------

    function renderRoutes() {
        const tbody = document.getElementById("routesTableBody");

        if (!tbody) return;

        tbody.innerHTML = routes.map(route => `
            <tr>
                <td>${route.route_id}</td>
                <td>${escapeHTML(route.route_name)}</td>
                <td>${escapeHTML(route.origin)}</td>
                <td>${escapeHTML(route.destination)}</td>
                <td>${route.distance_km ?? "—"}</td>
                <td>${route.estimated_duration_minutes ?? "—"}</td>
                <td>
                    <span class="record-status ${Number(route.is_active) === 1 ? "active" : "inactive"}">
                        ${Number(route.is_active) === 1 ? "Active" : "Inactive"}
                    </span>
                </td>
                <td>
                    <button class="table-action" data-edit-route="${route.route_id}">Edit</button>
                    ${Number(route.is_active) === 1
                        ? `<button class="table-action danger" data-disable-route="${route.route_id}">Deactivate</button>`
                        : ""}
                </td>
            </tr>
        `).join("");

        document.getElementById("routesCount").textContent =
            `${routes.length} records`;

        if (!routes.length) {
            tbody.innerHTML = `<tr><td colspan="8">No routes found. Add your first route.</td></tr>`;
        }
    }

    async function loadRoutes() {
        try {
            prepareManagementView(
                "routes",
                "Routes Management",
                "Create and manage shuttle routes.",
                "Add Route",
                `<table>
                    <thead>
                        <tr>
                            <th>ID</th><th>Route Name</th><th>Origin</th>
                            <th>Destination</th><th>Distance (km)</th>
                            <th>Duration (min)</th><th>Status</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="routesTableBody"></tbody>
                </table>`
            );

            const result = await apiRequest("/admin/routes");
            routes = result.routes || [];
            renderRoutes();

            document.getElementById("addroutesButton")
                .addEventListener("click", () => openRouteForm());

            document.getElementById("routesSearch")
                .addEventListener("input", filterRoutes);

            document.getElementById("routesTableBody")
                .addEventListener("click", handleRouteActions);

        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    function filterRoutes(event) {
        const query = event.target.value.toLowerCase();

        document.querySelectorAll("#routesTableBody tr").forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(query)
                ? ""
                : "none";
        });
    }

    function openRouteForm(route = null) {
        const fields = [
            { name: "route_name", label: "Route Name", required: true },
            { name: "origin", label: "Origin", required: true },
            { name: "destination", label: "Destination", required: true },
            { name: "distance_km", label: "Distance (km)", type: "number", min: 0.1, step: "0.1" },
            { name: "estimated_duration_minutes", label: "Duration (minutes)", type: "number", min: 1 }
        ];

        openForm(
            route ? "Edit Route" : "Add New Route",
            fields,
            route || {},
            async data => {
                const endpoint = route
                    ? `/admin/routes/${route.route_id}`
                    : "/admin/routes";

                await apiRequest(endpoint, {
                    method: route ? "PATCH" : "POST",
                    body: JSON.stringify(data)
                });

                showMessage(
                    route ? "Route updated successfully!" : "Route uploaded successfully!"
                );

                await loadRoutes();
            }
        );
    }

    async function handleRouteActions(event) {
        const editId = event.target.dataset.editRoute;
        const disableId = event.target.dataset.disableRoute;

        if (editId) {
            const route = routes.find(item => item.route_id === Number(editId));
            if (route) openRouteForm(route);
        }

        if (disableId) {
            if (!confirm("Deactivate this route? It will no longer be available for new trips.")) return;

            try {
                await apiRequest(`/admin/routes/${disableId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ is_active: 0 })
                });

                showMessage("Route deactivated successfully!");
                await loadRoutes();

            } catch (error) {
                showMessage(error.message, "error");
            }
        }
    }

    // ------------------------------------------
    // VEHICLES CRUD
    // ------------------------------------------

    function renderVehicles() {
        const tbody = document.getElementById("vehiclesTableBody");

        if (!tbody) return;

        tbody.innerHTML = vehicles.map(vehicle => `
            <tr>
                <td>${vehicle.vehicle_id}</td>
                <td>${escapeHTML(vehicle.registration_number)}</td>
                <td>${escapeHTML(vehicle.vehicle_model)}</td>
                <td>${vehicle.seating_capacity}</td>
                <td>
                    <span class="record-status ${escapeHTML(vehicle.vehicle_status)}">
                        ${escapeHTML(vehicle.vehicle_status)}
                    </span>
                </td>
                <td>
                    <button class="table-action" data-edit-vehicle="${vehicle.vehicle_id}">Edit</button>
                </td>
            </tr>
        `).join("");

        document.getElementById("vehiclesCount").textContent =
            `${vehicles.length} records`;

        if (!vehicles.length) {
            tbody.innerHTML = `<tr><td colspan="6">No vehicles found. Add your first vehicle.</td></tr>`;
        }
    }

    async function loadVehicles() {
        try {
            prepareManagementView(
                "vehicles",
                "Vehicle Management",
                "Manage shuttle vehicles, registration numbers and seating capacity.",
                "Add Vehicle",
                `<table>
                    <thead>
                        <tr>
                            <th>ID</th><th>Registration</th><th>Model</th>
                            <th>Capacity</th><th>Status</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="vehiclesTableBody"></tbody>
                </table>`
            );

            const result = await apiRequest("/admin/vehicles");
            vehicles = result.vehicles || [];
            renderVehicles();

            document.getElementById("addvehiclesButton")
                .addEventListener("click", () => openVehicleForm());

            document.getElementById("vehiclesSearch")
                .addEventListener("input", event => {
                    const query = event.target.value.toLowerCase();

                    document.querySelectorAll("#vehiclesTableBody tr").forEach(row => {
                        row.style.display = row.textContent.toLowerCase().includes(query)
                            ? ""
                            : "none";
                    });
                });

            document.getElementById("vehiclesTableBody")
                .addEventListener("click", event => {
                    const id = event.target.dataset.editVehicle;

                    if (id) {
                        const vehicle = vehicles.find(
                            item => item.vehicle_id === Number(id)
                        );

                        if (vehicle) openVehicleForm(vehicle);
                    }
                });

        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    function openVehicleForm(vehicle = null) {
        const fields = [
            { name: "registration_number", label: "Registration Number", required: true },
            { name: "vehicle_model", label: "Vehicle Model", required: true },
            { name: "seating_capacity", label: "Seating Capacity", type: "number", min: 1, max: 100, required: true },
            {
                name: "vehicle_status",
                label: "Vehicle Status",
                type: "select",
                required: true,
                options: [
                    { value: "active", label: "Active" },
                    { value: "maintenance", label: "Maintenance" },
                    { value: "inactive", label: "Inactive" }
                ]
            }
        ];

        openForm(
            vehicle ? "Edit Vehicle" : "Add New Vehicle",
            fields,
            vehicle || { vehicle_status: "active" },
            async data => {
                const endpoint = vehicle
                    ? `/admin/vehicles/${vehicle.vehicle_id}`
                    : "/admin/vehicles";

                await apiRequest(endpoint, {
                    method: vehicle ? "PATCH" : "POST",
                    body: JSON.stringify(data)
                });

                showMessage(
                    vehicle ? "Vehicle updated successfully!" : "Vehicle added successfully!"
                );

                await loadVehicles();
            }
        );
    }

    // ------------------------------------------
    // TRIPS CRUD
    // ------------------------------------------

    function renderTrips() {
        const tbody = document.getElementById("tripsTableBody");

        if (!tbody) return;

        tbody.innerHTML = trips.map(trip => `
            <tr>
                <td>${trip.trip_id}</td>
                <td>${escapeHTML(trip.origin)}</td>
                <td>${escapeHTML(trip.destination)}</td>
                <td>${formatDate(trip.departure_datetime)}</td>
                <td>${formatDate(trip.arrival_datetime)}</td>
                <td>${escapeHTML(trip.registration_number)}</td>
                <td>₹${Number(trip.fare_per_seat).toFixed(2)}</td>
                <td>
                    <span class="record-status ${escapeHTML(trip.trip_status)}">
                        ${escapeHTML(trip.trip_status)}
                    </span>
                </td>
                <td>
                    <button class="table-action" data-edit-trip="${trip.trip_id}">Edit</button>
                    ${trip.trip_status !== "cancelled" && trip.trip_status !== "completed"
                        ? `<button class="table-action danger" data-cancel-trip="${trip.trip_id}">Cancel</button>`
                        : ""}
                </td>
            </tr>
        `).join("");

        document.getElementById("tripsCount").textContent =
            `${trips.length} records`;

        if (!trips.length) {
            tbody.innerHTML = `<tr><td colspan="9">No trips found. Schedule your first trip.</td></tr>`;
        }
    }

    async function loadTrips() {
        try {
            prepareManagementView(
                "trips",
                "Trips Management",
                "Schedule and manage shuttle trips.",
                "Add Trip",
                `<table>
                    <thead>
                        <tr>
                            <th>ID</th><th>Origin</th><th>Destination</th>
                            <th>Departure</th><th>Arrival</th><th>Vehicle</th>
                            <th>Fare</th><th>Status</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="tripsTableBody"></tbody>
                </table>`
            );

            const result = await apiRequest("/admin/trips");
            trips = result.trips || [];
            renderTrips();

            document.getElementById("addtripsButton")
                .addEventListener("click", () => openTripForm());
            document.getElementById("tripsSearch")
                .addEventListener("input", event => {
                    const query = event.target.value.toLowerCase();

                    document.querySelectorAll("#tripsTableBody tr").forEach(row => {
                        row.style.display = row.textContent.toLowerCase().includes(query)
                            ? ""
                            : "none";
                    });
                });

            document.getElementById("tripsTableBody")
                .addEventListener("click", handleTripActions);

        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    function openTripForm(trip = null) {
        const routeOptions = routes
            .filter(route => Number(route.is_active) === 1)
            .map(route => ({
                value: route.route_id,
                label: `${route.route_name} (${route.origin} → ${route.destination})`
            }));

        const vehicleOptions = vehicles
            .filter(vehicle => vehicle.vehicle_status === "active")
            .map(vehicle => ({
                value: vehicle.vehicle_id,
                label: `${vehicle.registration_number} — ${vehicle.vehicle_model}`
            }));

        const fields = trip
            ? [
                { name: "departure_datetime", label: "Departure", type: "datetime-local", required: true },
                { name: "arrival_datetime", label: "Arrival", type: "datetime-local", required: true },
                { name: "fare_per_seat", label: "Fare per Seat (₹)", type: "number", min: 0, step: "0.01", required: true },
                {
                    name: "trip_status",
                    label: "Trip Status",
                    type: "select",
                    required: true,
                    options: [
                        { value: "scheduled", label: "Scheduled" },
                        { value: "boarding", label: "Boarding" },
                        { value: "in_progress", label: "In Progress" },
                        { value: "completed", label: "Completed" },
                        { value: "cancelled", label: "Cancelled" }
                    ]
                }
            ]
            : [
                {
                    name: "route_id",
                    label: "Route",
                    type: "select",
                    required: true,
                    options: routeOptions
                },
                {
                    name: "vehicle_id",
                    label: "Vehicle",
                    type: "select",
                    required: true,
                    options: vehicleOptions
                },
                { name: "departure_datetime", label: "Departure", type: "datetime-local", required: true },
                { name: "arrival_datetime", label: "Arrival", type: "datetime-local", required: true },
                { name: "fare_per_seat", label: "Fare per Seat (₹)", type: "number", min: 0, step: "0.01", required: true }
            ];

        if (!trip && !routeOptions.length) {
            showMessage("Add an active route before scheduling a trip.", "error");
            return;
        }

        if (!trip && !vehicleOptions.length) {
            showMessage("Add an active vehicle before scheduling a trip.", "error");
            return;
        }

        const initial = trip
            ? {
                departure_datetime: dateForInput(trip.departure_datetime),
                arrival_datetime: dateForInput(trip.arrival_datetime),
                fare_per_seat: trip.fare_per_seat,
                trip_status: trip.trip_status
            }
            : { route_id: routeOptions[0]?.value, vehicle_id: vehicleOptions[0]?.value };

        openForm(
            trip ? "Edit Trip" : "Schedule New Trip",
            fields,
            initial,
            async data => {
                data.departure_datetime = mysqlDate(data.departure_datetime);
                data.arrival_datetime = mysqlDate(data.arrival_datetime);

                const endpoint = trip
                    ? `/admin/trips/${trip.trip_id}`
                    : "/admin/trips";

                await apiRequest(endpoint, {
                    method: trip ? "PATCH" : "POST",
                    body: JSON.stringify(data)
                });

                showMessage(
                    trip ? "Trip updated successfully!" : "Trip uploaded successfully!"
                );

                await loadTrips();
                await loadDashboard();
            }
        );
    }

    async function handleTripActions(event) {
        const editId = event.target.dataset.editTrip;
        const cancelId = event.target.dataset.cancelTrip;

        if (editId) {
            const trip = trips.find(item => item.trip_id === Number(editId));

            if (trip) openTripForm(trip);
        }

        if (cancelId) {
            if (!confirm("Are you sure you want to cancel this trip?")) return;

            try {
                await apiRequest(`/admin/trips/${cancelId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ trip_status: "cancelled" })
                });

                showMessage("Trip cancelled successfully!");
                await loadTrips();
                await loadDashboard();

            } catch (error) {
                showMessage(error.message, "error");
            }
        }
    }

    // ------------------------------------------
    // BOOKINGS VIEW (READ-ONLY ADMIN MONITORING)
    // ------------------------------------------

    function displaySeatNumbers(booking) {
        const seats = booking.seat_numbers ?? booking.seats ?? booking.seat_numbers_list;

        if (Array.isArray(seats)) {
            return seats.length ? seats.map(seat => {
                if (typeof seat === "object") {
                    return seat.seat_number ?? seat.seatNumber ?? "";
                }
                return seat;
            }).filter(Boolean).join(", ") : "—";
        }

        return seats ? String(seats) : "—";
    }

    function renderBookings(bookings) {
        const tbody = document.getElementById("bookingsTableBody");
        if (!tbody) return;

        tbody.innerHTML = bookings.map(booking => {
            const passenger = booking.passenger_name || booking.full_name || "—";
            const route = [
                booking.origin || "—",
                booking.destination || "—"
            ].join(" → ");
            const status = String(booking.booking_status || "unknown").toLowerCase();
            const ticket = booking.ticket_code || "Not issued";

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(booking.booking_reference || `#${booking.booking_id}`)}</strong>
                        <small class="table-subtext">ID: ${escapeHTML(booking.booking_id)}</small>
                    </td>
                    <td>
                        ${escapeHTML(passenger)}
                        <small class="table-subtext">${escapeHTML(booking.passenger_email || booking.email || "")}</small>
                    </td>
                    <td>${escapeHTML(route)}</td>
                    <td>${formatDate(booking.departure_datetime)}</td>
                    <td>${escapeHTML(booking.number_of_seats ?? "—")}<small class="table-subtext">Seat(s): ${escapeHTML(displaySeatNumbers(booking))}</small></td>
                    <td>₹${Number(booking.total_amount || 0).toFixed(2)}</td>
                    <td><span class="record-status ${escapeHTML(status)}">${escapeHTML(status)}</span></td>
                    <td>
                        ${escapeHTML(ticket)}
                        ${booking.ticket_status ? `<small class="table-subtext">${escapeHTML(booking.ticket_status)}</small>` : ""}
                    </td>
                </tr>
            `;
        }).join("");

        const count = document.getElementById("bookingsCount");
        if (count) count.textContent = `${bookings.length} records`;

        if (!bookings.length) {
            tbody.innerHTML = `<tr><td colspan="8">No bookings found.</td></tr>`;
        }
    }

    async function loadBookings() {
        try {
            prepareManagementView(
                "bookings",
                "Booking Management",
                "View passenger bookings, journey details, seat allocation and ticket status.",
                "",
                `<table>
                    <thead>
                        <tr>
                            <th>Booking Reference</th>
                            <th>Passenger</th>
                            <th>Route</th>
                            <th>Departure</th>
                            <th>Seats</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Ticket</th>
                        </tr>
                    </thead>
                    <tbody id="bookingsTableBody"></tbody>
                </table>`
            );

            const result = await apiRequest("/admin/bookings");
            const bookings = result.bookings || [];
            renderBookings(bookings);

            const search = document.getElementById("bookingsSearch");
            search?.addEventListener("input", event => {
                const query = event.target.value.toLowerCase();
                document.querySelectorAll("#bookingsTableBody tr").forEach(row => {
                    row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
                });
            });
        } catch (error) {
            showMessage(error.message, "error");
            const tbody = document.getElementById("bookingsTableBody");
            if (tbody) tbody.innerHTML = `<tr><td colspan="8">Unable to load bookings. Please try again.</td></tr>`;
        }
    }

    // ------------------------------------------
    // PASSENGERS VIEW (READ-ONLY ADMIN MONITORING)
    // ------------------------------------------

    function renderPassengers(passengers) {
        const tbody = document.getElementById("passengersTableBody");
        if (!tbody) return;

        tbody.innerHTML = passengers.map(passenger => {
            const active = Number(passenger.is_active) === 1;
            const status = active ? "Active" : "Inactive";

            return `
                <tr>
                    <td>${escapeHTML(passenger.user_id)}</td>
                    <td>
                        <strong>${escapeHTML(passenger.full_name || "—")}</strong>
                        <small class="table-subtext">${escapeHTML(passenger.email || "")}</small>
                    </td>
                    <td>${escapeHTML(passenger.phone || "—")}</td>
                    <td>${escapeHTML(passenger.total_bookings ?? 0)}</td>
                    <td>${escapeHTML(passenger.confirmed_bookings ?? 0)}</td>
                    <td>₹${Number(passenger.total_spent || 0).toFixed(2)}</td>
                    <td><span class="record-status ${active ? "active" : "inactive"}">${status}</span></td>
                    <td>${formatDate(passenger.created_at)}</td>
                </tr>
            `;
        }).join("");

        const count = document.getElementById("passengersCount");
        if (count) count.textContent = `${passengers.length} records`;

        if (!passengers.length) {
            tbody.innerHTML = `<tr><td colspan="8">No passengers found.</td></tr>`;
        }
    }

    async function loadPassengers() {
        try {
            prepareManagementView(
                "passengers",
                "Passenger Management",
                "View registered passengers, account status and booking activity.",
                "",
                `<table>
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Passenger</th>
                            <th>Phone</th>
                            <th>Total Bookings</th>
                            <th>Confirmed</th>
                            <th>Total Spent</th>
                            <th>Account Status</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody id="passengersTableBody"></tbody>
                </table>`
            );

            const result = await apiRequest("/admin/passengers");
            const passengers = result.passengers || [];
            renderPassengers(passengers);

            const search = document.getElementById("passengersSearch");
            search?.addEventListener("input", event => {
                const query = event.target.value.toLowerCase();
                document.querySelectorAll("#passengersTableBody tr").forEach(row => {
                    row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
                });
            });
        } catch (error) {
            showMessage(error.message, "error");
            const tbody = document.getElementById("passengersTableBody");
            if (tbody) tbody.innerHTML = `<tr><td colspan="8">Unable to load passengers. Please try again.</td></tr>`;
        }
    }
    
    // ------------------------------------------
    // CAPTAIN APPLICATIONS
    // ------------------------------------------
    let captainApplications = [];

    function renderCaptainApplications() {
        const tbody = document.getElementById("captainApplicationsTableBody");
        if (!tbody) return;
        const query = (document.getElementById("captainApplicationSearch")?.value || "").trim().toLowerCase();
        const filtered = captainApplications.filter(item =>
            [item.application_id,item.full_name,item.email,item.phone,item.vehicle_category,
             item.vehicle_registration,item.vehicle_model,item.vehicle_year,item.licence_number]
                .join(" ").toLowerCase().includes(query)
        );

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="9">No captain applications found.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            const status = String(item.application_status || "pending");
            const statusClass = status === "approved" ? "active" : status === "rejected" ? "inactive" : "pending";
            const vehicle = [item.vehicle_model,item.vehicle_registration,item.vehicle_year].filter(Boolean).join(" · ");
            let actions = "—";
            if (status === "pending") {
                actions = `
                    <button class="table-action" data-approve-captain="${escapeHTML(item.application_id)}">Approve</button>
                    <button class="table-action danger" data-reject-captain="${escapeHTML(item.application_id)}">Reject</button>`;
            } else if (status === "rejected" && item.rejection_reason) {
                actions = `<span title="${escapeHTML(item.rejection_reason)}">Reason available</span>`;
            }
            return `
                <tr>
                    <td>${escapeHTML(item.application_id)}</td>
                    <td><strong>${escapeHTML(item.full_name)}</strong></td>
                    <td>${escapeHTML(item.email)}</td>
                    <td>${escapeHTML(item.phone)}</td>
                    <td>${escapeHTML(item.vehicle_category)}</td>
                    <td>${escapeHTML(vehicle || "—")}</td>
                    <td>${formatDate(item.licence_expiry)}</td>
                    <td><span class="record-status ${statusClass}">${escapeHTML(status)}</span></td>
                    <td>${actions}</td>
                </tr>`;
        }).join("");
    }

    async function loadCaptainApplications() {
        const tbody = document.getElementById("captainApplicationsTableBody");
        const filter = document.getElementById("captainApplicationStatus");
        if (!tbody || !filter) return;
        tbody.innerHTML = '<tr><td colspan="9">Loading captain applications...</td></tr>';
        try {
            const result = await apiRequest(
                `/admin/captain-applications?status=${encodeURIComponent(filter.value || "pending")}`
            );
            captainApplications = result.applications || [];
            renderCaptainApplications();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="9">${escapeHTML(error.message)}</td></tr>`;
            showMessage(error.message, "error");
        }
    }

    document.getElementById("captainApplicationSearch")?.addEventListener("input", renderCaptainApplications);
    document.getElementById("captainApplicationStatus")?.addEventListener("change", loadCaptainApplications);

    document.getElementById("captainApplicationsTableBody")?.addEventListener("click", async event => {
        const approve = event.target.closest("[data-approve-captain]");
        const reject = event.target.closest("[data-reject-captain]");
        if (!approve && !reject) return;
        const id = approve ? approve.dataset.approveCaptain : reject.dataset.rejectCaptain;

        if (approve) {
            if (!confirm("Approve this captain application?")) return;
            approve.disabled = true;
            try {
                const result = await apiRequest(`/admin/captain-applications/${id}/approve`, {method:"POST"});
                showMessage(result.message || "Application approved.");
                await loadCaptainApplications();
            } catch(error) {
                showMessage(error.message,"error");
                approve.disabled = false;
            }
            return;
        }

        const reason = prompt("Enter the reason for rejecting this application:");
        if (reason === null) return;
        if (!reason.trim()) {
            showMessage("A rejection reason is required.","error");
            return;
        }
        reject.disabled = true;
        try {
            const result = await apiRequest(`/admin/captain-applications/${id}/reject`, {
                method:"POST", body:JSON.stringify({rejection_reason:reason.trim()})
            });
            showMessage(result.message || "Application rejected.");
            await loadCaptainApplications();
        } catch(error) {
            showMessage(error.message,"error");
            reject.disabled = false;
        }
    });

    // ------------------------------------------
    // LOGOUT
    // ------------------------------------------

    logoutButton?.addEventListener("click", () => {
        if (!confirm("Are you sure you want to log out?")) return;

        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        window.location.href = "admin-login.html";
    });

    // ------------------------------------------
    // INITIALIZE
    // ------------------------------------------

    if (todayDate) {
        todayDate.textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    showView("overview");

});