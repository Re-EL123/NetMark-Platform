// Authentication Service
class AuthService {
    constructor() {
        this.currentUser = null;
        this.authReady = new Promise((resolve) => {
            this.authReadyResolve = resolve;
        });
        this.init();
    }

    init() {
        // Check authentication state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.loadUserProfile();
                this.authReadyResolve();
            } else {
                this.redirectToLogin();
            }
        });
    }

    async loadUserProfile() {
        try {
            showLoading();
            const response = await api.get('/auth/me');
            
            if (response.success) {
                this.currentUser = response.data.user;
                
                // Check if user is super admin
                if (this.currentUser.role !== 'platformAdmin') {
                    showToast('Access denied. Super Admin role required.', 'error');
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

        // Update user avatar
        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar && this.currentUser) {
            userAvatar.src = this.currentUser.profileImage || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.name)}&background=4CAF50&color=fff`;
        }
    }

    async logout() {
        try {
            await auth.signOut();
            localStorage.removeItem(CONSTANTS.TOKEN_KEY);
            localStorage.removeItem(CONSTANTS.USER_KEY);
            this.redirectToLogin();
        } catch (error) {
            console.error('Logout error:', error);
            showToast('Error logging out', 'error');
        }
    }

    redirectToLogin() {
        window.location.href = 'login.html';
    }

    isAuthenticated() {
        return !!auth.currentUser;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// Create auth service instance
const authService = new AuthService();

// Logout button handler
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            authService.logout();
        });
    }
});

// Export
window.authService = authService;