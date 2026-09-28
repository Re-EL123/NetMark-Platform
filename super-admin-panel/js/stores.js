// Stores Management Page
let currentStoresPage = 1;

async function loadStores() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Stores Management</h3>
                <button class="btn btn-primary" onclick="showCreateStoreModal()">
                    <i data-feather="plus-circle"></i> Create New Store
                </button>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="storeStatusFilter" onchange="filterStores()">
                            <option value="">All Status</option>
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                        </select>
                        <select id="subscriptionFilter" onchange="filterStores()">
                            <option value="">All Subscriptions</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                        </select>
                    </div>
                    <input type="text" id="storeSearch" placeholder="Search stores..." 
                           oninput="debounce(filterStores, 500)()" style="max-width: 300px;">
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Store Name</th>
                                <th>Owner</th>
                                <th>Location</th>
                                <th>Subscription</th>
                                <th>Expiry</th>
                                <th>Orders</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="storesTableBody">
                            <tr><td colspan="8" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="storesPagination"></div>
            </div>
        </div>
    `;

    await fetchStores();
}

async function fetchStores() {
    try {
        showLoading();
        
        const isActive = document.getElementById('storeStatusFilter')?.value || '';
        const subscriptionStatus = document.getElementById('subscriptionFilter')?.value || '';
        const search = document.getElementById('storeSearch')?.value || '';

        const params = {
            page: currentStoresPage,
            limit: 20,
            isActive,
            subscriptionStatus,
            search
        };

        const response = await api.get('/admin/stores', params);
        
        if (response.success) {
            renderStores(response.data, response.pagination);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching stores:', error);
        showToast('Error loading stores', 'error');
        hideLoading();
    }
}

function renderStores(stores, pagination) {
    const tbody = document.getElementById('storesTableBody');
    
    if (stores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No stores found</td></tr>';
        return;
    }

    tbody.innerHTML = stores.map(store => `
        <tr>
            <td>
                <div class="d-flex align-center gap-10">
                    <img src="${store.logo || 'https://via.placeholder.com/32'}" 
                         alt="${store.name}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <span>${store.name}</span>
                </div>
            </td>
            <td>${store.distributorId?.name || 'N/A'}</td>
            <td>${store.address?.city || 'N/A'}, ${store.address?.state || 'N/A'}</td>
            <td><span class="badge ${getStatusBadgeClass(store.subscriptionStatus)}">${store.subscriptionStatus}</span></td>
            <td>${formatDate(store.subscriptionExpiry)}</td>
            <td>${store.stats?.totalOrders || 0}</td>
            <td><span class="badge ${store.isActive ? 'badge-success' : 'badge-danger'}">${store.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewStore('${store._id}')">View</button>
                <button class="btn btn-sm ${store.isActive ? 'btn-danger' : 'btn-success'}" 
                        onclick="toggleStoreStatus('${store._id}')">
                    ${store.isActive ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('storesPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeStoresPage');
}

function filterStores() {
    currentStoresPage = 1;
    fetchStores();
}

function changeStoresPage(page) {
    currentStoresPage = page;
    fetchStores();
}

async function viewStore(storeId) {
    try {
        showLoading();
        const response = await api.get(`/stores/${storeId}`);
        
        if (response.success) {
            const store = response.data.store;
            
            showModal(`Store Details - ${store.name}`, `
                <div style="display: grid; gap: 15px;">
                    <div>
                        <img src="${store.logo || 'https://via.placeholder.com/100'}" 
                             alt="${store.name}" style="width: 100px; height: 100px; border-radius: 10px;">
                    </div>
                    <div><strong>Name:</strong> ${store.name}</div>
                    <div><strong>Owner:</strong> ${store.distributorId?.name}</div>
                    <div><strong>Slug:</strong> /store/${store.slug}</div>
                    <div><strong>Description:</strong> ${store.description || 'N/A'}</div>
                    
                    <hr>
                    
                    <h4>Contact Information</h4>
                    <div><strong>Email:</strong> ${store.contactInfo?.email || 'N/A'}</div>
                    <div><strong>Phone:</strong> ${store.contactInfo?.phone || 'N/A'}</div>
                    
                    <hr>
                    
                    <h4>Address</h4>
                    <div>${store.address?.street || 'N/A'}</div>
                    <div>${store.address?.city || 'N/A'}, ${store.address?.state || 'N/A'}</div>
                    <div>${store.address?.country || 'N/A'}</div>
                    
                    <hr>
                    
                    <h4>Subscription</h4>
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(store.subscriptionStatus)}">${store.subscriptionStatus}</span></div>
                    <div><strong>Expiry:</strong> ${formatDate(store.subscriptionExpiry, 'long')}</div>
                    
                    <hr>
                    
                    <h4>Statistics</h4>
                    <div><strong>Total Orders:</strong> ${store.stats?.totalOrders || 0}</div>
                    <div><strong>Total Revenue:</strong> ${formatCurrency(store.stats?.totalRevenue || 0)}</div>
                    <div><strong>Total Customers:</strong> ${store.stats?.totalCustomers || 0}</div>
                </div>
            `);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error viewing store:', error);
        showToast('Error loading store details', 'error');
        hideLoading();
    }
}

async function toggleStoreStatus(storeId) {
    if (!confirm('Are you sure you want to change this store status?')) return;

    try {
        showLoading();
        
        const response = await api.put(`/admin/stores/${storeId}/toggle-status`);
        
        if (response.success) {
            showToast('Store status updated successfully', 'success');
            fetchStores();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error toggling store status:', error);
        showToast('Error updating store status', 'error');
        hideLoading();
    }
}

function showCreateStoreModal() {
    showModal('Create New Store', `
        <form id="createStoreForm" onsubmit="handleCreateStore(event)">
            <div class="form-group">
                <label>Store Name *</label>
                <input type="text" id="storeName" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="storeDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label>Contact Email *</label>
                <input type="email" id="contactEmail" required>
            </div>
            <div class="form-group">
                <label>Contact Phone *</label>
                <input type="tel" id="contactPhone" required>
            </div>
            <div class="form-group">
                <label>Street Address *</label>
                <input type="text" id="addressStreet" required>
            </div>
            <div class="form-group">
                <label>City *</label>
                <input type="text" id="addressCity" required>
            </div>
            <div class="form-group">
                <label>State *</label>
                <input type="text" id="addressState" required>
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" id="addressCountry" value="Nigeria">
            </div>
            <div class="form-group">
                <label>Logo URL</label>
                <input type="url" id="storeLogo">
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Create Store</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleCreateStore(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('storeName').value,
        description: document.getElementById('storeDescription').value,
        logo: document.getElementById('storeLogo').value,
        contactInfo: {
            email: document.getElementById('contactEmail').value,
            phone: document.getElementById('contactPhone').value,
        },
        address: {
            street: document.getElementById('addressStreet').value,
            city: document.getElementById('addressCity').value,
            state: document.getElementById('addressState').value,
            country: document.getElementById('addressCountry').value || 'Nigeria',
        }
    };

    try {
        showLoading();
        
        const response = await api.post(`/stores`, data);
        
        if (response.success) {
            showToast('Store created successfully!', 'success');
            hideModal();
            fetchStores();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error creating store:', error);
        showToast(error.message || 'Error creating store', 'error');
        hideLoading();
    }
}

window.loadStores = loadStores;
window.fetchStores = fetchStores;
window.renderStores = renderStores;
window.filterStores = filterStores;
window.changeStoresPage = changeStoresPage;
window.viewStore = viewStore;
window.toggleStoreStatus = toggleStoreStatus;
window.showCreateStoreModal = showCreateStoreModal;
window.handleCreateStore = handleCreateStore;