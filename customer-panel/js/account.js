async function loadProfile() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    const user = authService.currentUser;
    const content = document.getElementById('mainContent');
    content.innerHTML = `
        <section class="products-section">
            <div class="container account-layout">
                <div class="content-card">
                    <h2>Profile</h2>
                    <p class="help-text">Customers can shop and book appointments. Only verified distributors can activate an online store.</p>
                    <form id="profileForm" onsubmit="handleUpdateProfile(event)">
                        <div class="form-group">
                            <label>Full name</label>
                            <input type="text" id="profileName" value="${user.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="profileEmail" value="${user.email || ''}" disabled>
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" id="profilePhone" value="${user.phone || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Account type</label>
                            <input type="text" value="${user.role === 'distributor' ? 'Distributor' : 'Customer'}" disabled>
                        </div>
                        ${user.role === 'distributor' ? `
                            <div class="form-group">
                                <label>Distributor code</label>
                                <input type="text" value="${authService.getDistributorCode() || '-'}" disabled>
                            </div>
                        ` : ''}
                        <button type="submit" class="btn btn-primary">Save profile</button>
                    </form>
                </div>
                <div class="content-card">
                    <h3>Account rules</h3>
                    ${user.role === 'distributor' ? `
                        <p>You are a verified GreenWorld distributor. Pay the R3,500 yearly subscription to activate your store dashboard.</p>
                        <button class="btn btn-primary" onclick="app.navigateTo('activate-store')">Activate my store</button>
                    ` : `
                        <p>Customer accounts cannot own or operate a store. If you are a verified GreenWorld distributor, register with your official distributor code.</p>
                    `}
                </div>
            </div>
        </section>
    `;
}

async function handleUpdateProfile(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('profileName').value.trim(),
        phone: document.getElementById('profilePhone').value.trim(),
    };

    try {
        showLoading();
        const updated = await updateProfile(data);
        if (updated) {
            authService.currentUser = {
                ...authService.currentUser,
                ...data,
            };
            authService.updateUI();
            showToast('Profile updated', 'success');
        }
        hideLoading();
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast(error.message || 'Error updating profile', 'error');
        hideLoading();
    }
}

async function updateProfile(data) {
    const attempts = [
        () => api.put('/auth/me', data),
        () => api.put('/customers/profile', data),
        () => api.post('/customers/profile', data),
    ];

    let lastError;
    for (const attempt of attempts) {
        try {
            const response = await attempt();
            if (response?.success !== false) {
                return response;
            }
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Error updating profile');
}

async function loadAddressesPage() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    const content = document.getElementById('mainContent');
    content.innerHTML = `
        <section class="products-section">
            <div class="container">
                <div class="section-header" style="text-align: left;">
                    <h2>Delivery addresses</h2>
                    <p>Save addresses for faster checkout.</p>
                </div>
                <button class="btn btn-primary mb-20" onclick="showAddressForm()">Add address</button>
                <div id="savedAddresses"></div>
            </div>
        </section>
    `;

    await refreshSavedAddresses();
}

async function refreshSavedAddresses() {
    const container = document.getElementById('savedAddresses');
    if (!container) {
        return [];
    }

    try {
        const response = await api.get('/customers/addresses');
        const addresses = response.data?.addresses || response.data || [];
        if (!addresses.length) {
            container.innerHTML = '<div class="content-card"><p>No saved addresses yet.</p></div>';
            return [];
        }

        container.innerHTML = addresses.map((address) => `
            <div class="address-card">
                <h4>${address.label || 'Address'} ${address.isDefault ? '<span class="badge badge-info">Default</span>' : ''}</h4>
                <p><strong>${address.fullName || ''}</strong></p>
                <p>${address.street}, ${address.city}</p>
                <p>${address.state}, ${address.postalCode || ''} ${address.country || CONSTANTS.COUNTRY}</p>
                <p>Phone: ${address.phone || ''}</p>
                <div class="d-flex gap-10 mt-20">
                    <button class="btn btn-sm btn-outline" onclick="showAddressForm('${address._id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAddress('${address._id}')">Delete</button>
                </div>
            </div>
        `).join('');
        return addresses;
    } catch (error) {
        console.error('Error loading addresses:', error);
        container.innerHTML = '<p>Unable to load addresses.</p>';
        return [];
    }
}

async function showAddressForm(addressId = '') {
    let address = {};
    if (addressId) {
        const response = await api.get('/customers/addresses');
        const addresses = response.data?.addresses || response.data || [];
        address = addresses.find((item) => item._id === addressId) || {};
    }

    showModal(addressId ? 'Edit address' : 'Add address', `
        <form id="addressForm" onsubmit="handleSaveAddress(event, '${addressId}')">
            <div class="form-group">
                <label>Label *</label>
                <select id="addressLabel" required>
                    <option value="home" ${address.label === 'home' ? 'selected' : ''}>Home</option>
                    <option value="work" ${address.label === 'work' ? 'selected' : ''}>Work</option>
                    <option value="other" ${address.label === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Full name *</label>
                <input type="text" id="addressFullName" value="${address.fullName || authService.currentUser?.name || ''}" required>
            </div>
            <div class="form-group">
                <label>Phone *</label>
                <input type="tel" id="addressPhone" value="${address.phone || authService.currentUser?.phone || ''}" required>
            </div>
            <div class="form-group">
                <label>Street address *</label>
                <input type="text" id="addressStreet" value="${address.street || ''}" required>
            </div>
            <div class="form-group">
                <label>City *</label>
                <input type="text" id="addressCity" value="${address.city || ''}" required>
            </div>
            <div class="form-group">
                <label>Province *</label>
                <select id="addressState" required>
                    <option value="">Select province</option>
                    ${provinceOptions(address.state)}
                </select>
            </div>
            <div class="form-group">
                <label>Postal code</label>
                <input type="text" id="addressPostalCode" value="${address.postalCode || ''}">
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" id="addressCountry" value="${address.country || CONSTANTS.COUNTRY}" required>
            </div>
            <label class="checkbox-row">
                <input type="checkbox" id="addressDefault" ${address.isDefault ? 'checked' : ''}>
                Set as default delivery address
            </label>
            <div class="form-group mt-20">
                <button type="submit" class="btn btn-primary">Save address</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleSaveAddress(event, addressId) {
    event.preventDefault();

    const data = {
        label: document.getElementById('addressLabel').value,
        fullName: document.getElementById('addressFullName').value,
        phone: document.getElementById('addressPhone').value,
        street: document.getElementById('addressStreet').value,
        city: document.getElementById('addressCity').value,
        state: document.getElementById('addressState').value,
        postalCode: document.getElementById('addressPostalCode').value,
        country: document.getElementById('addressCountry').value || CONSTANTS.COUNTRY,
        isDefault: document.getElementById('addressDefault').checked,
    };

    try {
        showLoading();
        const response = addressId
            ? await api.put(`/customers/addresses/${addressId}`, data)
            : await api.post('/customers/addresses', data);

        if (response.success !== false) {
            showToast('Address saved', 'success');
            hideModal();
            if (typeof loadAddresses === 'function' && document.getElementById('addressesSelection')) {
                await loadAddresses();
            }
            await refreshSavedAddresses();
        }
        hideLoading();
    } catch (error) {
        console.error('Error saving address:', error);
        showToast(error.message || 'Error saving address', 'error');
        hideLoading();
    }
}

async function deleteAddress(addressId) {
    if (!window.confirm('Delete this address?')) {
        return;
    }

    try {
        showLoading();
        await api.delete(`/customers/addresses/${addressId}`);
        showToast('Address deleted', 'success');
        await refreshSavedAddresses();
        hideLoading();
    } catch (error) {
        console.error('Error deleting address:', error);
        showToast(error.message || 'Error deleting address', 'error');
        hideLoading();
    }
}

async function loadActivateStore() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    const content = document.getElementById('mainContent');

    if (!authService.isDistributor()) {
        content.innerHTML = `
            <section class="products-section">
                <div class="container">
                    <div class="content-card">
                        <h2>Store activation is for distributors</h2>
                        <p>Customer accounts cannot own a store. Register as a distributor with a valid GreenWorld Head Office code first.</p>
                    </div>
                </div>
            </section>
        `;
        return;
    }

    content.innerHTML = `
        <section class="products-section">
            <div class="container">
                <div class="content-card">
                    <h2>Activate your distributor store</h2>
                    <p>Yearly store activation is <strong>${formatCurrency(CONSTANTS.SUBSCRIPTION_FEE)}</strong> for 12 months. After payment, your role upgrades to store owner and the store dashboard is unlocked.</p>
                    <form id="activateStoreForm" onsubmit="handleActivateStore(event)">
                        <div class="form-group">
                            <label>Store name *</label>
                            <input type="text" id="activateStoreName" required>
                        </div>
                        <div class="form-group">
                            <label>Store URL slug *</label>
                            <input type="text" id="activateStoreSlug" placeholder="e.g. cape-town-wellness" required>
                            <small class="help-text">Your public store page will be /store/your-slug</small>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="activateStoreDescription" rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Contact email *</label>
                            <input type="email" id="activateStoreEmail" value="${authService.currentUser.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Contact phone *</label>
                            <input type="tel" id="activateStorePhone" value="${authService.currentUser.phone || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Street address *</label>
                            <input type="text" id="activateStoreStreet" required>
                        </div>
                        <div class="form-group">
                            <label>City *</label>
                            <input type="text" id="activateStoreCity" required>
                        </div>
                        <div class="form-group">
                            <label>Province *</label>
                            <select id="activateStoreState" required>
                                <option value="">Select province</option>
                                ${provinceOptions()}
                            </select>
                        </div>
                        <div class="form-group">
                            <button type="submit" class="btn btn-primary">Submit store activation</button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    `;
}

async function handleActivateStore(event) {
    event.preventDefault();

    const slug = document.getElementById('activateStoreSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const data = {
        name: document.getElementById('activateStoreName').value.trim(),
        slug,
        description: document.getElementById('activateStoreDescription').value.trim(),
        contactInfo: {
            email: document.getElementById('activateStoreEmail').value.trim(),
            phone: document.getElementById('activateStorePhone').value.trim(),
        },
        address: {
            street: document.getElementById('activateStoreStreet').value.trim(),
            city: document.getElementById('activateStoreCity').value.trim(),
            state: document.getElementById('activateStoreState').value,
            country: CONSTANTS.COUNTRY,
        },
        subscriptionAmount: CONSTANTS.SUBSCRIPTION_FEE,
    };

    try {
        showLoading();
        let response;
        try {
            response = await api.post('/stores', data);
        } catch (error) {
            response = await api.post('/distributors/stores', data);
        }

        if (response.success !== false) {
            showToast('Store submitted. Complete the R3,500 yearly payment to unlock your dashboard.', 'success');
            app.navigateTo('profile');
        }
        hideLoading();
    } catch (error) {
        console.error('Error activating store:', error);
        showToast(error.message || 'Unable to activate store yet. Use the store owner panel if this endpoint is not available.', 'error');
        hideLoading();
    }
}

window.loadProfile = loadProfile;
window.loadAddressesPage = loadAddressesPage;
window.loadActivateStore = loadActivateStore;
window.handleUpdateProfile = handleUpdateProfile;
window.showAddressForm = showAddressForm;
window.handleSaveAddress = handleSaveAddress;
window.deleteAddress = deleteAddress;
window.handleActivateStore = handleActivateStore;
window.refreshSavedAddresses = refreshSavedAddresses;
