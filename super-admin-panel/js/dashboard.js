// Dashboard Page
async function loadDashboard() {
    const pageContent = document.getElementById('pageContent');
    
    pageContent.innerHTML = `
        <div class="dashboard-header">
            <h1>Dashboard</h1>
            <p>Welcome back, ${authService.getCurrentUser()?.name || 'Admin'}</p>
        </div>

        <div class="stats-grid" id="statsGrid">
            <!-- Stats will be loaded here -->
        </div>

        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Quick Actions</h3>
            </div>
            <div class="card-body">
                <div class="quick-actions">
                    <div class="quick-action-btn" onclick="app.navigateTo('distributors')">
                        <i data-feather="briefcase" class="quick-icon"></i>
                        <span>Manage Distributors</span>
                    </div>
                    <div class="quick-action-btn" onclick="app.navigateTo('products')">
                        <i data-feather="package" class="quick-icon"></i>
                        <span>Add Products</span>
                    </div>
                    <div class="quick-action-btn" onclick="app.navigateTo('reports')">
                        <i data-feather="bar-chart-2" class="quick-icon"></i>
                        <span>Generate Reports</span>
                    </div>
                    <div class="quick-action-btn" onclick="app.navigateTo('drivers')">
                        <i data-feather="truck" class="quick-icon"></i>
                        <span>Manage Drivers</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Recent Activity</h3>
            </div>
            <div class="card-body">
                <ul class="activity-list" id="activityList">
                    <!-- Activity will be loaded here -->
                </ul>
            </div>
        </div>
    `;

    await loadDashboardStats();
    await loadRecentActivity();
    if (window.feather) feather.replace();
}

async function loadDashboardStats() {
    try {
        showLoading();
        const response = await api.get('/admin/dashboard');
        
        if (response.success) {
            const stats = response.data.statistics;
            renderStats(stats);
        }
        hideLoading();
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showToast('Error loading dashboard statistics', 'error');
        hideLoading();
    }
}

function renderStats(stats) {
    const statsGrid = document.getElementById('statsGrid');
    
    statsGrid.innerHTML = `
            <div class="stat-card">
            <div class="stat-icon primary"><i data-feather="users"></i></div>
            <div class="stat-details">
                <h3>${stats.totalUsers || 0}</h3>
                <p>Total Users</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon secondary"><i data-feather="briefcase"></i></div>
            <div class="stat-details">
                <h3>${stats.totalDistributors || 0}</h3>
                <p>Distributors</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon warning"><i data-feather="home"></i></div>
            <div class="stat-details">
                <h3>${stats.activeStores || 0}</h3>
                <p>Active Stores</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon danger"><i data-feather="alert-triangle"></i></div>
            <div class="stat-details">
                <h3>${stats.pendingVerifications || 0}</h3>
                <p>Pending Verifications</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon primary"><i data-feather="shopping-cart"></i></div>
            <div class="stat-details">
                <h3>${stats.totalOrders || 0}</h3>
                <p>Total Orders</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon secondary"><i data-feather="dollar-sign"></i></div>
            <div class="stat-details">
                <h3>${formatCurrency(stats.totalRevenue || 0)}</h3>
                <p>Total Revenue</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon warning"><i data-feather="truck"></i></div>
            <div class="stat-details">
                <h3>${stats.totalDrivers || 0}</h3>
                <p>Drivers</p>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-icon primary"><i data-feather="package"></i></div>
            <div class="stat-details">
                <h3>${stats.totalProducts || 0}</h3>
                <p>Products</p>
            </div>
        </div>
    `;
}

async function loadRecentActivity() {
    const activityList = document.getElementById('activityList');
    
    // Mock data - replace with actual API call
    const activities = [
        {
            icon: 'briefcase',
            iconClass: 'primary',
            title: 'New distributor registered',
            description: 'John Doe registered as distributor',
            time: new Date()
        },
        {
            icon: 'shopping-cart',
            iconClass: 'success',
            title: 'Order completed',
            description: 'Order #ORD-12345 was delivered',
            time: new Date(Date.now() - 3600000)
        },
        {
            icon: 'truck',
            iconClass: 'warning',
            title: 'Driver pending approval',
            description: 'New driver application received',
            time: new Date(Date.now() - 7200000)
        }
    ];

    activityList.innerHTML = activities.map(activity => `
        <li class="activity-item">
            <div class="activity-icon ${activity.iconClass}"><i data-feather="${activity.icon}"></i></div>
            <div class="activity-content">
                <h4>${activity.title}</h4>
                <p>${activity.description}</p>
            </div>
            <span class="activity-time">${timeAgo(activity.time)}</span>
        </li>
    `).join('');
}