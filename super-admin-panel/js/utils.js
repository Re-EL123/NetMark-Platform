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

// Format currency
function formatCurrency(amount, currency = (window.CONSTANTS && CONSTANTS.CURRENCY) || 'ZAR') {
    const numericAmount = Number(amount) || 0;
    const locale = (window.CONSTANTS && CONSTANTS.LOCALE) || 'en-ZA';

    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(numericAmount);
}

// Format date
function formatDate(date, format = 'short') {
    const d = new Date(date);
    
    if (format === 'short') {
        return d.toLocaleDateString();
    } else if (format === 'long') {
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } else if (format === 'datetime') {
        return d.toLocaleString();
    }
    
    return d.toLocaleDateString();
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
                ${actions.map((action, index) => `
                    <button class="btn ${action.class || 'btn-primary'}" data-action-index="${index}">${action.text}</button>
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

    const buttons = modalBody.querySelectorAll('[data-action-index]');
    buttons.forEach((button) => {
        const actionIndex = Number(button.getAttribute('data-action-index'));
        const action = actions[actionIndex];
        if (!action) return;

        button.removeAttribute('onclick');
        button.onclick = null;

        button.addEventListener('click', () => {
            if (typeof action.onclick === 'function') {
                action.onclick();
            } else if (typeof action.onclick === 'string') {
                try {
                    new Function(action.onclick)();
                } catch (error) {
                    console.error('Error executing modal action:', error);
                }
            }
        });
    });
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
            onclick: () => hideModal()
        },
        {
            text: 'Confirm',
            class: 'btn-primary',
            onclick: () => {
                hideModal();
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            }
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
    };

    return statusMap[status] || 'badge-secondary';
}

// Pagination helper
function renderPagination(pagination, onPageChange) {
    const { page, totalPages, hasNextPage, hasPrevPage } = pagination;
    
    let html = '<div class="pagination" style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">';
    
    // Previous button
    html += `
        <button class="btn btn-sm ${!hasPrevPage ? 'disabled' : ''}" 
                onclick="${onPageChange}(${page - 1})" 
                ${!hasPrevPage ? 'disabled' : ''}>
            Previous
        </button>
    `;
    
    // Page numbers
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
        html += `
            <button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-outline'}" 
                    onclick="${onPageChange}(${i})">
                ${i}
            </button>
        `;
    }
    
    // Next button
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
};

window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showToast = showToast;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.showModal = showModal;
window.hideModal = hideModal;
window.confirm = confirm;
window.debounce = debounce;
window.getStatusBadgeClass = getStatusBadgeClass;
window.renderPagination = renderPagination;