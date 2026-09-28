// Customer Auth Service
class CustomerAuthService {
    constructor() {
        this.currentUser = null;
        this.authReady = new Promise((resolve) => {
            this.authReadyResolve = resolve;
        });
        this.init();
    }

    init() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.loadUserProfile();
            } else {
                this.currentUser = null;
                this.updateUI();
            }
            this.authReadyResolve();
        });
    }

    async loadUserProfile() {
        try {
            const response = await api.get('/auth/me');
            if (response.success) {
                this.currentUser = response.data.user;
                this.updateUI();
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    updateUI() {
        const userMenu = document.getElementById('userMenu');
        if (!userMenu) {
            return;
        }

        if (this.currentUser) {
            const canActivateStore = this.currentUser.role === 'distributor';
            userMenu.innerHTML = `
                <div class="user-dropdown">
                    <button class="btn btn-outline" type="button">${this.currentUser.name}</button>
                    <div class="dropdown-menu">
                        <a href="#orders" onclick="app.navigateTo('orders'); return false;">My Orders</a>
                        <a href="#appointments" onclick="app.navigateTo('appointments'); return false;">My Appointments</a>
                        <a href="#addresses" onclick="app.navigateTo('addresses'); return false;">Addresses</a>
                        <a href="#profile" onclick="app.navigateTo('profile'); return false;">Profile</a>
                        ${canActivateStore ? '<a href="#activate-store" onclick="app.navigateTo(\'activate-store\'); return false;">Activate Store</a>' : ''}
                        <a href="#" onclick="authService.logout(); return false;">Logout</a>
                    </div>
                </div>
            `;
        } else {
            userMenu.innerHTML = `<button class="btn btn-primary" id="loginBtn" onclick="window.location.href='login.html'">Login</button>`;
        }
    }

    async logout() {
        await auth.signOut();
        this.currentUser = null;
        window.location.href = 'login.html';
    }

    isAuthenticated() {
        return !!this.currentUser;
    }

    isDistributor() {
        return this.currentUser?.role === 'distributor';
    }

    getBuyerType() {
        return this.isDistributor() ? 'distributor' : 'customer';
    }

    getDistributorCode() {
        return this.currentUser?.distributorCode || this.currentUser?.distributor_code || '';
    }
}

const authService = new CustomerAuthService();
window.authService = authService;
