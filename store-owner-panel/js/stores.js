// Store Owner - My Stores Management
let currentStoreId = null;

async function loadStores() {
  const pageContent = document.getElementById('pageContent');

  pageContent.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">My Stores</h3>
        <button class="btn btn-primary" onclick="showCreateStoreModal()">
          <i data-feather="plus-circle"></i> Create New Store
        </button>
      </div>
      <div class="card-body">
        <div id="storesGrid" class="stats-grid">
          <!-- Stores will be loaded here -->
        </div>
      </div>
    </div>
  `;

  await fetchMyStores();
}

async function fetchMyStores() {
  try {
    showLoading();
    const response = await api.get('/stores/my/all');

    if (response.success) {
      renderMyStores(response.data.stores);
    }

    hideLoading();
  } catch (error) {
    console.error('Error fetching stores:', error);
    showToast('Error loading stores', 'error');
    hideLoading();
  }
}

function renderMyStores(stores) {
  const grid = document.getElementById('storesGrid');

  if (!stores || stores.length === 0) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1/-1; text-align: center; padding: 40px;">
        <h3>No stores yet</h3>
        <p>Create your first store to start selling</p>
        <button class="btn btn-primary" onclick="showCreateStoreModal()">Create Store</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = stores.map(store => `
    <div class="card">
      <div style="text-align: center; margin-bottom: 15px;">
        <img src="${store.logo || 'https://via.placeholder.com/100'}"
             alt="${store.name}"
             style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;">
      </div>
      <h3 style="text-align: center; margin-bottom: 10px;">${store.name}</h3>
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="badge ${getStatusBadgeClass(store.subscriptionStatus)}">
          ${store.subscriptionStatus}
        </span>
        ${store.isActive
          ? '<span class="badge badge-success">Active</span>'
          : '<span class="badge badge-danger">Inactive</span>'}
      </div>
      <div style="display: grid; gap: 5px; font-size: 14px; margin-bottom: 15px;">
        <div><strong>Orders:</strong> ${store.stats?.totalOrders || 0}</div>
        <div><strong>Revenue:</strong> ${formatCurrency(store.stats?.totalRevenue || 0)}</div>
        <div><strong>Expires:</strong> ${formatDate(store.subscriptionExpiry)}</div>
      </div>
      <div style="display: flex; gap: 5px;">
        <button class="btn btn-sm btn-primary" onclick="manageStore('${store._id}')" style="flex: 1;">
          Manage
        </button>
        <button class="btn btn-sm btn-secondary" onclick="viewStoreStats('${store._id}')" style="flex: 1;">
          Stats
        </button>
      </div>
    </div>
  `).join('');
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
      country: 'Nigeria',
    },
  };

  try {
    showLoading();

    console.log('Create store payload:', data);

    const response = await api.post('/stores', data);

    if (response.success) {
      showToast('Store created successfully! Please complete payment to activate.', 'success');
      hideModal();
      fetchMyStores();
    } else {
      // If backend returns success: false with validation errors
      const validationErrors = response.errors;
      if (validationErrors && Array.isArray(validationErrors) && validationErrors.length > 0) {
        const details = validationErrors.map(e => `${e.field}: ${e.message}`).join(' | ');
        showToast(`Validation failed – ${details}`, 'error');
      } else {
        showToast(response.message || 'Error creating store', 'error');
      }
    }

    hideLoading();
  } catch (error) {
    console.error('Error creating store:', error);

    // Extract backend error details if present (Axios-style)
    const serverData = error.response?.data || {};
    const message = serverData.message || error.message || 'Error creating store';
    const validationErrors = serverData.errors;

    if (validationErrors && Array.isArray(validationErrors) && validationErrors.length > 0) {
      const details = validationErrors.map(e => `${e.field}: ${e.message}`).join(' | ');
      showToast(`${message} – ${details}`, 'error');
    } else {
      showToast(message, 'error');
    }

    hideLoading();
  }
}

function manageStore(storeId) {
  currentStoreId = storeId;
  app.navigateTo('products');
}

async function viewStoreStats(storeId) {
  try {
    showLoading();
    const response = await api.get(`/stores/${storeId}/stats`);

    if (response.success) {
      const stats = response.data;

      showModal('Store Statistics', `
        <div style="display: grid; gap: 15px;">
          <h4>Overview</h4>
          <div><strong>Total Orders:</strong> ${stats.store.stats.totalOrders}</div>
          <div><strong>Total Revenue:</strong> ${formatCurrency(stats.store.stats.totalRevenue)}</div>
          <div><strong>Total Customers:</strong> ${stats.store.stats.totalCustomers}</div>
          <div><strong>Products:</strong> ${stats.productCount}</div>
          <div><strong>Appointments:</strong> ${stats.appointmentCount}</div>

          <hr>

          <h4>Subscription</h4>
          <div>
            <strong>Status:</strong>
            <span class="badge ${getStatusBadgeClass(stats.store.subscriptionStatus)}">
              ${stats.store.subscriptionStatus}
            </span>
          </div>
          <div><strong>Expires:</strong> ${formatDate(stats.store.subscriptionExpiry, 'long')}</div>
          <div><strong>Days Remaining:</strong> ${stats.store.daysUntilExpiry} days</div>

          ${stats.lowStockCount > 0 ? `
            <hr>
            <div class="text-danger">
              <strong><i data-feather="alert-triangle"></i> Low Stock Alert:</strong>
              ${stats.lowStockCount} products are low on stock
            </div>
          ` : ''}
        </div>
      `);
    }

    hideLoading();
  } catch (error) {
    console.error('Error viewing stats:', error);
    showToast('Error loading statistics', 'error');
    hideLoading();
  }
}