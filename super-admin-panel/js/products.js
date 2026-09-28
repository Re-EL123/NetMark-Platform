// Products Management Page
window.loadProducts = loadProducts;
window.fetchProducts = fetchProducts;
window.renderProducts = renderProducts;
window.filterProducts = filterProducts;
window.changeProductsPage = changeProductsPage;
window.showAddProductModal = showAddProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
let currentProductsPage = 1;

async function loadProducts() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Products Catalog</h3>
                <button class="btn btn-primary" onclick="showAddProductModal()">
                    <i data-feather="plus-circle"></i> Add Product
                </button>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="categoryFilter" onchange="filterProducts()">
                            <option value="">All Categories</option>
                            <!-- Categories will be loaded dynamically -->
                        </select>
                        <select id="productStatusFilter" onchange="filterProducts()">
                            <option value="">All Status</option>
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                        </select>
                    </div>
                    <input type="text" id="productSearch" placeholder="Search products..." 
                           oninput="debounce(filterProducts, 500)()" style="max-width: 300px;">
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>SKU</th>
                                <th>Category</th>
                                <th>Base Price</th>
                                <th>Status</th>
                                <th>Stock Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="productsTableBody">
                            <tr><td colspan="8" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="productsPagination"></div>
            </div>
        </div>
    `;

    await loadCategories();
    await fetchProducts();
}

async function loadCategories() {
    try {
        const response = await api.get('/products/categories/all');
        
        if (response.success) {
            const select = document.getElementById('categoryFilter');
            const categories = response.data.categories;
            
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.name;
                option.textContent = `${cat.name} (${cat.count})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function fetchProducts() {
    try {
        showLoading();
        
        const category = document.getElementById('categoryFilter')?.value || '';
        const isActive = document.getElementById('productStatusFilter')?.value || '';
        const search = document.getElementById('productSearch')?.value || '';

        const params = {
            page: currentProductsPage,
            limit: 20,
            category,
            search
        };

        // Get all products from admin endpoint
        const response = await api.get('/products', params);
        
        if (response.success) {
            renderProducts(response.data, response.pagination);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching products:', error);
        showToast('Error loading products', 'error');
        hideLoading();
    }
}

function renderProducts(products, pagination) {
    const tbody = document.getElementById('productsTableBody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => `
        <tr>
            <td>
                <div class="d-flex align-center gap-10">
                    <img src="${product.imageUrl || 'https://via.placeholder.com/50'}" 
                         alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">
                    <span>${product.name}</span>
                </div>
            </td>
            <td>${product.sku}</td>
            <td><span class="badge badge-secondary">${product.category}</span></td>
            <td>${formatCurrency(product.basePrice)}</td>
            <td><span class="badge ${product.isActive ? 'badge-success' : 'badge-danger'}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
            <td><span class="badge ${getStatusBadgeClass(product.stockStatus)}">${product.stockStatus}</span></td>
            <td>${formatDate(product.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editProduct('${product._id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product._id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('productsPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeProductsPage');
}

function filterProducts() {
    currentProductsPage = 1;
    fetchProducts();
}

function changeProductsPage(page) {
    currentProductsPage = page;
    fetchProducts();
}

function showAddProductModal() {
    showModal('Add Product', `
        <form id="addProductForm" onsubmit="handleAddProduct(event)">
            <div class="form-group">
                <label>Product Name *</label>
                <input type="text" id="productName" required>
            </div>
            <div class="form-group">
                <label>SKU *</label>
                <input type="text" id="productSku" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="productDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label>Category *</label>
                <input type="text" id="productCategory" required>
            </div>
            <div class="form-group">
                <label>Base Price *</label>
                <input type="number" id="productPrice" min="0" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Image URL</label>
                <input type="url" id="productImage">
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Create Product</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleAddProduct(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('productName').value,
        sku: document.getElementById('productSku').value,
        description: document.getElementById('productDescription').value,
        category: document.getElementById('productCategory').value,
        basePrice: parseFloat(document.getElementById('productPrice').value),
        imageUrl: document.getElementById('productImage').value,
    };

    try {
        showLoading();
        
        const response = await api.post('/admin/products', data);
        
        if (response.success) {
            showToast('Product created successfully', 'success');
            hideModal();
            fetchProducts();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error creating product:', error);
        showToast(error.message || 'Error creating product', 'error');
        hideLoading();
    }
}

async function editProduct(productId) {
    // Implementation for editing product
    showToast('Edit functionality coming soon', 'info');
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        showLoading();
        
        const response = await api.delete(`/admin/products/${productId}`);
        
        if (response.success) {
            showToast('Product deleted successfully', 'success');
            fetchProducts();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Error deleting product', 'error');
        hideLoading();
    }
}