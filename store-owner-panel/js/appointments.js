// Store Owner Appointments Management Page
let currentAppointmentsPage = 1;

async function loadAppointments() {
    const pageContent = document.getElementById('pageContent');

    if (!currentStoreId) {
        pageContent.innerHTML = `
            <div class="card">
                <div class="card-body" style="text-align: center; padding: 40px;">
                    <h3>Please select a store first</h3>
                    <button class="btn btn-primary" onclick="app.navigateTo('stores')">Go to Stores</button>
                </div>
            </div>
        `;
        return;
    }

    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Store Appointments</h3>
                <div class="d-flex gap-10">
                    <select id="storeSelector" onchange="changeStoreForAppointments()">
                        <!-- options populated -->
                    </select>
                </div>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="appointmentStatusFilter" onchange="filterAppointments()">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="no_show">No Show</option>
                        </select>
                        <input type="date" id="appointmentDateFilter" onchange="filterAppointments()">
                    </div>
                    <input type="text" id="appointmentSearch" placeholder="Search appointments..." 
                           oninput="debounce(filterAppointments, 500)()" style="max-width: 300px;">
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Appointment #</th>
                                <th>Customer</th>
                                <th>Service Type</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="appointmentsTableBody">
                            <tr><td colspan="7" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div id="appointmentsPagination"></div>
            </div>
        </div>
    `;

    await loadStoreSelector();
    await fetchAppointments();
}

async function loadStoreSelector() {
    try {
        const response = await api.get('/stores/my/all');

        if (response.success) {
            const select = document.getElementById('storeSelector');
            select.innerHTML = response.data.stores.map(store => `
                <option value="${store._id}" ${store._id === currentStoreId ? 'selected' : ''}>
                    ${store.name}
                </option>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function changeStoreForAppointments() {
    currentStoreId = document.getElementById('storeSelector').value;
    fetchAppointments();
}

async function fetchAppointments() {
    try {
        showLoading();

        const status = document.getElementById('appointmentStatusFilter')?.value || '';
        const date = document.getElementById('appointmentDateFilter')?.value || '';
        const search = document.getElementById('appointmentSearch')?.value || '';

        const params = {
            page: currentAppointmentsPage,
            limit: CONSTANTS.PAGE_SIZE,
            status,
            date,
            search,
        };

        const response = await api.get(`/appointments/store/${currentStoreId}`, params);

        if (response.success) {
            renderAppointments(response.data, response.pagination);
        }

        hideLoading();
    } catch (error) {
        console.error('Error fetching appointments:', error);
        showToast('Error loading appointments', 'error');
        hideLoading();
    }
}

function renderAppointments(appointments, pagination) {
    const tbody = document.getElementById('appointmentsTableBody');

    if (!appointments || appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No appointments found</td></tr>';
        return;
    }

    tbody.innerHTML = appointments.map(apt => `
        <tr>
            <td><strong>${apt.appointmentNumber}</strong></td>
            <td>${apt.customerId?.name || 'N/A'}</td>
            <td>${apt.serviceType}</td>
            <td>${formatDate(apt.appointmentDate)}</td>
            <td>${apt.appointmentTime}</td>
            <td><span class="badge ${getStatusBadgeClass(apt.status)}">${apt.status}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewAppointment('${apt._id}')">View</button>
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('appointmentsPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeAppointmentsPage');
}

function filterAppointments() {
    currentAppointmentsPage = 1;
    fetchAppointments();
}

function changeAppointmentsPage(page) {
    currentAppointmentsPage = page;
    fetchAppointments();
}

async function viewAppointment(appointmentId) {
    try {
        showLoading();
        const response = await api.get(`/appointments/${appointmentId}`);

        if (response.success) {
            const apt = response.data.appointment;
            showModal(`Appointment ${apt.appointmentNumber}`, `
                <div style="display: grid; gap: 15px;">
                    <div><strong>Customer:</strong> ${apt.customerId?.name}</div>
                    <div><strong>Service Type:</strong> ${apt.serviceType}</div>
                    <div><strong>Date:</strong> ${formatDate(apt.appointmentDate, 'long')}</div>
                    <div><strong>Time:</strong> ${apt.appointmentTime}</div>
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(apt.status)}">${apt.status}</span></div>
                    <hr>
                    <h4>Customer Information</h4>
                    <div><strong>Name:</strong> ${apt.customerInfo?.name || apt.customerId?.name || 'N/A'}</div>
                    <div><strong>Email:</strong> ${apt.customerInfo?.email || apt.customerId?.email || 'N/A'}</div>
                    <div><strong>Phone:</strong> ${apt.customerInfo?.phone || apt.customerId?.phone || 'N/A'}</div>
                    ${apt.customerInfo?.age ? `<div><strong>Age:</strong> ${apt.customerInfo.age}</div>` : ''}
                    ${apt.customerInfo?.gender ? `<div><strong>Gender:</strong> ${apt.customerInfo.gender}</div>` : ''}
                    ${apt.healthInfo?.notes ? `
                        <hr>
                        <h4>Health Information</h4>
                        <div><strong>Notes:</strong> ${apt.healthInfo.notes}</div>
                    ` : ''}
                    <div><strong>Created:</strong> ${formatDate(apt.createdAt, 'datetime')}</div>
                </div>
            `);
        }

        hideLoading();
    } catch (error) {
        console.error('Error viewing appointment:', error);
        showToast('Error loading appointment details', 'error');
        hideLoading();
    }
}