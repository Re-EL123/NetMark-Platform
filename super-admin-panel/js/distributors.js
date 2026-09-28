// Distributors Management Page
let currentDistributorsPage = 1;

async function loadDistributors() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Distributor Codes Management</h3>
                <div class="d-flex gap-10">
                    <button class="btn btn-primary" onclick="showUploadCodesModal()">
                        <i data-feather="upload" class="btn-icon"></i> Upload Codes
                    </button>
                    <button class="btn btn-secondary" onclick="showAddCodeModal()">
                        <i data-feather="plus-circle" class="btn-icon"></i> Add Single Code
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="codeStatusFilter" onchange="filterCodes()">
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <select id="codeUsedFilter" onchange="filterCodes()">
                            <option value="">All Codes</option>
                            <option value="false">Unused</option>
                            <option value="true">Used</option>
                        </select>
                    </div>
                    <input type="text" id="codeSearch" placeholder="Search codes..." 
                           oninput="debounce(filterCodes, 500)()" style="max-width: 300px;">
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Distributor Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Used</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="codesTableBody">
                            <tr><td colspan="8" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="codesPagination"></div>
            </div>
        </div>
    `;

    await fetchDistributorCodes();
}

async function fetchDistributorCodes() {
    try {
        showLoading();
        
        const statusFilter = document.getElementById('codeStatusFilter')?.value || '';
        const usedFilter = document.getElementById('codeUsedFilter')?.value || '';
        const search = document.getElementById('codeSearch')?.value || '';

        const params = {
            page: currentDistributorsPage,
            limit: 20,
            status: statusFilter,
            isUsed: usedFilter,
            search: search
        };

        const response = await api.get('/admin/distributor-codes', params);
        
        if (response.success) {
            renderDistributorCodes(response.data, response.pagination);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching codes:', error);
        showToast('Error loading distributor codes', 'error');
        hideLoading();
    }
}

function renderDistributorCodes(codes, pagination) {
    const tbody = document.getElementById('codesTableBody');
    
    if (codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No codes found</td></tr>';
        return;
    }

    tbody.innerHTML = codes.map(code => `
        <tr>
            <td><strong>${code.code}</strong></td>
            <td>${code.distributorName || '-'}</td>
            <td>${code.distributorEmail || '-'}</td>
            <td>${code.distributorPhone || '-'}</td>
            <td><span class="badge ${getStatusBadgeClass(code.status)}">${code.status}</span></td>
            <td><span class="badge ${code.isUsed ? 'badge-danger' : 'badge-success'}">${code.isUsed ? 'Used' : 'Available'}</span></td>
            <td>${formatDate(code.createdAt)}</td>
            <td>
                ${!code.isUsed ? `
                    <button class="btn btn-sm btn-danger" onclick="deactivateCode('${code._id}')">Deactivate</button>
                ` : `
                    <button class="btn btn-sm btn-primary" onclick="viewCodeUser('${code.assignedTo}')">View User</button>
                `}
            </td>
        </tr>
    `).join('');

    // Render pagination
    const paginationContainer = document.getElementById('codesPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeDistributorsPage');
}

function filterCodes() {
    currentDistributorsPage = 1;
    fetchDistributorCodes();
}

function changeDistributorsPage(page) {
    currentDistributorsPage = page;
    fetchDistributorCodes();
}

function showUploadCodesModal() {
    showModal('Upload Distributor Codes', `
        <form id="uploadCodesForm" onsubmit="handleUploadCodes(event)">
            <div class="form-group">
                <label>CSV File</label>
                <input type="file" id="codesFile" accept=".csv" required>
                <small>CSV format: code,name,email,phone</small>
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Upload</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleUploadCodes(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('codesFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }

    try {
        showLoading();
        
        const response = await api.upload('/admin/distributor-codes/upload', file);
        
        if (response.success) {
            showToast(`Successfully uploaded ${response.data.uploaded} codes`, 'success');
            hideModal();
            fetchDistributorCodes();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error uploading codes:', error);
        showToast(error.message || 'Error uploading codes', 'error');
        hideLoading();
    }
}

function showAddCodeModal() {
    showModal('Add Distributor Code', `
        <form id="addCodeForm" onsubmit="handleAddCode(event)">
            <div class="form-group">
                <label>Code *</label>
                <input type="text" id="codeInput" required>
            </div>
            <div class="form-group">
                <label>Distributor Name</label>
                <input type="text" id="nameInput">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="emailInput">
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="text" id="phoneInput">
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Create Code</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleAddCode(event) {
    event.preventDefault();
    
    const data = {
        code: document.getElementById('codeInput').value.toUpperCase(),
        distributorName: document.getElementById('nameInput').value,
        distributorEmail: document.getElementById('emailInput').value,
        distributorPhone: document.getElementById('phoneInput').value,
    };

    try {
        showLoading();
        
        const response = await api.post('/admin/distributor-codes', data);
        
        if (response.success) {
            showToast('Distributor code created successfully', 'success');
            hideModal();
            fetchDistributorCodes();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error creating code:', error);
        showToast(error.message || 'Error creating code', 'error');
        hideLoading();
    }
}

async function deactivateCode(codeId) {
    if (!confirm('Are you sure you want to deactivate this code?')) return;

    try {
        showLoading();
        
        const response = await api.put(`/admin/distributor-codes/${codeId}`, {
            status: 'inactive'
        });
        
        if (response.success) {
            showToast('Code deactivated successfully', 'success');
            fetchDistributorCodes();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error deactivating code:', error);
        showToast('Error deactivating code', 'error');
        hideLoading();
    }
}

async function viewCodeUser(userId) {
    if (userId) {
        viewUser(userId);
    }
}