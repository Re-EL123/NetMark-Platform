// Store Owner - Products Management
async function loadProducts() {
    const pageContent = document.getElementById('pageContent');
    
    // Get current store
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
                <h3 class="card-title">Store Products</h3>
                <div class="d-flex gap-10">
                    <select id="storeSelector" onchange="changeStore()">
                        <!-- Will be populated -->
                    </select>
                    <button class="btn btn-primary" onclick="showAddProductToStoreModal()">
                        <i data-feather="plus-circle"></i> Add Product
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>SKU</th>
                                <th>Store Price</th>
                                <th>Stock</th>
                                <th>Status</th>
                                <th>Sold</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="storeProductsTableBody">
                            <tr><td colspan="7" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    await loadStoreSelector();
    await fetchStoreProducts();
}

async function loadStoreSelector() {
    try {
        const response = await api.get('/stores/my/all');
        
        if (response.success) {
            const select = document.getElementById('storeSelector');
            select.innerHTML = response.data.stores.map(store => `
                <option value="${store._id}" ${store._id === currentStoreId ? 'selected' : ''}>
                    ${store.name}
                </option>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function changeStore() {
    currentStoreId = document.getElementById('storeSelector').value;
    fetchStoreProducts();
}

async function fetchStoreProducts() {
    try {
        showLoading();
        const response = await api.get(`/stores/${currentStoreId}/products`);
        
        if (response.success) {
            renderStoreProducts(response.data.products);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching products:', error);
        showToast('Error loading products', 'error');
        hideLoading();
    }
}

function renderStoreProducts(products) {
    const tbody = document.getElementById('storeProductsTableBody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No products added yet</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(sp => `
        <tr>
            <td>
                <div class="d-flex align-center gap-10">
                    <img src="${sp.productId?.imageUrl || 'https://via.placeholder.com/40'}" 
                         alt="${sp.productId?.name}" 
                         style="width: 40px; height: 40px; border-radius: 5px; object-fit: cover;">
                    <span>${sp.productId?.name}</span>
                </div>
            </td>
            <td>${sp.productId?.sku}</td>
            <td>${formatCurrency(sp.storePrice)}</td>
            <td>
                <span class="badge ${sp.stock > sp.lowStockThreshold ? 'badge-success' : 'badge-warning'}">
                    ${sp.stock}
                </span>
            </td>
            <td>
                <span class="badge ${sp.isActive ? 'badge-success' : 'badge-danger'}">
                    ${sp.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${sp.stats?.totalSold || 0}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editStoreProduct('${sp._id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="removeStoreProduct('${sp.productId._id}')">Remove</button>
            </td>
        </tr>
    `).join('');
}

async function showAddProductToStoreModal() {
    try {
        showLoading();
        const response = await api.get('/products', { limit: 100 });
        
        hideLoading();

        if (response.success) {
            showModal('Add Product to Store', `
                <form id="addProductToStoreForm" onsubmit="handleAddProductToStore(event)">
                    <div class="form-group">
                        <label>Select Product *</label>
                        <select id="productSelect" required>
                            <option value="">Choose a product...</option>
                            ${response.data.map(p => `
                                <option value="${p._id}">${p.name} (${p.sku})</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Store Price *</label>
                        <input type="number" id="storePrice" min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Initial Stock *</label>
                        <input type="number" id="initialStock" min="0" required>
                    </div>
                    <div class="form-group">
                        <label>Custom Description</label>
                        <textarea id="customDescription" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary">Add to Store</button>
                        <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
                    </div>
                </form>
            `);
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Error loading products', 'error');
        hideLoading();
    }
}

async function handleAddProductToStore(event) {
    event.preventDefault();
    
    const data = {
        productId: document.getElementById('productSelect').value,
        storePrice: parseFloat(document.getElementById('storePrice').value),
        stock: parseInt(document.getElementById('initialStock').value),
        customDescription: document.getElementById('customDescription').value,
    };

    try {
        showLoading();
        
        const response = await api.post(`/stores/${currentStoreId}/products`, data);
        
        if (response.success) {
            showToast('Product added to store successfully', 'success');
            hideModal();
            fetchStoreProducts();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error adding product:', error);
        showToast(error.message || 'Error adding product to store', 'error');
        hideLoading();
    }
}

async function editStoreProduct(storeProductId) {
    // Simplified edit - in production, fetch current values first
    const newPrice = prompt('Enter new price:');
    const newStock = prompt('Enter new stock:');

    if (!newPrice && !newStock) return;

    try {
        showLoading();

        const data = {};
        if (newPrice) data.storePrice = parseFloat(newPrice);
        if (newStock) data.stock = parseInt(newStock);

        const response = await api.put(`/stores/${currentStoreId}/products/${storeProductId}`, data);
        
        if (response.success) {
            showToast('Product updated successfully', 'success');
            fetchStoreProducts();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error updating product:', error);
        showToast('Error updating product', 'error');
        hideLoading();
    }
}

async function removeStoreProduct(productId) {
    if (!confirm('Are you sure you want to remove this product from your store?')) return;

    try {
        showLoading();
        
        const response = await api.delete(`/stores/${currentStoreId}/products/${productId}`);
        
        if (response.success) {
            showToast('Product removed from store', 'success');
            fetchStoreProducts();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error removing product:', error);
        showToast('Error removing product', 'error');
        hideLoading();
    }
}