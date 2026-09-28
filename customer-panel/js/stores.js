let storeSearchQuery = '';

async function loadStores() {
    const content = document.getElementById('mainContent');

    content.innerHTML = `
        <section class="products-section">
            <div class="container">
                <div class="section-header">
                    <h2>Our Stores</h2>
                    <p>Browse verified GreenWorld distributor stores and shop from a store near you.</p>
                </div>

                <div class="filters">
                    <div class="search-box">
                        <input type="text" id="storeSearch" placeholder="Search stores..." oninput="debounce(filterStores, 400)()">
                    </div>
                </div>

                <div class="stores-grid" id="storesGrid"></div>
            </div>
        </section>
    `;

    await fetchStores();
}

async function fetchStores() {
    try {
        showLoading();
        const response = await api.get('/customers/stores', { limit: 50 });

        if (response && response.success) {
            const stores = unwrapList(response.data, 'stores');
            window.currentStoresList = stores;
            renderStores(stores);
        } else {
            showToast(response?.message || 'Error loading stores', 'error');
        }

        hideLoading();
    } catch (error) {
        console.error('Error fetching stores:', error);
        showToast('Error loading stores', 'error');
        hideLoading();
    }
}

function unwrapList(data, key) {
    if (Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data?.[key])) {
        return data[key];
    }
    return [];
}

function renderStores(stores) {
    const grid = document.getElementById('storesGrid');
    if (!grid) {
        return;
    }

    const filteredStores = stores.filter((store) => {
        const query = storeSearchQuery.trim().toLowerCase();
        if (!query) {
            return true;
        }

        return `${store.name || ''} ${store.address?.city || ''} ${store.address?.state || ''} ${getStoreSlug(store)}`
            .toLowerCase()
            .includes(query);
    });

    if (filteredStores.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">No stores found</div>';
        return;
    }

    grid.innerHTML = filteredStores.map((store) => storeCardHtml(store)).join('');
}

function storeCardHtml(store) {
    const open = isStoreOpen(store);
    const location = [store.address?.city, store.address?.state].filter(Boolean).join(', ') || 'South Africa';

    return `
        <div class="store-card">
            <img src="${getStoreImage(store)}" alt="${store.name}" class="store-logo" onerror="this.onerror=null;this.src='img/green-world-logo.png'">
            <h3 class="store-name">${store.name}</h3>
            <p class="store-location">${location}</p>
            <p class="store-description">${store.description || 'Discover GreenWorld products and wellness appointments from this store.'}</p>
            ${open
                ? `<button class="btn btn-outline" onclick="viewStoreBySlug('${getStoreSlug(store)}')">Visit Store</button>`
                : '<span class="badge badge-danger">Currently unavailable</span>'}
        </div>
    `;
}

function filterStores() {
    storeSearchQuery = document.getElementById('storeSearch')?.value || '';
    renderStores(window.currentStoresList || []);
}

function viewStore(storeOrId) {
    if (typeof storeOrId === 'object' && storeOrId) {
        viewStoreBySlug(getStoreSlug(storeOrId));
        return;
    }
    viewStoreBySlug(storeOrId);
}

function viewStoreBySlug(slug) {
    if (!slug) {
        showToast('Store page is not available', 'error');
        return;
    }
    app.navigateTo('store', slug);
}

async function loadStorePage(slug) {
    const content = document.getElementById('mainContent');
    content.innerHTML = `
        <section class="products-section">
            <div class="container">
                <div id="storePageContent">
                    <p class="text-center">Loading store...</p>
                </div>
            </div>
        </section>
    `;

    if (!slug) {
        content.querySelector('#storePageContent').innerHTML = '<p class="text-center">Store not found.</p>';
        return;
    }

    try {
        showLoading();
        const store = await fetchStoreBySlug(slug);

        if (!store) {
            document.getElementById('storePageContent').innerHTML = `
                <div class="content-card text-center">
                    <h2>Store not found</h2>
                    <p>This store page is unavailable or no longer active.</p>
                    <button class="btn btn-primary" onclick="app.navigateTo('stores')">Browse stores</button>
                </div>
            `;
            hideLoading();
            return;
        }

        const products = await fetchStoreProducts(store);
        renderStorePage(store, products);
        hideLoading();
    } catch (error) {
        console.error('Error loading store page:', error);
        document.getElementById('storePageContent').innerHTML = `
            <div class="content-card text-center">
                <h2>Unable to load store</h2>
                <p>${error.message || 'Please try again later.'}</p>
                <button class="btn btn-primary" onclick="app.navigateTo('stores')">Browse stores</button>
            </div>
        `;
        hideLoading();
    }
}

async function fetchStoreBySlug(slug) {
    try {
        const response = await api.tryGet([
            `/customers/stores/slug/${encodeURIComponent(slug)}`,
            `/stores/slug/${encodeURIComponent(slug)}`,
            `/customers/stores/${encodeURIComponent(slug)}`,
        ]);
        if (response?.success) {
            return response.data?.store || response.data;
        }
    } catch (error) {
        console.warn('Store slug lookup failed, falling back to store list', error);
    }

    const listResponse = await api.get('/customers/stores', { limit: 100 });
    const stores = unwrapList(listResponse.data, 'stores');
    return stores.find((store) => getStoreSlug(store) === slug || getStoreId(store) === slug) || null;
}

async function fetchStoreProducts(store) {
    const storeId = getStoreId(store);
    try {
        const response = await api.tryGet(
            [
                `/customers/stores/${storeId}/products`,
                `/stores/${storeId}/products`,
                `/customers/products`,
            ],
            { storeId, limit: 24 }
        );
        if (response?.success) {
            return unwrapList(response.data, 'products');
        }
    } catch (error) {
        console.warn('Store products lookup failed', error);
    }
    return [];
}

function renderStorePage(store, products) {
    const open = isStoreOpen(store);
    const location = [store.address?.street, store.address?.city, store.address?.state, store.address?.country]
        .filter(Boolean)
        .join(', ');
    const deliveryFee = getDeliveryFee(store);

    document.getElementById('storePageContent').innerHTML = `
        <div class="storefront-header">
            <img src="${getStoreImage(store)}" alt="${store.name}" class="store-logo" onerror="this.onerror=null;this.src='img/green-world-logo.png'">
            <div>
                <p class="store-location">/store/${getStoreSlug(store)}</p>
                <h1>${store.name}</h1>
                <p>${store.description || 'Shop GreenWorld products and book wellness appointments at this store.'}</p>
                <p class="store-location">${location || 'South Africa'}</p>
                <p>Delivery fee: ${formatCurrency(deliveryFee)}</p>
                ${open ? '' : '<p><span class="badge badge-danger">This store is locked until the yearly subscription is renewed.</span></p>'}
                <div class="d-flex gap-10 mt-20">
                    <button class="btn btn-outline" onclick="app.navigateTo('stores')">All stores</button>
                    ${open ? `<button class="btn btn-primary" onclick="app.navigateTo('appointments')">Book appointment</button>` : ''}
                </div>
            </div>
        </div>

        <div class="section-header" style="text-align: left; margin-top: 40px;">
            <h2>Products</h2>
        </div>
        <div class="products-grid" id="storeProductsGrid">
            ${products.length ? products.map((product) => `
                <div class="product-card" onclick="viewProductDetail('${product._id}')">
                    <img src="${getCatalogProductImage(product)}" alt="${product.name}" class="product-image">
                    <div class="product-info">
                        <div class="product-category">${product.category || ''}</div>
                        <h3 class="product-name">${product.name}</h3>
                        <div class="product-price">${formatCurrency(product.storePrice || product.basePrice)}</div>
                        ${open ? `
                            <div class="product-actions">
                                <button class="btn-add-cart" onclick="event.stopPropagation(); addToCartFromStore('${product._id}', '${getStoreId(store)}')">
                                    Add to Cart
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('') : '<div style="grid-column: 1/-1;">No products listed for this store yet.</div>'}
        </div>
    `;
}

async function addToCartFromStore(productId, storeId) {
    try {
        const response = await api.get(`/customers/products/${productId}`);
        if (response.success) {
            const product = response.data.product || response.data;
            product.storeId = storeId;
            cart.addItem(product, 1);
        }
    } catch (error) {
        console.error('Error adding store product to cart:', error);
        showToast('Error adding to cart', 'error');
    }
}

window.currentStoresList = [];
window.viewStore = viewStore;
window.viewStoreBySlug = viewStoreBySlug;
window.loadStorePage = loadStorePage;
window.addToCartFromStore = addToCartFromStore;
