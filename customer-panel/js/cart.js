// Shopping Cart Management
class ShoppingCart {
    constructor() {
        this.items = [];
        this.loadFromStorage();
        this.init();
    }

    init() {
        this.updateUI();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('cartBtn').addEventListener('click', () => {
            this.toggleCart();
        });

        document.getElementById('closeCart').addEventListener('click', () => {
            this.closeCart();
        });

        document.getElementById('overlay').addEventListener('click', () => {
            this.closeCart();
        });

        document.getElementById('checkoutBtn').addEventListener('click', () => {
            this.proceedToCheckout();
        });
    }

    addItem(product, quantity = 1) {
        const existingItem = this.items.find(item => item.productId === product._id);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.items.push({
                productId: product._id,
                name: product.name,
                price: product.basePrice,
                image: product.imageUrl,
                quantity: quantity,
                storeId: product.storeId || null
            });
        }

        this.saveToStorage();
        this.updateUI();
        showToast(`${product.name} added to cart`, 'success');
    }

    removeItem(productId) {
        this.items = this.items.filter(item => item.productId !== productId);
        this.saveToStorage();
        this.updateUI();
        showToast('Item removed from cart', 'info');
    }

    updateQuantity(productId, quantity) {
        const item = this.items.find(item => item.productId === productId);
        if (item) {
            item.quantity = Math.max(1, quantity);
            this.saveToStorage();
            this.updateUI();
        }
    }

    getTotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getItemCount() {
        return this.items.reduce((count, item) => count + item.quantity, 0);
    }

    clear() {
        this.items = [];
        this.saveToStorage();
        this.updateUI();
    }

    saveToStorage() {
        localStorage.setItem('greenworld_cart', JSON.stringify(this.items));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('greenworld_cart');
        if (saved) {
            this.items = JSON.parse(saved);
        }
    }

    updateUI() {
        // Update cart count
        document.getElementById('cartCount').textContent = this.getItemCount();

        // Update cart body
        const cartBody = document.getElementById('cartBody');
        
        if (this.items.length === 0) {
            cartBody.innerHTML = `
                <div style="text-align: center; padding: 40px 0;">
                    <h3>Your cart is empty</h3>
                    <p>Add some products to get started</p>
                </div>
            `;
        } else {
            cartBody.innerHTML = this.items.map(item => `
                <div class="cart-item">
                    <img src="${item.image || 'https://via.placeholder.com/80'}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <h4>${item.name}</h4>
                        <div class="cart-item-price">${formatCurrency(item.price)}</div>
                        <div class="cart-item-quantity">
                            <button class="quantity-btn" onclick="cart.updateQuantity('${item.productId}', ${item.quantity - 1})">-</button>
                            <span>${item.quantity}</span>
                            <button class="quantity-btn" onclick="cart.updateQuantity('${item.productId}', ${item.quantity + 1})">+</button>
                        </div>
                    </div>
                    <button class="cart-item-remove" onclick="cart.removeItem('${item.productId}')">&times;</button>
                </div>
            `).join('');
        }

        // Update total
        document.getElementById('cartTotal').textContent = formatCurrency(this.getTotal());
    }

    toggleCart() {
        const sidebar = document.getElementById('cartSidebar');
        const overlay = document.getElementById('overlay');
        
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    }

    closeCart() {
        document.getElementById('cartSidebar').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
    }

    proceedToCheckout() {
        if (this.items.length === 0) {
            showToast('Your cart is empty', 'warning');
            return;
        }

        // Check if user is logged in
        if (!authService.isAuthenticated()) {
            showToast('Please login to continue', 'warning');
            showLoginModal();
            return;
        }

        this.closeCart();
        app.navigateTo('checkout');
    }
}

// Initialize cart
const cart = new ShoppingCart();
window.cart = cart;