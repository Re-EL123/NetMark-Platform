async function loadHome() {
    const content = document.getElementById('mainContent');
    
    content.innerHTML = `
        <section class="hero hero-animated">
            <div class="login-bg" aria-hidden="true">
                <img src="img/green-world-logo.png" alt="" class="login-bg-logo login-bg-logo-1">
                <img src="img/green-world-logo.png" alt="" class="login-bg-logo login-bg-logo-2">
                <img src="img/green-world-logo.png" alt="" class="login-bg-logo login-bg-logo-3">
                <img src="img/green-world-logo.png" alt="" class="login-bg-logo login-bg-logo-4">
            </div>
            <div class="container hero-content">
                <h1>Welcome to Green World</h1>
                <p>Your trusted partner for health and wellness products</p>
                <button class="btn btn-primary btn-lg" onclick="app.navigateTo('shop')">
                    Start Shopping
                </button>
            </div>
        </section>

        <section class="products-section">
            <div class="container">
                <div class="section-header">
                    <h2>Featured Products</h2>
                </div>
                <div class="products-grid" id="featuredProducts">
                    <!-- Products will load here -->
                </div>
            </div>
        </section>

        <section class="products-section" style="background: #f5f5f5;">
            <div class="container">
                <div class="section-header">
                    <h2>Our Stores</h2>
                </div>
                <div class="stores-grid" id="featuredStores">
                    <!-- Stores will load here -->
                </div>
            </div>
        </section>
    `;

    await loadFeaturedProducts();
    await loadFeaturedStores();
}

async function loadFeaturedProducts() {
    const grid = document.getElementById('featuredProducts');
    if (!grid) {
        return;
    }

    let apiProducts = [];
    try {
        const response = await api.get('/products', { featured: true, limit: 8 });
        if (response.success) {
            apiProducts = Array.isArray(response.data) ? response.data : response.data?.products || [];
        }
    } catch (error) {
        console.error('Error loading featured products:', error);
    }

    const products = CONSTANTS.FEATURED_PRODUCTS.map((featured) => {
        const match = apiProducts.find((product) => {
            const name = (product.name || '').toLowerCase();
            return name.includes(featured.name.toLowerCase()) || featured.name.toLowerCase().includes(name);
        });
        return {
            ...featured,
            _id: match?._id || featured.catalogId,
            basePrice: match?.basePrice || featured.basePrice,
            category: match?.category || featured.category,
            imageUrl: featured.imageUrl,
            fromCatalog: !match?._id,
        };
    });

    grid.innerHTML = products.map((product) => `
        <div class="product-card" onclick="viewFeaturedProduct('${product._id}')">
            <img src="${product.imageUrl}" alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-category">${product.category}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="store-location">${product.size || ''}</p>
                <div class="product-price">${formatCurrency(product.basePrice)}</div>
                <div class="product-actions">
                    <button class="btn-add-cart" onclick="event.stopPropagation(); addFeaturedToCart('${product._id}')">
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getFeaturedProduct(productId) {
    return CONSTANTS.FEATURED_PRODUCTS.find((product) =>
        product.catalogId === productId || product.name === productId
    );
}

async function viewFeaturedProduct(productId) {
    const catalog = getFeaturedProduct(productId);
    if (catalog && String(productId).startsWith('featured-')) {
        window.currentProduct = {
            _id: catalog.catalogId,
            name: catalog.name,
            basePrice: catalog.basePrice,
            category: catalog.category,
            imageUrl: catalog.imageUrl,
            description: `${catalog.name} — ${catalog.size}. Official Green World product.`,
        };
        showModal('Product Details', `
            <div class="product-detail">
                <div>
                    <img src="${catalog.imageUrl}" alt="${catalog.name}" class="product-detail-image">
                </div>
                <div class="product-detail-info">
                    <h2>${catalog.name}</h2>
                    <div class="product-detail-price">${formatCurrency(catalog.basePrice)}</div>
                    <div class="product-category">Category: ${catalog.category}</div>
                    <div class="product-detail-description">${catalog.size}</div>
                    <div class="quantity-selector">
                        <label>Quantity:</label>
                        <div class="quantity-controls">
                            <button onclick="changeProductQuantity(-1)">-</button>
                            <input type="number" id="productQuantity" value="1" min="1" readonly>
                            <button onclick="changeProductQuantity(1)">+</button>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="addToCartWithQuantity('${catalog.catalogId}')">
                        Add to Cart
                    </button>
                </div>
            </div>
        `);
        return;
    }

    await viewProductDetail(productId);
}

function addFeaturedToCart(productId) {
    const catalog = getFeaturedProduct(productId);
    if (catalog && String(productId).startsWith('featured-')) {
        cart.addItem({
            _id: catalog.catalogId,
            name: catalog.name,
            basePrice: catalog.basePrice,
            imageUrl: catalog.imageUrl,
            category: catalog.category,
        }, 1);
        return;
    }
    addToCart(productId);
}

async function loadFeaturedStores() {
    try {
        const response = await api.get('/customers/stores', { limit: 6 });
        
        if (response.success) {
            const grid = document.getElementById('featuredStores');
            const stores = Array.isArray(response.data) ? response.data : response.data?.stores || [];
            grid.innerHTML = stores.map(store => `
                <div class="store-card">
                    <img src="${getStoreImage(store)}" alt="${store.name}" class="store-logo" onerror="this.onerror=null;this.src='img/green-world-logo.png'">
                    <h3 class="store-name">${store.name}</h3>
                    <p class="store-location">${store.address?.city || ''}, ${store.address?.state || ''}</p>
                    <button class="btn btn-outline" onclick="viewStoreBySlug('${getStoreSlug(store)}')">Visit Store</button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

