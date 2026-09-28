async function loadAppointments() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    const content = document.getElementById('mainContent');
    content.innerHTML = `
        <div class="container">
            <div class="appointment-form">
                <h2>Book an Appointment</h2>
                <p class="help-text mb-20">Choose a GreenWorld wellness service, store, date and available time slot.</p>
                <button class="btn btn-primary mb-20" onclick="showBookAppointmentModal()">
                    Book New Appointment
                </button>

                <h3>My Appointments</h3>
                <div id="appointmentsContainer"></div>
            </div>
        </div>
    `;

    await fetchCustomerAppointments();
}

async function fetchCustomerAppointments() {
    try {
        showLoading();
        const response = await api.get('/appointments/my/all');

        if (response.success) {
            const appointments = Array.isArray(response.data) ? response.data : response.data?.appointments || [];
            renderCustomerAppointments(appointments);
        }

        hideLoading();
    } catch (error) {
        console.error('Error fetching appointments:', error);
        hideLoading();
    }
}

function canCancelAppointment(apt) {
    const cancellable = ['pending', 'confirmed'];
    if (!cancellable.includes(apt.status)) {
        return false;
    }
    if (typeof apt.canBeCancelled === 'boolean') {
        return apt.canBeCancelled;
    }
    const appointmentDate = new Date(`${apt.appointmentDate}T${apt.appointmentTime || '00:00'}`);
    return Number.isNaN(appointmentDate.getTime()) || appointmentDate > new Date();
}

function renderCustomerAppointments(appointments) {
    const container = document.getElementById('appointmentsContainer');

    if (!appointments.length) {
        container.innerHTML = '<p>No appointments yet</p>';
        return;
    }

    container.innerHTML = appointments.map((apt) => `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <strong>${apt.appointmentNumber || 'Appointment'}</strong>
                    <p>${getAppointmentServiceLabel(apt.serviceType || apt.serviceName)}</p>
                </div>
                <span class="badge ${getStatusBadgeClass(apt.status)}">${apt.status}</span>
            </div>
            <div class="order-items">
                <p><strong>Date:</strong> ${formatDate(apt.appointmentDate, 'long')}</p>
                <p><strong>Time:</strong> ${apt.appointmentTime}</p>
                <p><strong>Store:</strong> ${apt.storeId?.name || apt.store?.name || 'N/A'}</p>
            </div>
            ${canCancelAppointment(apt) ? `
                <button class="btn btn-sm btn-danger" onclick="cancelCustomerAppointment('${apt._id}')">
                    Cancel Appointment
                </button>
            ` : ''}
        </div>
    `).join('');
}

function showBookAppointmentModal() {
    showModal('Book Appointment', `
        <form id="bookAppointmentForm" onsubmit="handleBookAppointment(event)">
            <div class="form-group">
                <label>Select Store *</label>
                <select id="appointmentStore" required>
                    <option value="">Loading stores...</option>
                </select>
            </div>
            <div class="form-group">
                <label>Service Type *</label>
                <select id="serviceType" required>
                    ${CONSTANTS.APPOINTMENT_SERVICES.map((service) => `
                        <option value="${service.value}">${service.label}</option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="appointmentDate" min="${new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label>Time slot *</label>
                <div class="time-slots" id="appointmentSlots">
                    <p>Select a store and date to see available slots.</p>
                </div>
                <input type="hidden" id="appointmentTime" required>
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Book Appointment</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);

    loadStoresForAppointment();
    document.getElementById('appointmentStore').addEventListener('change', refreshAppointmentSlots);
    document.getElementById('appointmentDate').addEventListener('change', refreshAppointmentSlots);
}

async function loadStoresForAppointment() {
    try {
        const response = await api.get('/customers/stores');
        const select = document.getElementById('appointmentStore');
        const stores = (Array.isArray(response.data) ? response.data : response.data?.stores || [])
            .filter((store) => isStoreOpen(store));

        if (response.success) {
            select.innerHTML = '<option value="">Select a store...</option>' +
                stores.map((store) =>
                    `<option value="${getStoreId(store)}">${store.name} - ${store.address?.city || ''}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function defaultTimeSlots() {
    return ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
}

async function refreshAppointmentSlots() {
    const storeId = document.getElementById('appointmentStore')?.value;
    const date = document.getElementById('appointmentDate')?.value;
    const container = document.getElementById('appointmentSlots');
    const timeInput = document.getElementById('appointmentTime');

    if (!container) {
        return;
    }

    timeInput.value = '';

    if (!storeId || !date) {
        container.innerHTML = '<p>Select a store and date to see available slots.</p>';
        return;
    }

    let slots = defaultTimeSlots();
    try {
        const response = await api.tryGet([
            `/appointments/slots`,
            `/appointments/store/${storeId}/slots`,
            `/stores/${storeId}/appointment-slots`,
        ], { storeId, date });
        const apiSlots = response.data?.slots || response.data || [];
        if (Array.isArray(apiSlots) && apiSlots.length) {
            slots = apiSlots.map((slot) => slot.startTime || slot.time || slot).filter(Boolean);
        }
    } catch (error) {
        console.warn('Using default appointment slots', error);
    }

    container.innerHTML = slots.map((slot) => `
        <button type="button" class="time-slot" data-time="${slot}" onclick="selectAppointmentSlot('${slot}')">${slot}</button>
    `).join('');
}

function selectAppointmentSlot(time) {
    const timeInput = document.getElementById('appointmentTime');
    timeInput.value = time;
    document.querySelectorAll('#appointmentSlots .time-slot').forEach((slot) => {
        slot.classList.toggle('selected', slot.dataset.time === time);
    });
}

async function handleBookAppointment(event) {
    event.preventDefault();

    if (!document.getElementById('appointmentTime').value) {
        showToast('Please select a time slot', 'warning');
        return;
    }

    const data = {
        storeId: document.getElementById('appointmentStore').value,
        serviceType: document.getElementById('serviceType').value,
        serviceName: getAppointmentServiceLabel(document.getElementById('serviceType').value),
        appointmentDate: document.getElementById('appointmentDate').value,
        appointmentTime: document.getElementById('appointmentTime').value,
        paymentType: 'appointment',
        customerInfo: {
            name: authService.currentUser.name,
            email: authService.currentUser.email,
            phone: authService.currentUser.phone,
        },
    };

    try {
        showLoading();
        const response = await api.post('/appointments', data);

        if (response.success) {
            showToast('Appointment booked successfully!', 'success');
            hideModal();
            fetchCustomerAppointments();
        }

        hideLoading();
    } catch (error) {
        console.error('Error booking appointment:', error);
        showToast(error.message || 'Error booking appointment', 'error');
        hideLoading();
    }
}

async function cancelCustomerAppointment(appointmentId) {
    if (!window.confirm('Cancel this appointment?')) {
        return;
    }

    try {
        showLoading();
        try {
            await api.put(`/appointments/${appointmentId}/cancel`, { status: 'cancelled' });
        } catch (error) {
            await api.put(`/appointments/${appointmentId}`, { status: 'cancelled' });
        }
        showToast('Appointment cancelled', 'success');
        await fetchCustomerAppointments();
        hideLoading();
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        showToast(error.message || 'Error cancelling appointment', 'error');
        hideLoading();
    }
}

window.cancelCustomerAppointment = cancelCustomerAppointment;
window.selectAppointmentSlot = selectAppointmentSlot;
window.showBookAppointmentModal = showBookAppointmentModal;
window.handleBookAppointment = handleBookAppointment;
