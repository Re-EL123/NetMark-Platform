// Store Owner Authentication Service
class StoreOwnerAuthService {
    constructor() {
        this.currentUser = null;
        this.authReady = new Promise((resolve) => {
            this.authReadyResolve = resolve;
        });
        this.init();
    }

    init() {
        if (!auth || typeof auth.onAuthStateChanged !== 'function') {
            this.authReadyResolve();
            return;
        }

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.loadUserProfile();
                this.authReadyResolve();
            } else {
                this.authReadyResolve();
            }
        });
    }

    async loadUserProfile() {
        try {
            showLoading();
            const response = await api.get('/auth/me');
            
            if (response.success) {
                this.currentUser = response.data.user;

                if (!['storeOwner', 'distributor'].includes(this.currentUser.role)) {
                    showToast('Access denied. Store Owner or Distributor role required.', 'error');
                    await this.logout();
                    return;
                }

                this.updateUI();
                hideLoading();
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            showToast('Error loading profile', 'error');
            hideLoading();
        }
    }

    updateUI() {
        const userName = document.getElementById('userName');
        if (userName && this.currentUser) {
            userName.textContent = this.currentUser.name;
        }

        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar && this.currentUser) {
            userAvatar.src = this.currentUser.profileImage ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.name)}&background=4CAF50&color=fff`;
        }
    }

    async logout() {
        try {
            if (auth && typeof auth.signOut === 'function') {
                await auth.signOut();
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.currentUser = null;
            localStorage.removeItem(CONSTANTS.TOKEN_KEY);
            localStorage.removeItem(CONSTANTS.USER_KEY);
            sessionStorage.removeItem(CONSTANTS.TOKEN_KEY);
            sessionStorage.removeItem(CONSTANTS.USER_KEY);
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        window.location.replace('login.html');
    }

    isAuthenticated() {
        return !!auth.currentUser;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

const authService = new StoreOwnerAuthService();

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            authService.logout();
        });
    }
});

window.authService = authService;