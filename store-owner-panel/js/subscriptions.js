// Store Owner Subscriptions Management Page
let currentSubscriptionsPage = 1;

async function requestSubscriptionEndpoint(candidates, { method = 'GET', body = null, params = {} } = {}) {
    const methods = method === 'GET' ? ['GET'] : method === 'POST' ? ['POST'] : method === 'PUT' ? ['PUT', 'PATCH'] : method === 'PATCH' ? ['PATCH', 'PUT'] : [method];

    for (const attemptMethod of methods) {
        for (const endpoint of candidates) {
            try {
                if (attemptMethod === 'GET') {
                    return await api.get(endpoint, params);
                }
                if (attemptMethod === 'POST') {
                    return await api.post(endpoint, body);
                }
                if (attemptMethod === 'PUT') {
                    return await api.put(endpoint, body);
                }
                if (attemptMethod === 'PATCH') {
                    return await api.request(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
                }
            } catch (error) {
                const message = (error?.message || '').toLowerCase();
                if (message.includes('unauthorized') || message.includes('no authentication token') || message.includes('forbidden')) {
                    throw error;
                }
            }
        }
    }

    throw new Error('Subscription request failed');
}

async function loadSubscriptions() {
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
                <h3 class="card-title">Store Subscriptions</h3>
                <div class="d-flex gap-10">
                    <select id="storeSelector" onchange="changeStoreForSubscriptions()"></select>
                    <button class="btn btn-primary" onclick="viewExpiringSubscriptions()">
                        <i data-feather="alert-triangle" class="nav-icon"></i> Expiring Soon
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="subscriptionStatusFilter" onchange="filterSubscriptions()">
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                            <option value="pending">Pending</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <select id="paymentStatusFilter" onchange="filterSubscriptions()">
                            <option value="">All Payment Status</option>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Store</th>
                                <th>Start Date</th>
                                <th>Expiry Date</th>
                                <th>Duration</th>
                                <th>Amount</th>
                                <th>Payment Status</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="subscriptionsTableBody">
                            <tr><td colspan="8" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div id="subscriptionsPagination"></div>
            </div>
        </div>
    `;

    await loadStoreSelector();
    await fetchSubscriptions();
}

async function loadStoreSelector() {
    try {
        const response = await api.get('/stores/my/all');

        if (response.success) {
            const select = document.getElementById('storeSelector');
            select.innerHTML = response.data.stores.map((store) => `
                <option value="${store._id}" ${store._id === currentStoreId ? 'selected' : ''}>
                    ${store.name}
                </option>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function changeStoreForSubscriptions() {
    currentStoreId = document.getElementById('storeSelector').value;
    fetchSubscriptions();
}

async function fetchSubscriptions() {
    try {
        showLoading();

        const status = document.getElementById('subscriptionStatusFilter')?.value || '';
        const paymentStatus = document.getElementById('paymentStatusFilter')?.value || '';

        const params = {
            page: currentSubscriptionsPage,
            limit: CONSTANTS.PAGE_SIZE,
            status,
            paymentStatus,
        };

        const response = await requestSubscriptionEndpoint([
            `/subscriptions/store/${currentStoreId}`,
            `/stores/${currentStoreId}/subscriptions`,
            `/subscriptions/my/${currentStoreId}`
        ], { method: 'GET', params });

        const data = response?.data ?? response;
        const subscriptions = Array.isArray(data) ? data : Array.isArray(data?.subscriptions) ? data.subscriptions : [];
        const pagination = response?.pagination || data?.pagination || {
            page: currentSubscriptionsPage,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
        };

        renderSubscriptions(subscriptions, pagination);
        hideLoading();
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        showToast('Error loading subscriptions', 'error');
        hideLoading();
    }
}

function renderSubscriptions(subscriptions, pagination) {
    const tbody = document.getElementById('subscriptionsTableBody');

    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No subscriptions found</td></tr>';
        return;
    }

    tbody.innerHTML = subscriptions.map((sub) => `
        <tr>
            <td>${sub.storeId?.name || sub.store?.name || 'N/A'}</td>
            <td>${formatDate(sub.startDate || sub.start_at)}</td>
            <td>${formatDate(sub.expiryDate || sub.expiry_date)}</td>
            <td>${sub.durationMonths || sub.duration_months || 0} months</td>
            <td>${formatCurrency(sub.amount || sub.totalAmount || 0)}</td>
            <td><span class="badge ${getStatusBadgeClass(sub.paymentStatus || sub.payment_status)}">${sub.paymentStatus || sub.payment_status || 'pending'}</span></td>
            <td><span class="badge ${getStatusBadgeClass(sub.status || sub.subscriptionStatus)}">${sub.status || sub.subscriptionStatus || 'active'}</span></td>
            <td>
                ${((sub.paymentStatus || sub.payment_status) === 'pending') ? `
                    <button class="btn btn-sm btn-success" data-action="confirm-payment" data-subscription-id="${sub._id}">Confirm Payment</button>
                ` : `
                    <button class="btn btn-sm btn-primary" data-action="view-subscription" data-subscription-id="${sub._id}">View</button>
                `}
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="confirm-payment"]').forEach((button) => {
        button.addEventListener('click', () => confirmPayment(button.dataset.subscriptionId));
    });

    tbody.querySelectorAll('[data-action="view-subscription"]').forEach((button) => {
        button.addEventListener('click', () => viewSubscription(button.dataset.subscriptionId));
    });

    const paginationContainer = document.getElementById('subscriptionsPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeSubscriptionsPage');
}

function filterSubscriptions() {
    currentSubscriptionsPage = 1;
    fetchSubscriptions();
}

function changeSubscriptionsPage(page) {
    currentSubscriptionsPage = page;
    fetchSubscriptions();
}

async function confirmPayment(subscriptionId) {
    const reference = prompt('Enter payment reference:');
    if (!reference) return;

    try {
        showLoading();

        const payload = {
            paymentReference: reference,
            paymentMethod: 'transfer',
        };

        const response = await requestSubscriptionEndpoint([
            `/subscriptions/${subscriptionId}/confirm-payment`,
            `/stores/${currentStoreId}/subscriptions/${subscriptionId}/confirm-payment`,
            `/subscriptions/${subscriptionId}/confirm`,
            `/stores/${currentStoreId}/subscriptions/${subscriptionId}/confirm`
        ], { method: 'PUT', body: payload });

        if (response?.success !== false) {
            showToast('Payment confirmed successfully', 'success');
            fetchSubscriptions();
        } else {
            showToast(response?.message || 'Error confirming payment', 'error');
        }

        hideLoading();
    } catch (error) {
        console.error('Error confirming payment:', error);
        showToast('Error confirming payment', 'error');
        hideLoading();
    }
}

async function viewExpiringSubscriptions() {
    try {
        showLoading();
        const response = await requestSubscriptionEndpoint([
            `/subscriptions/store/${currentStoreId}/expiring/soon`,
            `/stores/${currentStoreId}/subscriptions/expiring/soon`,
            `/subscriptions/expiring/soon`
        ], { method: 'GET', params: { days: 30 } });

        const payload = response?.data ?? response;
        const subscriptions = Array.isArray(payload) ? payload : Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];

        if (subscriptions.length > 0) {
            showModal('Expiring Subscriptions (Next 30 Days)', `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Store</th>
                                <th>Expiry Date</th>
                                <th>Days Left</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subscriptions.map((sub) => {
                                const daysLeft = Math.ceil((new Date(sub.expiryDate || sub.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                                return `
                                    <tr>
                                        <td>${sub.storeId?.name || sub.store?.name || 'N/A'}</td>
                                        <td>${formatDate(sub.expiryDate || sub.expiry_date)}</td>
                                        <td><span class="badge badge-warning">${daysLeft} days</span></td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `);
        } else {
            showToast('No expiring subscriptions found', 'info');
        }

        hideLoading();
    } catch (error) {
        console.error('Error fetching expiring subscriptions:', error);
        showToast('Error loading data', 'error');
        hideLoading();
    }
}

async function viewSubscription(subscriptionId) {
    try {
        showLoading();
        const response = await requestSubscriptionEndpoint([
            `/subscriptions/${subscriptionId}`,
            `/stores/${currentStoreId}/subscriptions/${subscriptionId}`
        ], { method: 'GET' });

        const payload = response?.data ?? response;
        const sub = payload?.subscription || payload;

        if (sub) {
            showModal('Subscription Details', `
                <div style="display: grid; gap: 15px;">
                    <div><strong>Store:</strong> ${sub.storeId?.name || sub.store?.name || 'N/A'}</div>
                    <div><strong>Start Date:</strong> ${formatDate(sub.startDate || sub.start_at, 'long')}</div>
                    <div><strong>Expiry Date:</strong> ${formatDate(sub.expiryDate || sub.expiry_date, 'long')}</div>
                    <div><strong>Duration:</strong> ${sub.durationMonths || sub.duration_months || 0} months</div>
                    <div><strong>Amount:</strong> ${formatCurrency(sub.amount || sub.totalAmount || 0)}</div>
                    <div><strong>Payment Status:</strong> <span class="badge ${getStatusBadgeClass(sub.paymentStatus || sub.payment_status)}">${sub.paymentStatus || sub.payment_status || 'pending'}</span></div>
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(sub.status || sub.subscriptionStatus)}">${sub.status || sub.subscriptionStatus || 'active'}</span></div>
                    ${sub.paymentReference || sub.payment_reference ? `<div><strong>Payment Reference:</strong> ${sub.paymentReference || sub.payment_reference}</div>` : ''}
                    ${sub.invoiceNumber || sub.invoice_number ? `<div><strong>Invoice Number:</strong> ${sub.invoiceNumber || sub.invoice_number}</div>` : ''}
                    <div><strong>Created:</strong> ${formatDate(sub.createdAt || sub.created_at, 'datetime')}</div>
                </div>
            `);
        } else {
            showToast('Subscription details not available', 'warning');
        }

        hideLoading();
    } catch (error) {
        console.error('Error viewing subscription:', error);
        showToast('Error loading subscription details', 'error');
        hideLoading();
    }
}

window.loadSubscriptions = loadSubscriptions;
window.fetchSubscriptions = fetchSubscriptions;
window.filterSubscriptions = filterSubscriptions;
window.changeSubscriptionsPage = changeSubscriptionsPage;
window.confirmPayment = confirmPayment;
window.viewExpiringSubscriptions = viewExpiringSubscriptions;
window.viewSubscription = viewSubscription;