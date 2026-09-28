// Orders Management Page
let currentOrdersPage = 1;

async function loadOrders() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Orders Management</h3>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="orderStatusFilter" onchange="filterOrders()">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="processing">Processing</option>
                            <option value="ready">Ready</option>
                            <option value="in_transit">In Transit</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <select id="buyerTypeFilter" onchange="filterOrders()">
                            <option value="">All Buyers</option>
                            <option value="customer">Customer</option>
                            <option value="distributor">Distributor</option>
                        </select>
                    </div>
                    <input type="text" id="orderSearch" placeholder="Search orders..." 
                           oninput="debounce(filterOrders, 500)()" style="max-width: 300px;">
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Order Number</th>
                                <th>Customer</th>
                                <th>Store</th>
                                <th>Buyer Type</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="ordersTableBody">
                            <tr><td colspan="9" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="ordersPagination"></div>
            </div>
        </div>
    `;

    await fetchOrders();
}

async function fetchOrders() {
    try {
        showLoading();
        
        const status = document.getElementById('orderStatusFilter')?.value || '';
        const buyerType = document.getElementById('buyerTypeFilter')?.value || '';
        const search = document.getElementById('orderSearch')?.value || '';

        const params = {
            page: currentOrdersPage,
            limit: 20,
            status,
            buyerType,
            search
        };

        // Note: We'll need an admin endpoint to get all orders
        const response = await api.get('/admin/orders', params);
        
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
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No orders found</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><strong>${order.orderNumber}</strong></td>
            <td>${order.customerId?.name || 'N/A'}</td>
            <td>${order.storeId?.name || 'N/A'}</td>
            <td><span class="badge badge-info">${order.buyerType}</span></td>
            <td>${order.items?.length || 0}</td>
            <td>${formatCurrency(order.total)}</td>
            <td><span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span></td>
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewOrder('${order._id}')">View</button>
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('ordersPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeOrdersPage');
}

function filterOrders() {
    currentOrdersPage = 1;
    fetchOrders();
}

function changeOrdersPage(page) {
    currentOrdersPage = page;
    fetchOrders();
}

async function viewOrder(orderId) {
    try {
        showLoading();
        const response = await api.get(`/orders/${orderId}`);
        
        if (response.success) {
            const order = response.data.order;
            
            showModal(`Order Details - ${order.orderNumber}`, `
                <div style="display: grid; gap: 15px;">
                    <div><strong>Customer:</strong> ${order.customerId?.name}</div>
                    <div><strong>Store:</strong> ${order.storeId?.name}</div>
                    <div><strong>Buyer Type:</strong> <span class="badge badge-info">${order.buyerType}</span></div>
                    ${order.distributorCode ? `<div><strong>Distributor Code:</strong> ${order.distributorCode}</div>` : ''}
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span></div>
                    <div><strong>Payment Status:</strong> <span class="badge ${getStatusBadgeClass(order.paymentStatus)}">${order.paymentStatus}</span></div>
                    
                    <hr>
                    
                    <h4>Items</h4>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                    <th>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${order.items.map(item => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${item.quantity}</td>
                                        <td>${formatCurrency(item.price)}</td>
                                        <td>${formatCurrency(item.subtotal)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <hr>
                    
                    <div><strong>Subtotal:</strong> ${formatCurrency(order.subtotal)}</div>
                    <div><strong>Delivery Fee:</strong> ${formatCurrency(order.deliveryFee)}</div>
                    <div><strong>Tax:</strong> ${formatCurrency(order.tax || 0)}</div>
                    <div><strong>Total:</strong> <strong>${formatCurrency(order.total)}</strong></div>
                    
                    <hr>
                    
                    <h4>Delivery Address</h4>
                    <div>${order.deliveryAddress?.fullName}</div>
                    <div>${order.deliveryAddress?.phone}</div>
                    <div>${order.deliveryAddress?.street}, ${order.deliveryAddress?.city}</div>
                    <div>${order.deliveryAddress?.state}, ${order.deliveryAddress?.country}</div>
                    
                    ${order.driverId ? `
                        <hr>
                        <div><strong>Driver:</strong> ${order.driverId?.userId?.name || 'Assigned'}</div>
                    ` : ''}
                    
                    <div><strong>Created:</strong> ${formatDate(order.createdAt, 'datetime')}</div>
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