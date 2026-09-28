// Shop Page
let currentShopPage = 1;
let shopFilters = {
    category: '',
    search: ''
};

async function loadShop() {
    const content = document.getElementById('mainContent');
    
    content.innerHTML = `
        <section class="products-section">
            <div class="container">
                <div class="section-header">
                    <h2>Shop Our Products</h2>
                    <p>Discover our range of health and wellness products</p>
                </div>

                <div class="filters">
                    <div class="search-box">
                        <input type="text" id="shopSearch" placeholder="Search products..." oninput="debounce(filterShop, 500)()">
                    </div>
                    <select id="categoryFilter" onchange="filterShop()">
                        <option value="">All Categories</option>
                    </select>
                </div>

                <div class="products-grid" id="productsGrid">
                    <!-- Products will load here -->
                </div>

                <div id="shopPagination"></div>
            </div>
        </section>
    `;

    await loadCategories();
    await fetchProducts();
}

async function loadCategories() {
    const select = document.getElementById('categoryFilter');
    if (!select) {
        return;
    }

    const categories = [];
    const names = new Set();

    try {
        const response = await api.get('/products/categories/all');
        if (response.success) {
            (response.data.categories || []).forEach((cat) => {
                if (cat?.name && !names.has(cat.name)) {
                    categories.push(cat);
                    names.add(cat.name);
                }
            });
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }

    CONSTANTS.FEATURED_PRODUCTS.forEach((product) => {
        if (product.category && !names.has(product.category)) {
            categories.push({ name: product.category, count: 0 });
            names.add(product.category);
        }
    });

    CONSTANTS.PRODUCT_CATEGORIES.forEach((name) => {
        if (!names.has(name)) {
            categories.push({ name, count: 0 });
            names.add(name);
        }
    });

    categories.forEach((cat) => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.count ? `${cat.name} (${cat.count})` : cat.name;
        select.appendChild(option);
    });
}

async function fetchProducts() {
    showLoading();

    let apiProducts = [];
    try {
        const response = await api.get('/customers/products', {
            page: 1,
            limit: 100,
        });
        if (response.success) {
            apiProducts = Array.isArray(response.data) ? response.data : response.data?.products || [];
        }
    } catch (error) {
        console.error('Error fetching products:', error);
    }

    const catalog = mergeCatalogProducts(apiProducts);
    const search = (shopFilters.search || '').trim().toLowerCase();
    const category = shopFilters.category || '';
    const filtered = catalog.filter((product) => {
        const matchesCategory = !category || product.category === category;
        const matchesSearch = !search || `${product.name} ${product.category} ${product.size || ''}`.toLowerCase().includes(search);
        return matchesCategory && matchesSearch;
    });

    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentShopPage > totalPages) {
        currentShopPage = totalPages;
    }
    const start = (currentShopPage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    renderProducts(pageItems, {
        page: currentShopPage,
        totalPages,
        hasNextPage: currentShopPage < totalPages,
        hasPrevPage: currentShopPage > 1,
    });

    hideLoading();
}

function renderProducts(products, pagination) {
    const grid = document.getElementById('productsGrid');
    
    if (!products || products.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">No products found</div>';
        document.getElementById('shopPagination').innerHTML = '';
        return;
    }

    grid.innerHTML = products.map(product => `
        <div class="product-card" onclick="viewProductDetail('${product._id}')">
            <img src="${getCatalogProductImage(product)}" alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-category">${product.category || ''}</div>
                <h3 class="product-name">${product.name}</h3>
                ${product.size ? `<p class="store-location">${product.size}</p>` : ''}
                <div class="product-price">${formatCurrency(product.basePrice)}</div>
                <div class="product-actions">
                    <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart('${product._id}')">
                        Add to Cart
                    </button>
                    <button class="btn-view" onclick="event.stopPropagation(); viewProductDetail('${product._id}')">
                        View
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    const paginationContainer = document.getElementById('shopPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeShopPage');
}

function filterShop() {
    shopFilters.category = document.getElementById('categoryFilter').value;
    shopFilters.search = document.getElementById('shopSearch').value;
    currentShopPage = 1;
    fetchProducts();
}

function changeShopPage(page) {
    currentShopPage = page;
    fetchProducts();
    window.scrollTo(0, 0);
}

function getLocalCatalogProduct(productId) {
    return CONSTANTS.FEATURED_PRODUCTS.find((product) =>
        product.catalogId === productId || namesMatchProduct(product.name, productId)
    );
}

function showCatalogProductModal(product) {
    const imageUrl = getCatalogProductImage(product);
    window.currentProduct = {
        _id: product._id || product.catalogId,
        name: product.name,
        basePrice: product.basePrice,
        category: product.category,
        imageUrl,
        description: product.description || `${product.name}${product.size ? ` — ${product.size}` : ''}`,
    };

    showModal('Product Details', `
        <div class="product-detail">
            <div>
                <img src="${imageUrl}" alt="${product.name}" class="product-detail-image">
            </div>
            <div class="product-detail-info">
                <h2>${product.name}</h2>
                <div class="product-detail-price">${formatCurrency(product.basePrice)}</div>
                <div class="product-category">Category: ${product.category || ''}</div>
                <div class="product-detail-description">
                    ${window.currentProduct.description}
                </div>
                <div class="quantity-selector">
                    <label>Quantity:</label>
                    <div class="quantity-controls">
                        <button onclick="changeProductQuantity(-1)">-</button>
                        <input type="number" id="productQuantity" value="1" min="1" readonly>
                        <button onclick="changeProductQuantity(1)">+</button>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" onclick="addToCartWithQuantity('${window.currentProduct._id}')">
                    Add to Cart
                </button>
            </div>
        </div>
    `);
}

async function viewProductDetail(productId) {
    const catalog = getLocalCatalogProduct(productId);
    if (catalog && String(productId).startsWith('featured-')) {
        showCatalogProductModal(catalog);
        return;
    }

    try {
        showLoading();
        const response = await api.get(`/customers/products/${productId}`);
        
        if (response.success) {
            const product = response.data.product;
            product.imageUrl = getCatalogProductImage(product);
            window.currentProduct = product;

            showModal('Product Details', `
                <div class="product-detail">
                    <div>
                        <img src="${product.imageUrl}" alt="${product.name}" class="product-detail-image">
                    </div>
                    <div class="product-detail-info">
                        <h2>${product.name}</h2>
                        <div class="product-detail-price">${formatCurrency(product.basePrice)}</div>
                        <div class="product-category">Category: ${product.category}</div>
                        <div class="product-detail-description">
                            ${product.description || 'No description available'}
                        </div>
                        
                        <div class="quantity-selector">
                            <label>Quantity:</label>
                            <div class="quantity-controls">
                                <button onclick="changeProductQuantity(-1)">-</button>
                                <input type="number" id="productQuantity" value="1" min="1" readonly>
                                <button onclick="changeProductQuantity(1)">+</button>
                            </div>
                        </div>

                        <button class="btn btn-primary btn-block" onclick="addToCartWithQuantity('${product._id}')">
                            Add to Cart
                        </button>

                        ${response.data.availableStores && response.data.availableStores.length > 0 ? `
                            <div style="margin-top: 20px;">
                                <h4>Available at:</h4>
                                ${response.data.availableStores.map(store => `
                                    <div style="padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-top: 10px;">
                                        <strong>${store.storeId.name}</strong><br>
                                        ${store.storeId.address?.city}, ${store.storeId.address?.state}<br>
                                        Price: ${formatCurrency(store.storePrice)} | Stock: ${store.stock}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `);
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        if (catalog) {
            showCatalogProductModal(catalog);
            return;
        }
        console.error('Error viewing product:', error);
        showToast('Error loading product details', 'error');
    }
}

function changeProductQuantity(delta) {
    const input = document.getElementById('productQuantity');
    const currentValue = parseInt(input.value);
    const newValue = Math.max(1, currentValue + delta);
    input.value = newValue;
}

function addToCart(productId) {
    const catalog = getLocalCatalogProduct(productId);
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

    if (window.currentProduct && window.currentProduct._id === productId) {
        cart.addItem({
            ...window.currentProduct,
            imageUrl: getCatalogProductImage(window.currentProduct),
        }, 1);
        return;
    }

    fetchProductAndAddToCart(productId, 1);
}

function addToCartWithQuantity(productId) {
    const quantity = parseInt(document.getElementById('productQuantity')?.value || '1', 10) || 1;

    if (window.currentProduct && window.currentProduct._id === productId) {
        cart.addItem({
            ...window.currentProduct,
            imageUrl: getCatalogProductImage(window.currentProduct),
        }, quantity);
        hideModal();
        return;
    }

    fetchProductAndAddToCart(productId, quantity);
    hideModal();
}

async function fetchProductAndAddToCart(productId, quantity) {
    const catalog = getLocalCatalogProduct(productId);
    if (catalog && String(productId).startsWith('featured-')) {
        cart.addItem({
            _id: catalog.catalogId,
            name: catalog.name,
            basePrice: catalog.basePrice,
            imageUrl: catalog.imageUrl,
            category: catalog.category,
        }, quantity);
        return;
    }

    try {
        const response = await api.get(`/customers/products/${productId}`);
        
        if (response.success) {
            const product = response.data.product;
            product.imageUrl = getCatalogProductImage(product);
            cart.addItem(product, quantity);
        }
    } catch (error) {
        if (catalog) {
            cart.addItem({
                _id: catalog.catalogId,
                name: catalog.name,
                basePrice: catalog.basePrice,
                imageUrl: catalog.imageUrl,
                category: catalog.category,
            }, quantity);
            return;
        }
        console.error('Error adding to cart:', error);
        showToast('Error adding to cart', 'error');
    }
}