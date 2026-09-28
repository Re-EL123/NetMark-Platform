// Main application controller for the store owner panel
class StoreOwnerApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.init();
    }

    async init() {
        this.setupEventListeners();

        try {
            await authService.authReady;
        } catch (error) {
            console.warn('Auth readiness warning:', error);
        }

        this.loadPage('dashboard');
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const logoutBtn = document.getElementById('logoutBtn');

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('show');
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await authService.logout();
            });

            logoutBtn.onclick = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await authService.logout();
            };
        }

        document.addEventListener('click', (event) => {
            if (window.innerWidth <= 768 && sidebar && menuToggle) {
                const clickedInsideSidebar = sidebar.contains(event.target);
                const clickedToggle = menuToggle.contains(event.target);
                if (!clickedInsideSidebar && !clickedToggle) {
                    sidebar.classList.remove('show');
                }
            }
        });

        const modalClose = document.getElementById('modalClose');
        const modal = document.getElementById('modal');

        if (modalClose) {
            modalClose.addEventListener('click', () => {
                hideModal();
            });
        }

        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    hideModal();
                }
            });
        }

        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', debounce((event) => {
                this.handleGlobalSearch(event.target.value);
            }, 500));
        }
    }

    navigateTo(page) {
        document.querySelectorAll('.nav-link').forEach((link) => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            }
        });

        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('show');
            }
        }

        this.loadPage(page);
        window.location.hash = page;
    }

    loadPage(page) {
        this.currentPage = page;
        const pageContent = document.getElementById('pageContent');

        if (!pageContent) {
            return;
        }

        switch (page) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'stores':
                loadStores();
                break;
            case 'products':
                loadProducts();
                break;
            case 'orders':
                loadOrders();
                break;
            case 'appointments':
                loadAppointments();
                break;
            case 'subscriptions':
                loadSubscriptions();
                break;
            case 'reports':
                loadReports();
                break;
            case 'profile':
                pageContent.innerHTML = `
                    <div class="card">
                        <h2 class="card-title">Profile</h2>
                        <p>Profile management will appear here.</p>
                    </div>
                `;
                break;
            default:
                pageContent.innerHTML = '<div class="card"><h2 class="card-title">Page not found</h2></div>';
        }

        if (window.feather) {
            feather.replace();
        }
    }

    handleGlobalSearch(query) {
        if (!query) {
            return;
        }

        showToast(`Searching for "${query}"`, 'info', 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new StoreOwnerApp();

    const hash = window.location.hash.substring(1);
    if (hash) {
        app.navigateTo(hash);
    }
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash && window.app) {
        window.app.navigateTo(hash);
    }
});
