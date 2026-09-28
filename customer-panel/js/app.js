class CustomerApp {
    constructor() {
        this.currentPage = 'home';
        this.currentParam = '';
        this.init();
    }

    async init() {
        this.redirectStorePath();
        await authService.authReady;
        this.setupEventListeners();
        this.loadFromLocation();
    }

    redirectStorePath() {
        const match = window.location.pathname.match(/^\/store\/([^/]+)\/?$/);
        if (match) {
            window.location.replace(`/#store/${encodeURIComponent(decodeURIComponent(match[1]))}`);
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        document.querySelectorAll('[data-page]').forEach((link) => {
            if (link.classList.contains('nav-link')) {
                return;
            }
            link.addEventListener('click', (event) => {
                event.preventDefault();
                this.navigateTo(link.getAttribute('data-page'));
            });
        });

        const modalClose = document.getElementById('modalClose');
        if (modalClose) {
            modalClose.addEventListener('click', () => hideModal());
        }

        window.addEventListener('hashchange', () => this.loadFromLocation());
    }

    parseHash() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) {
            return { page: 'home', param: '' };
        }

        const [page, ...rest] = hash.split('/');
        return {
            page: page || 'home',
            param: decodeURIComponent(rest.join('/')),
        };
    }

    navigateTo(page, param = '') {
        const hash = param ? `${page}/${encodeURIComponent(param)}` : page;
        if (window.location.hash.replace(/^#/, '') === hash) {
            this.loadPage(page, param);
            return;
        }
        window.location.hash = hash;
    }

    loadFromLocation() {
        const { page, param } = this.parseHash();
        this.loadPage(page, param);
    }

    loadPage(page, param = '') {
        this.currentPage = page;
        this.currentParam = param;

        document.querySelectorAll('.nav-link').forEach((link) => {
            const isActive = link.getAttribute('data-page') === page ||
                (page === 'store' && link.getAttribute('data-page') === 'stores');
            link.classList.toggle('active', isActive);
        });

        switch (page) {
            case 'home':
                loadHome();
                break;
            case 'shop':
                loadShop();
                break;
            case 'stores':
                loadStores();
                break;
            case 'store':
                loadStorePage(param);
                break;
            case 'appointments':
                loadAppointments();
                break;
            case 'checkout':
                loadCheckout();
                break;
            case 'orders':
                loadOrders();
                break;
            case 'profile':
                loadProfile();
                break;
            case 'addresses':
                loadAddressesPage();
                break;
            case 'activate-store':
                loadActivateStore();
                break;
            case 'about':
                loadAboutPage();
                break;
            case 'contact':
                loadContactPage();
                break;
            case 'faq':
                loadFaqPage();
                break;
            case 'shipping':
                loadShippingPage();
                break;
            default:
                loadHome();
        }

        window.scrollTo(0, 0);
        if (window.feather) {
            feather.replace();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new CustomerApp();
});
