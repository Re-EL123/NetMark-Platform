// Drivers Management Page
let currentDriversPage = 1;

async function loadDrivers() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Drivers Management</h3>
            </div>
            <div class="card-body">
                <div class="d-flex justify-between align-center mb-20">
                    <div class="d-flex gap-10">
                        <select id="driverStatusFilter" onchange="filterDrivers()">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="suspended">Suspended</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <select id="availabilityFilter" onchange="filterDrivers()">
                            <option value="">All Availability</option>
                            <option value="available">Available</option>
                            <option value="busy">Busy</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>
                    <input type="text" id="driverSearch" placeholder="Search drivers..." 
                           oninput="debounce(filterDrivers, 500)()" style="max-width: 300px;">
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Driver</th>
                                <th>Phone</th>
                                <th>Vehicle</th>
                                <th>License</th>
                                <th>Status</th>
                                <th>Availability</th>
                                <th>Deliveries</th>
                                <th>Earnings</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="driversTableBody">
                            <tr><td colspan="9" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="driversPagination"></div>
            </div>
        </div>
    `;

    await fetchDrivers();
}

async function fetchDrivers() {
    try {
        showLoading();
        
        const status = document.getElementById('driverStatusFilter')?.value || '';
        const availability = document.getElementById('availabilityFilter')?.value || '';
        const search = document.getElementById('driverSearch')?.value || '';

        const params = {
            page: currentDriversPage,
            limit: 20,
            status,
            availability,
            search
        };

        const response = await api.get('/admin/drivers', params);
        
        if (response.success) {
            renderDrivers(response.data, response.pagination);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching drivers:', error);
        showToast('Error loading drivers', 'error');
        hideLoading();
    }
}

function renderDrivers(drivers, pagination) {
    const tbody = document.getElementById('driversTableBody');
    
    if (drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No drivers found</td></tr>';
        return;
    }

    tbody.innerHTML = drivers.map(driver => `
        <tr>
            <td>
                <div class="d-flex align-center gap-10">
                    <img src="${driver.userId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.userId?.name || 'Driver')}`}" 
                         alt="${driver.userId?.name}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <span>${driver.userId?.name || 'N/A'}</span>
                </div>
            </td>
            <td>${driver.userId?.phone || 'N/A'}</td>
            <td>${driver.vehicleType} - ${driver.vehicleNumber}</td>
            <td>${driver.licenseNumber}</td>
            <td><span class="badge ${getStatusBadgeClass(driver.status)}">${driver.status}</span></td>
            <td><span class="badge ${getStatusBadgeClass(driver.availability)}">${driver.availability}</span></td>
            <td>${driver.stats?.completedDeliveries || 0}</td>
            <td>${formatCurrency(driver.stats?.totalEarnings || 0)}</td>
            <td>
                ${driver.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="approveDriver('${driver._id}', 'approved')">Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="approveDriver('${driver._id}', 'rejected')">Reject</button>
                ` : `
                    <button class="btn btn-sm btn-primary" onclick="viewDriver('${driver._id}')">View</button>
                `}
            </td>
        </tr>
    `).join('');

    const paginationContainer = document.getElementById('driversPagination');
    paginationContainer.innerHTML = renderPagination(pagination, 'changeDriversPage');
}

function filterDrivers() {
    currentDriversPage = 1;
    fetchDrivers();
}

function changeDriversPage(page) {
    currentDriversPage = page;
    fetchDrivers();
}

async function approveDriver(driverId, status) {
    const message = status === 'approved' 
        ? 'Are you sure you want to approve this driver?' 
        : 'Are you sure you want to reject this driver?';

    if (!window.confirm(message)) return;

    try {
        showLoading();
        
        const data = { status };
        if (status === 'rejected') {
            data.reason = prompt('Enter rejection reason:');
            if (!data.reason) {
                hideLoading();
                return;
            }
        }

        const response = await api.put(`/admin/drivers/${driverId}/approve`, data);
        
        if (response.success) {
            showToast(`Driver ${status} successfully`, 'success');
            fetchDrivers();
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error approving driver:', error);
        showToast(error.message || 'Error processing request', 'error');
        hideLoading();
    }
}

async function viewDriver(driverId) {
    try {
        showLoading();
        const response = await api.get(`/admin/drivers/${driverId}`);
        
        if (response.success) {
            const driver = response.data;
            
            showModal('Driver Details', `
                <div style="display: grid; gap: 15px;">
                    <div><strong>Name:</strong> ${driver.userId?.name}</div>
                    <div><strong>Email:</strong> ${driver.userId?.email}</div>
                    <div><strong>Phone:</strong> ${driver.userId?.phone}</div>
                    <div><strong>Vehicle Type:</strong> ${driver.vehicleType}</div>
                    <div><strong>Vehicle Number:</strong> ${driver.vehicleNumber}</div>
                    <div><strong>License Number:</strong> ${driver.licenseNumber}</div>
                    <div><strong>License Expiry:</strong> ${formatDate(driver.licenseExpiry)}</div>
                    <div><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(driver.status)}">${driver.status}</span></div>
                    <div><strong>Availability:</strong> <span class="badge ${getStatusBadgeClass(driver.availability)}">${driver.availability}</span></div>
                    
                    <hr>
                    
                    <h4>Statistics</h4>
                    <div><strong>Total Deliveries:</strong> ${driver.stats?.totalDeliveries || 0}</div>
                    <div><strong>Completed Deliveries:</strong> ${driver.stats?.completedDeliveries || 0}</div>
                    <div><strong>Total Earnings:</strong> ${formatCurrency(driver.stats?.totalEarnings || 0)}</div>
                    <div><strong>Pending Payout:</strong> ${formatCurrency(driver.stats?.pendingPayout || 0)}</div>
                    <div><strong>Average Rating:</strong> ${driver.stats?.averageRating || 0} ⭐</div>
                    
                    ${driver.bankDetails ? `
                        <hr>
                        <h4>Bank Details</h4>
                        <div><strong>Account Name:</strong> ${driver.bankDetails.accountName}</div>
                        <div><strong>Account Number:</strong> ${driver.bankDetails.accountNumber}</div>
                        <div><strong>Bank Name:</strong> ${driver.bankDetails.bankName}</div>
                    ` : ''}
                </div>
            `);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error viewing driver:', error);
        showToast('Error loading driver details', 'error');
        hideLoading();
    }
}