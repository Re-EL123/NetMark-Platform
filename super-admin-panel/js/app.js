// Main Application Controller
function registerInlineAdminHandlers() {
    const handlerNames = [
        'loadDashboard',
        'loadUsers',
        'loadDistributors',
        'loadStores',
        'loadProducts',
        'loadOrders',
        'loadDrivers',
        'loadAppointments',
        'loadSubscriptions',
        'loadReports',
        'showCreateStoreModal',
        'viewStore',
        'toggleStoreStatus',
        'viewUser',
        'verifyUser',
        'showUploadCodesModal',
        'showAddCodeModal',
        'deactivateCode',
        'viewCodeUser',
        'showAddProductModal',
        'editProduct',
        'deleteProduct',
        'approveDriver',
        'viewDriver',
        'viewOrder',
        'updateOrderStatus',
        'viewAppointment',
        'confirmPayment',
        'viewSubscription',
        'downloadReport',
        'showReportModal',
        'hideModal',
        'filterUsers',
        'filterStores',
        'filterProducts',
        'filterOrders',
        'filterDrivers',
        'filterAppointments',
        'filterSubscriptions',
        'filterReports',
        'changeUsersPage',
        'changeStoresPage',
        'changeProductsPage',
        'changeOrdersPage',
        'changeDriversPage',
        'changeAppointmentsPage',
        'changeSubscriptionsPage',
        'changeReportsPage',
    ];

    handlerNames.forEach((name) => {
        const value = window[name];
        if (typeof value === 'function') {
            window[name] = value;
        }
    });
}

class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.init();
    }

    async init() {
        // Wait for authentication to be ready before setting up
        await authService.authReady;
        
        this.setupEventListeners();
        this.loadPage('dashboard');
    }

    setupEventListeners() {
        // Navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        // Menu toggle for mobile
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('show');
            });
        }

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('show');
                }
            }
        });

        // Modal close
        const modalClose = document.getElementById('modalClose');
        const modal = document.getElementById('modal');
        
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                hideModal();
            });
        }

        // Close modal when clicking outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideModal();
                }
            });
        }

        // Global search
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', debounce((e) => {
                this.handleGlobalSearch(e.target.value);
            }, 500));
        }
    }

    navigateTo(page) {
        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            }
        });

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('show');
        }

        // Load page content
        this.loadPage(page);
        
        // Update URL hash
        window.location.hash = page;
    }

    loadPage(page) {
        this.currentPage = page;
        const pageContent = document.getElementById('pageContent');

        const loaderMap = {
            dashboard: () => typeof loadDashboard === 'function' ? loadDashboard() : window.loadDashboard?.(),
            users: () => typeof loadUsers === 'function' ? loadUsers() : window.loadUsers?.(),
            distributors: () => typeof loadDistributors === 'function' ? loadDistributors() : window.loadDistributors?.(),
            stores: () => typeof loadStores === 'function' ? loadStores() : window.loadStores?.(),
            products: () => typeof loadProducts === 'function' ? loadProducts() : window.loadProducts?.(),
            orders: () => typeof loadOrders === 'function' ? loadOrders() : window.loadOrders?.(),
            drivers: () => typeof loadDrivers === 'function' ? loadDrivers() : window.loadDrivers?.(),
            appointments: () => typeof loadAppointments === 'function' ? loadAppointments() : window.loadAppointments?.(),
            subscriptions: () => typeof loadSubscriptions === 'function' ? loadSubscriptions() : window.loadSubscriptions?.(),
            reports: () => typeof loadReports === 'function' ? loadReports() : window.loadReports?.(),
            settings: () => typeof loadSettings === 'function' ? loadSettings() : window.loadSettings?.(),
        };

        const loader = loaderMap[page];
        if (loader) {
            loader();
        } else {
            pageContent.innerHTML = '<h1>Page not found</h1>';
        }
    }

    handleGlobalSearch(query) {
        if (!query) return;
        console.log('Searching for:', query);
        // Implement global search logic
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    registerInlineAdminHandlers();
    window.app = new App();
    
    // Load page from hash if present
    const hash = window.location.hash.substring(1);
    if (hash) {
        app.navigateTo(hash);
    }
});

// Handle hash changes
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash && app) {
        app.navigateTo(hash);
    }
});