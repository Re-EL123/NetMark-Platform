let selectedAddressId = null;
let selectedStoreId = null;
let checkoutStores = [];

async function loadCheckout() {
    if (!authService.isAuthenticated()) {
        showLoginModal();
        return;
    }

    if (cart.items.length === 0) {
        const content = document.getElementById('mainContent');
        content.innerHTML = `
            <div class="container" style="padding: 80px 0; text-align: center;">
                <h2>Your cart is empty</h2>
                <p>Add some products to proceed with checkout</p>
                <button class="btn btn-primary" onclick="app.navigateTo('shop')">Continue Shopping</button>
            </div>
        `;
        return;
    }

    const content = document.getElementById('mainContent');
    content.innerHTML = `
        <div class="container">
            <div class="checkout-container">
                <div>
                    <div class="checkout-section">
                        <h3>Select Store</h3>
                        <div id="storesSelection"></div>
                    </div>

                    <div class="checkout-section">
                        <h3>Delivery Address</h3>
                        <div id="addressesSelection"></div>
                        <button class="btn btn-outline" onclick="showAddAddressModal()">+ Add New Address</button>
                    </div>

                    <div class="checkout-section">
                        <h3>Payment Method</h3>
                        <select id="paymentMethod" class="form-control">
                            <option value="payfast">PayFast (Card, Capitec Pay, Instant EFT, SnapScan)</option>
                            <option value="cash">Cash on Delivery</option>
                            <option value="transfer">Direct Bank Transfer</option>
                        </select>
                        ${authService.isDistributor() ? `<p class="help-text mt-20">This order will be recorded as a distributor purchase for Head Office reporting. Code: <strong>${authService.getDistributorCode() || 'on file'}</strong></p>` : ''}
                    </div>
                </div>

                <div class="order-summary checkout-section">
                    <h3>Order Summary</h3>
                    <div id="orderSummaryItems">
                        ${cart.items.map((item) => `
                            <div class="summary-item">
                                <div>
                                    <div>${item.name}</div>
                                    <small>Qty: ${item.quantity}</small>
                                </div>
                                <strong>${formatCurrency(item.price * item.quantity)}</strong>
                            </div>
                        `).join('')}
                    </div>

                    <div class="summary-item">
                        <span>Subtotal</span>
                        <strong id="summarySubtotal">${formatCurrency(cart.getTotal())}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Delivery Fee</span>
                        <strong id="summaryDeliveryFee">${formatCurrency(0)}</strong>
                    </div>
                    <div class="summary-total">
                        <span>Total</span>
                        <strong id="summaryTotal">${formatCurrency(cart.getTotal())}</strong>
                    </div>

                    <button class="btn btn-primary btn-block" onclick="placeOrder()">
                        Place Order
                    </button>
                </div>
            </div>
        </div>
    `;

    await loadStoresForCheckout();
    await loadAddresses();
}

async function loadStoresForCheckout() {
    try {
        const response = await api.get('/customers/stores', { limit: 50 });

        if (response.success) {
            const container = document.getElementById('storesSelection');
            checkoutStores = (Array.isArray(response.data) ? response.data : response.data?.stores || [])
                .filter((store) => isStoreOpen(store));

            if (!checkoutStores.length) {
                container.innerHTML = '<p>No active stores are available for delivery right now.</p>';
                return;
            }

            if (selectedStoreId && !checkoutStores.some((store) => getStoreId(store) === selectedStoreId)) {
                selectedStoreId = null;
            }

            container.innerHTML = checkoutStores.map((store) => `
                <div class="address-card ${selectedStoreId === getStoreId(store) ? 'selected' : ''}"
                     onclick="selectStore('${getStoreId(store)}')">
                    <h4>${store.name}</h4>
                    <p>${store.address?.city || ''}, ${store.address?.state || ''}</p>
                    <small>Delivery Fee: ${formatCurrency(getDeliveryFee(store))}</small>
                </div>
            `).join('');

            const preferredStoreId = cart.items.find((item) => item.storeId)?.storeId;
            const initialStore = checkoutStores.find((store) => getStoreId(store) === preferredStoreId) || checkoutStores[0];
            if (initialStore && !selectedStoreId) {
                selectStore(getStoreId(initialStore));
            } else {
                updateOrderSummary();
            }
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function selectStore(storeId) {
    selectedStoreId = storeId;

    document.querySelectorAll('#storesSelection .address-card').forEach((card) => {
        card.classList.remove('selected');
    });

    const selectedCard = document.querySelector(`#storesSelection .address-card[onclick*="selectStore('${storeId}')"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    updateOrderSummary();
}

async function loadAddresses() {
    try {
        const response = await api.get('/customers/addresses');

        if (response.success) {
            const container = document.getElementById('addressesSelection');
            const addresses = response.data.addresses || response.data || [];

            if (addresses.length === 0) {
                container.innerHTML = '<p>No addresses found. Please add one.</p>';
                return;
            }

            container.innerHTML = addresses.map((address) => `
                <div class="address-card ${selectedAddressId === address._id ? 'selected' : ''}"
                     onclick="selectAddress('${address._id}')">
                    <h4>${address.label}</h4>
                    <p><strong>${address.fullName}</strong></p>
                    <p>${address.street}, ${address.city}</p>
                    <p>${address.state}, ${address.country || CONSTANTS.COUNTRY}</p>
                    <p>Phone: ${address.phone}</p>
                    ${address.isDefault ? '<span class="badge badge-primary">Default</span>' : ''}
                </div>
            `).join('');

            const defaultAddress = addresses.find((address) => address.isDefault);
            if (defaultAddress) {
                selectAddress(defaultAddress._id);
            } else if (addresses.length > 0) {
                selectAddress(addresses[0]._id);
            }
        }
    } catch (error) {
        console.error('Error loading addresses:', error);
    }
}

function selectAddress(addressId) {
    selectedAddressId = addressId;

    document.querySelectorAll('#addressesSelection .address-card').forEach((card) => {
        card.classList.remove('selected');
    });

    const selectedCard = document.querySelector(`#addressesSelection .address-card[onclick*="selectAddress('${addressId}')"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
}

function selectedCheckoutStore() {
    return checkoutStores.find((store) => getStoreId(store) === selectedStoreId);
}

function updateOrderSummary() {
    const deliveryFee = getDeliveryFee(selectedCheckoutStore());
    const subtotal = cart.getTotal();
    const total = subtotal + deliveryFee;
    const feeEl = document.getElementById('summaryDeliveryFee');
    const totalEl = document.getElementById('summaryTotal');

    if (feeEl) {
        feeEl.textContent = formatCurrency(deliveryFee);
    }
    if (totalEl) {
        totalEl.textContent = formatCurrency(total);
    }
}

async function placeOrder() {
    if (!selectedStoreId) {
        showToast('Please select a store', 'warning');
        return;
    }

    if (!selectedAddressId) {
        showToast('Please select a delivery address', 'warning');
        return;
    }

    const store = selectedCheckoutStore();
    const deliveryFee = getDeliveryFee(store);
    const orderData = {
        storeId: selectedStoreId,
        addressId: selectedAddressId,
        paymentMethod: document.getElementById('paymentMethod').value,
        paymentType: 'order',
        buyerType: authService.getBuyerType(),
        distributorCode: authService.getDistributorCode() || undefined,
        deliveryFee,
        items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
        })),
        notes: '',
    };

    try {
        showLoading();

        const response = await api.post('/orders', orderData);

        if (response.success) {
            cart.clear();
            selectedStoreId = null;
            selectedAddressId = null;

            if (orderData.paymentMethod === 'payfast') {
                showToast('Connecting to PayFast Secure Checkout...', 'info');
                try {
                    const payfastInit = await api.post('/payments/payfast/initialize', {
                        orderId: response.data.order._id,
                        returnUrl: `${window.location.origin}/customer-panel/#orders`,
                        cancelUrl: `${window.location.origin}/customer-panel/#orders`,
                    });

                    if (payfastInit?.success && payfastInit.data) {
                        const form = document.createElement('form');
                        form.method = 'POST';
                        form.action = payfastInit.data.processUrl;
                        for (const [key, val] of Object.entries(payfastInit.data.fields)) {
                            const input = document.createElement('input');
                            input.type = 'hidden';
                            input.name = key;
                            input.value = val;
                            form.appendChild(input);
                        }
                        document.body.appendChild(form);
                        form.submit();
                        return;
                    }
                } catch (pfErr) {
                    console.error('PayFast redirection error:', pfErr);
                }
            }

            showToast('Order placed successfully!', 'success');
            showModal('Order Placed Successfully', `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
                    <h2>Thank you for your order!</h2>
                    <p>Order Number: <strong>${response.data.order.orderNumber}</strong></p>
                    <p>We'll send you updates on your order status</p>
                    <button class="btn btn-primary" onclick="hideModal(); app.navigateTo('orders')">
                        View Orders
                    </button>
                </div>
            `);
        }

        hideLoading();
    } catch (error) {
        console.error('Error placing order:', error);
        showToast(error.message || 'Error placing order', 'error');
        hideLoading();
    }
}

function showAddAddressModal() {
    showAddressForm();
}
