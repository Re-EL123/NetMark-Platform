// Reports Page
async function loadReports() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Generate Reports</h3>
            </div>
            <div class="card-body">
                <div class="quick-actions">
                    <div class="quick-action-btn" onclick="showReportModal('distributor_purchases')">
                        <i data-feather="briefcase" class="quick-icon"></i>
                        <span>Distributor Purchases</span>
                    </div>
                    <div class="quick-action-btn" onclick="showReportModal('store_sales')">
                        <i data-feather="shopping-bag" class="quick-icon"></i>
                        <span>Store Sales</span>
                    </div>
                    <div class="quick-action-btn" onclick="showReportModal('driver_earnings')">
                        <i data-feather="truck" class="quick-icon"></i>
                        <span>Driver Earnings</span>
                    </div>
                    <div class="quick-action-btn" onclick="showReportModal('subscriptions')">
                        <i data-feather="credit-card" class="quick-icon"></i>
                        <span>Subscriptions</span>
                    </div>
                    <div class="quick-action-btn" onclick="showReportModal('appointments')">
                        <i data-feather="calendar" class="quick-icon"></i>
                        <span>Appointments</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Recent Reports</h3>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Report Type</th>
                                <th>Period</th>
                                <th>Format</th>
                                <th>Status</th>
                                <th>Generated</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="reportsTableBody">
                            <tr><td colspan="6" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    await fetchReports();
    if (window.feather) feather.replace();
}

async function fetchReports() {
    try {
        showLoading();
        const response = await api.get('/reports/my/all');
        
        if (response.success) {
            renderReports(response.data.reports);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching reports:', error);
        showToast('Error loading reports', 'error');
        hideLoading();
    }
}

function renderReports(reports) {
    const tbody = document.getElementById('reportsTableBody');
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No reports generated yet</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => `
        <tr>
            <td><span class="badge badge-info">${report.reportType}</span></td>
            <td>${formatDate(report.startDate)} - ${formatDate(report.endDate)}</td>
            <td>${report.fileFormat.toUpperCase()}</td>
            <td><span class="badge ${getStatusBadgeClass(report.status)}">${report.status}</span></td>
            <td>${formatDate(report.createdAt, 'datetime')}</td>
            <td>
                ${report.status === 'completed' ? `
                    <button class="btn btn-sm btn-primary" onclick="downloadReport('${report._id}')">Download</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function showReportModal(reportType) {
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    showModal(`Generate ${reportType.replace('_', ' ')} Report`, `
        <form id="generateReportForm" onsubmit="handleGenerateReport(event, '${reportType}')">
            <div class="form-group">
                <label>Start Date *</label>
                <input type="date" id="startDate" value="${lastMonth}" required>
            </div>
            <div class="form-group">
                <label>End Date *</label>
                <input type="date" id="endDate" value="${today}" required>
            </div>
            <div class="form-group">
                <label>Format *</label>
                <select id="reportFormat" required>
                    <option value="excel">Excel (.xlsx)</option>
                    <option value="csv">CSV</option>
                    <option value="pdf">PDF</option>
                </select>
            </div>
            ${reportType === 'distributor_purchases' ? `
                <div class="form-group">
                    <label>Distributor Code (Optional)</label>
                    <input type="text" id="distributorCode">
                </div>
            ` : ''}
            ${reportType === 'store_sales' || reportType === 'appointments' ? `
                <div class="form-group">
                    <label>Store ID (Optional)</label>
                    <input type="text" id="storeId">
                </div>
            ` : ''}
            ${reportType === 'driver_earnings' ? `
                <div class="form-group">
                    <label>Driver ID (Optional)</label>
                    <input type="text" id="driverId">
                </div>
                <div class="form-group">
                    <label>Payout Status</label>
                    <select id="payoutStatus">
                        <option value="">All</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                    </select>
                </div>
            ` : ''}
            <div class="form-group">
                <button type="submit" class="btn btn-primary">Generate Report</button>
                <button type="button" class="btn btn-outline" onclick="hideModal()">Cancel</button>
            </div>
        </form>
    `);
}

async function handleGenerateReport(event, reportType) {
    event.preventDefault();
    
    const data = {
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        format: document.getElementById('reportFormat').value,
    };

    // Add optional filters
    const distributorCode = document.getElementById('distributorCode')?.value;
    const storeId = document.getElementById('storeId')?.value;
    const driverId = document.getElementById('driverId')?.value;
    const payoutStatus = document.getElementById('payoutStatus')?.value;

    if (distributorCode) data.distributorCode = distributorCode;
    if (storeId) data.storeId = storeId;
    if (driverId) data.driverId = driverId;
    if (payoutStatus) data.payoutStatus = payoutStatus;

    try {
        showLoading();
        
        const endpoint = `/reports/${reportType.replace('_', '-')}`;
        const response = await api.post(endpoint, data);
        
        if (response.success) {
            showToast('Report generation started. Please check back in a moment.', 'success');
            hideModal();
            setTimeout(fetchReports, 2000);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error generating report:', error);
        showToast(error.message || 'Error generating report', 'error');
        hideLoading();
    }
}

async function downloadReport(reportId) {
    try {
        window.open(`${API_CONFIG.baseURL}/reports/${reportId}/download`, '_blank');
        showToast('Report download started', 'success');
    } catch (error) {
        console.error('Error downloading report:', error);
        showToast('Error downloading report', 'error');
    }
}