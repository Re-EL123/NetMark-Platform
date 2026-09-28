// Store Owner - Orders Management
let currentOrdersPage = 1;

async function loadOrders() {
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
                <h3 class="card-title">Store Orders</h3>
                <select id="storeSelector" onchange="changeStoreForOrders()">
                    <!-- Will be populated -->
                </select>
            </div>
            <div class="card-body">
                <div class="d-flex gap-10 mb-20">
                    <select id="orderStatusFilter" onchange="filterOrders()">
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="ready">Ready for Delivery</option>
                        <option value="in_transit">In Transit</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Order #</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="ordersTableBody">
                            <tr><td colspan="7" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div id="ordersPagination"></div>
            </div>
        </div>
    `;

    await loadStoreSelector();
    await fetchStoreOrders();
}

async function changeStoreForOrders() {
    currentStoreId = document.getElementById('storeSelector').value;
    fetchStoreOrders();
}

async function fetchStoreOrders() {
    try {
        showLoading();
        
        const status = document.getElementById('orderStatusFilter')?.value || '';
        
        const params = {
            page: currentOrdersPage,
            limit: 20,
            status
        };

        const response = await api.get(`/orders/store/${currentStoreId}`, params);
        
        if (response.success) {
            renderOrders(response.data, response.pagination);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching orders:', error);
        showToast('Error loading orders', 'error');
        hideLoading();
    }
}

function renderOrders(orders, pagination) {
    const tbody = document.getElementById('ordersTableBody');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No orders found</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><strong>${order.orderNumber}</strong></td>
            <td>${order.customerId?.name || 'N/A'}</td>
            <td>${order.items?.length || 0} items</td>
            <td>${formatCurrency(order.total)}</td>
            <td><span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span></td>
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewOrderDetails('${order._id}')">View</button>
                ${order.orderStatus === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="updateOrderStatus('${order._id}', 'confirmed')">Confirm</button>
                ` : ''}
                ${order.orderStatus === 'confirmed' ? `
                    <button class="btn btn-sm btn-success" onclick="updateOrderStatus('${order._id}', 'ready')">Ready</button>
                ` : ''}
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('ordersPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeOrdersPage');
}

function filterOrders() {
    currentOrdersPage = 1;
    fetchStoreOrders();
}

function changeOrdersPage(page) {
    currentOrdersPage = page;
    fetchStoreOrders();
}

async function viewOrderDetails(orderId) {
    try {
        showLoading();
        const response = await api.get(`/orders/${orderId}`);
        
        if (response.success) {
            const order = response.data.order;
            
            showModal(`Order ${order.orderNumber}`, `
                <div style="display: grid; gap: 15px;">
                    <div><strong>Customer:</strong> ${order.customerId?.name}</div>
                    <div><strong>Phone:</strong> ${order.customerId?.phone}</div>
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span></div>
                    
                    <hr>
                    
                    <h4>Items</h4>
                    ${order.items.map(item => `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                            <span>${item.name} x${item.quantity}</span>
                            <strong>${formatCurrency(item.subtotal)}</strong>
                        </div>
                    `).join('')}
                    
                    <hr>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span>Subtotal:</span>
                        <strong>${formatCurrency(order.subtotal)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Delivery Fee:</span>
                        <strong>${formatCurrency(order.deliveryFee)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 18px;">
                        <span><strong>Total:</strong></span>
                        <strong>${formatCurrency(order.total)}</strong>
                    </div>
                    
                    <hr>
                    
                    <h4>Delivery Address</h4>
                    <div>${order.deliveryAddress?.fullName}</div>
                    <div>${order.deliveryAddress?.phone}</div>
                    <div>${order.deliveryAddress?.street}</div>
                    <div>${order.deliveryAddress?.city}, ${order.deliveryAddress?.state}</div>
                </div>
            `);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error viewing order:', error);
        showToast('Error loading order details', 'error');
        hideLoading();
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        showLoading();
        
        const response = await api.put(`/orders/${orderId}/status`, {
            status,
            note: `Status updated to ${status} by store owner`
        });
        
        if (response.success) {
            showToast('Order status updated successfully', 'success');
            fetchStoreOrders();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error updating order:', error);
        showToast('Error updating order status', 'error');
        hideLoading();
    }
}