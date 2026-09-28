async function loadDashboard() {
    const pageContent = document.getElementById('pageContent');
    if (!pageContent) return;

    pageContent.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h2 class="card-title">Dashboard</h2>
            </div>
            <p>Welcome to your store owner dashboard.</p>
            <div class="stats-grid">
                <div class="card stat-card">
                    <h3>Stores</h3>
                    <p class="stat-value">0</p>
                </div>
                <div class="card stat-card">
                    <h3>Orders</h3>
                    <p class="stat-value">0</p>
                </div>
                <div class="card stat-card">
                    <h3>Revenue</h3>
                    <p class="stat-value">${formatCurrency(0)}</p>
                </div>
            </div>
        </div>
    `;

    if (window.feather) {
        feather.replace();
    }
}
