// Utility Functions

// Show loading overlay
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('show');
    }
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        success: '<i data-feather="check"></i>',
        error: '<i data-feather="x"></i>',
        warning: '<i data-feather="alert-triangle"></i>',
        info: '<i data-feather="info"></i>'
    }[type] || '<i data-feather="info"></i>';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);
    if (window.feather) feather.replace();

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

function formatCurrency(amount, currency = CONSTANTS.CURRENCY) {
    return new Intl.NumberFormat(CONSTANTS.LOCALE, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
}

function formatDate(date, format = 'short') {
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
        return '-';
    }

    if (format === 'short') {
        return d.toLocaleDateString(CONSTANTS.LOCALE);
    }

    if (format === 'long') {
        return d.toLocaleDateString(CONSTANTS.LOCALE, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    if (format === 'datetime') {
        return d.toLocaleString(CONSTANTS.LOCALE);
    }

    return d.toLocaleDateString(CONSTANTS.LOCALE);
}

function getStoreSlug(store) {
    return store?.slug || store?.storeSlug || store?._id || store?.id || '';
}

function getStoreId(store) {
    return store?._id || store?.id || store?.storeId || '';
}

const DEFAULT_STORE_IMAGE = 'img/netmark-logo.png';

function resolveMediaUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }

    const trimmed = url.trim();
    if (!trimmed || /placeholder/i.test(trimmed)) {
        return '';
    }

    if (/^(https?:\/\/|data:|img\/|\/img\/)/i.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith('/')) {
        return API_CONFIG.baseURL.replace(/\/api\/?$/, '') + trimmed;
    }

    return trimmed;
}

function getStoreImage(store) {
    const candidates = [
        store?.logo,
        store?.logoUrl,
        store?.imageUrl,
        store?.image,
        store?.banner,
        store?.photo,
        store?.logo?.url,
    ];

    for (const value of candidates) {
        const resolved = resolveMediaUrl(typeof value === 'string' ? value : '');
        if (resolved) {
            return resolved;
        }
    }

    return DEFAULT_STORE_IMAGE;
}

function getDeliveryFee(store) {
    return Number(
        store?.settings?.deliveryFee ??
        store?.deliveryFee ??
        store?.delivery_fee ??
        0
    );
}

function isStoreOpen(store) {
    const status = (store?.subscriptionStatus || store?.status || '').toLowerCase();
    if (store?.isActive === false || ['expired', 'inactive', 'locked'].includes(status)) {
        return false;
    }
    return true;
}

function getAppointmentServiceLabel(value) {
    const match = CONSTANTS.APPOINTMENT_SERVICES.find((service) => service.value === value);
    return match?.label || value || 'Appointment';
}

function provinceOptions(selected = '') {
    return CONSTANTS.PROVINCES.map((province) => `
        <option value="${province}" ${province === selected ? 'selected' : ''}>${province}</option>
    `).join('');
}

function showLoginModal() {
    window.location.href = 'login.html';
}

function getCatalogProductImage(product) {
    if (!product) {
        return 'https://via.placeholder.com/280x250';
    }
    if (product.imageUrl && !product.imageUrl.includes('placeholder') && !/^https?:\/\/via\.placeholder\.com/i.test(product.imageUrl)) {
        return product.imageUrl;
    }
    const match = CONSTANTS.FEATURED_PRODUCTS.find((item) => namesMatchProduct(product.name, item.name));
    return match?.imageUrl || 'https://via.placeholder.com/280x250';
}

function namesMatchProduct(a, b) {
    const left = (a || '').toLowerCase().trim();
    const right = (b || '').toLowerCase().trim();
    return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function mergeCatalogProducts(apiProducts = []) {
    const catalogItems = CONSTANTS.FEATURED_PRODUCTS.map((featured) => {
        const match = apiProducts.find((product) => namesMatchProduct(product.name, featured.name));
        return {
            ...featured,
            _id: match?._id || featured.catalogId,
            basePrice: match?.basePrice ?? featured.basePrice,
            category: match?.category || featured.category,
            imageUrl: featured.imageUrl,
            description: match?.description || `${featured.name} — ${featured.size}. Official NetMark product.`,
        };
    });

    const extras = apiProducts
        .filter((product) => !catalogItems.some((item) =>
            item._id === product._id || namesMatchProduct(item.name, product.name)
        ))
        .map((product) => ({
            ...product,
            imageUrl: getCatalogProductImage(product),
        }));

    return [...catalogItems, ...extras];
}

// Format time ago
function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
        second: 1
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
        }
    }
    
    return 'just now';
}

// Show modal
function showModal(title, content, actions = []) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalBody) return;

    let actionsHTML = '';
    if (actions.length > 0) {
        actionsHTML = `
            <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                ${actions.map(action => `
                    <button class="btn ${action.class || 'btn-primary'}" onclick="${action.onclick}">${action.text}</button>
                `).join('')}
            </div>
        `;
    }

    modalBody.innerHTML = `
        <h2>${title}</h2>
        <div style="margin-top: 20px;">
            ${content}
        </div>
        ${actionsHTML}
    `;

    modal.classList.add('show');
}

// Hide modal
function hideModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Confirm dialog
function confirm(message, onConfirm) {
    showModal('Confirm', `<p>${message}</p>`, [
        {
            text: 'Cancel',
            class: 'btn-outline',
            onclick: 'hideModal()'
        },
        {
            text: 'Confirm',
            class: 'btn-primary',
            onclick: `hideModal(); (${onConfirm})()`
        }
    ]);
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Get status badge class
function getStatusBadgeClass(status) {
    const statusMap = {
        'active': 'badge-success',
        'pending': 'badge-warning',
        'completed': 'badge-success',
        'cancelled': 'badge-danger',
        'rejected': 'badge-danger',
        'approved': 'badge-success',
        'verified': 'badge-success',
        'expired': 'badge-danger',
        'paid': 'badge-success',
        'failed': 'badge-danger',
        'delivered': 'badge-success',
        'in_transit': 'badge-info',
        'processing': 'badge-warning',
        'confirmed': 'badge-info',
        'ready': 'badge-warning',
        'no_show': 'badge-danger',
    };

    return statusMap[status] || 'badge-secondary';
}

// Pagination helper
function renderPagination(pagination, onPageChange) {
    if (!pagination) {
        return '';
    }

    const { page = 1, totalPages = 1, hasNextPage = false, hasPrevPage = false } = pagination;
    
    let html = '<div class="pagination" style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">';
    
    html += `
        <button class="btn btn-sm ${!hasPrevPage ? 'disabled' : ''}" 
                onclick="${onPageChange}(${page - 1})" 
                ${!hasPrevPage ? 'disabled' : ''}>
            Previous
        </button>
    `;
    
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
        html += `
            <button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-outline'}" 
                    onclick="${onPageChange}(${i})">
                ${i}
            </button>
        `;
    }
    
    html += `
        <button class="btn btn-sm ${!hasNextPage ? 'disabled' : ''}" 
                onclick="${onPageChange}(${page + 1})" 
                ${!hasNextPage ? 'disabled' : ''}>
            Next
        </button>
    `;
    
    html += '</div>';
    
    return html;
}

// Export utilities
window.utils = {
    showLoading,
    hideLoading,
    showToast,
    formatCurrency,
    formatDate,
    timeAgo,
    showModal,
    hideModal,
    confirm,
    debounce,
    getStatusBadgeClass,
    renderPagination,
    getStoreSlug,
    getStoreId,
    getStoreImage,
    getDeliveryFee,
    isStoreOpen,
    getAppointmentServiceLabel,
    provinceOptions,
    showLoginModal,
    getCatalogProductImage,
    mergeCatalogProducts,
};