async function loadOrders() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    const content = document.getElementById('mainContent');
    
    content.innerHTML = `
        <div class="container">
            <div class="orders-list">
                <h2>My Orders</h2>
                <div id="ordersContainer">
                    <!-- Orders will load here -->
                </div>
            </div>
        </div>
    `;

    await fetchCustomerOrders();
}

async function fetchCustomerOrders() {
    try {
        showLoading();
        const response = await api.get('/orders/my/all');
        
        if (response.success) {
            renderCustomerOrders(response.data);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching orders:', error);
        showToast('Error loading orders', 'error');
        hideLoading();
    }
}

function renderCustomerOrders(orders) {
    const container = document.getElementById('ordersContainer');
    
    if (orders.length === 0) {
        container.innerHTML = '<p>No orders yet</p>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <strong>${order.orderNumber}</strong>
                    <p>${formatDate(order.createdAt, 'datetime')}</p>
                </div>
                <span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span>
            </div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <span>${item.name} x${item.quantity}</span>
                        <strong>${formatCurrency(item.subtotal)}</strong>
                    </div>
                `).join('')}
            </div>
            ${order.deliveryOtp && order.orderStatus !== 'delivered' && order.orderStatus !== 'cancelled' ? `
                <div style="background: #E8F5E9; border: 1px dashed #4CAF50; border-radius: 6px; padding: 10px 14px; margin: 12px 0 6px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 11px; text-transform: uppercase; color: #2E7D32; font-weight: bold; display: block;">Delivery PIN (Proof of Delivery)</span>
                        <span style="font-size: 12px; color: #555;">Give this 4-digit code to your driver upon arrival</span>
                    </div>
                    <div style="font-size: 20px; font-weight: bold; letter-spacing: 4px; color: #2E7D32; background: #fff; padding: 4px 10px; border-radius: 4px; border: 1px solid #A5D6A7;">
                        ${order.deliveryOtp}
                    </div>
                </div>
            ` : ''}
            <div class="order-footer">
                <div>
                    <strong>Total: ${formatCurrency(order.total)}</strong>
                </div>
                <button class="btn btn-sm btn-primary" onclick="trackCustomerOrder('${order.orderNumber}')">
                    Track Order
                </button>
            </div>
        </div>
    `).join('');
}

function trackCustomerOrder(orderNumber) {
    showModal('Track Order', `
        <div id="orderTrackingInfo">Loading...</div>
    `);
    
    fetchOrderTracking(orderNumber);
}

async function fetchOrderTracking(orderNumber) {
    try {
        const response = await api.get(`/orders/track/${orderNumber}`);
        
        if (response.success) {
            const order = response.data;
            document.getElementById('orderTrackingInfo').innerHTML = `
                <div style="text-align: center;">
                    <h3>${order.orderNumber}</h3>
                    <div style="margin: 20px 0;">
                        <span class="badge ${getStatusBadgeClass(order.orderStatus)}">${order.orderStatus}</span>
                    </div>
                    <div style="text-align: left; margin-top: 20px;">
                        <h4>Status History</h4>
                        ${order.statusHistory.map(s => `
                            <div style="padding: 10px; border-bottom: 1px solid #eee;">
                                <strong>${s.status}</strong><br>
                                <small>${formatDate(s.timestamp, 'datetime')}</small><br>
                                ${s.note ? `<p>${s.note}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error tracking order:', error);
    }
}