// API Configuration
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const API_CONFIG = {
    baseURL: isLocalDev
        ? `${window.location.origin}/api`
        : 'https://greenworldplatform.duckdns.org/api',
    timeout: 30000,
};

// Firebase Configuration (Replace with your actual config)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAqimDHQNVGdCapyRwGuw1WrWX2iqgev-8",
    authDomain: "greenworldplatform.firebaseapp.com",
    projectId: "greenworldplatform",
    storageBucket: "greenworldplatform.firebasestorage.app",
    messagingSenderId: "181251136924",
    appId: "1:181251136924:web:67de91a673d6d3cf537c59"
};

const CONSTANTS = {
    TOKEN_KEY: 'greenworld_customer_token',
    USER_KEY: 'greenworld_customer_user',
    ROLE: 'customer',
    ALLOWED_ROLES: ['customer', 'distributor'],
    PAGE_SIZE: 20,
    CURRENCY: 'ZAR',
    LOCALE: 'en-ZA',
    COUNTRY: 'South Africa',
    SUBSCRIPTION_FEE: 3500,
    PRODUCT_CATEGORIES: [
        'Supplements',
        'Detox',
        'Skin Care',
        'Weight Management',
    ],
    PROVINCES: [
        'Eastern Cape',
        'Free State',
        'Gauteng',
        'KwaZulu-Natal',
        'Limpopo',
        'Mpumalanga',
        'Northern Cape',
        'North West',
        'Western Cape',
    ],
    FEATURED_PRODUCTS: [
        {
            catalogId: 'featured-ganoderma-plus-capsule',
            name: 'Ganoderma Plus Capsule',
            size: '300mg x 60 caps',
            category: 'Supplements',
            basePrice: 449,
            imageUrl: 'img/products/ganoderma-plus-capsule.png',
        },
        {
            catalogId: 'featured-a-power-capsule',
            name: 'A-Power Capsule',
            size: '360mg x 60 caps',
            category: 'Supplements',
            basePrice: 780,
            imageUrl: 'img/products/a-power-capsule.png',
        },
        {
            catalogId: 'featured-vig-power-capsule',
            name: 'Vig Power Capsule',
            size: '300mg x 6 caps',
            category: 'Supplements',
            basePrice: 507,
            imageUrl: 'img/products/vig-power-capsule.png',
        },
        {
            catalogId: 'featured-soybean-lecithin-softgel',
            name: 'Soybean Lecithin Softgel',
            size: '1.2g x 100 caps',
            category: 'Supplements',
            basePrice: 390,
            imageUrl: 'img/products/soybean-lecithin-softgel.jpg',
        },
        {
            catalogId: 'featured-deep-sea-fish-oil',
            name: 'Deep Sea Fish Oil Softgel (Omega-3)',
            size: '1g x 100 caps',
            category: 'Supplements',
            basePrice: 488,
            imageUrl: 'img/products/deep-sea-fish-oil-softgel-omega-3.jpg',
        },
        {
            catalogId: 'featured-compound-marrow-powder',
            name: 'Compound Marrow Powder',
            size: '24 sachets/box',
            category: 'Supplements',
            basePrice: 507,
            imageUrl: 'img/products/compound-marrow-powder.jpg',
        },
        {
            catalogId: 'featured-slimming-capsule',
            name: 'Slimming Capsule',
            size: '500mg x 60 caps',
            category: 'Weight Management',
            basePrice: 546,
            imageUrl: 'img/products/slimming-capsule.png',
        },
        {
            catalogId: 'featured-arthropower',
            name: 'Arthropower',
            size: '500mg x 60 caps',
            category: 'Supplements',
            basePrice: 546,
            imageUrl: 'img/products/arthropower.png',
        },
    ],
    APPOINTMENT_SERVICES: [
        { value: 'health_scanner', label: 'Health Scanner' },
        { value: 'toxic_removal_consultation', label: 'Toxic Removal Consultation' },
        { value: 'weight_management_consultation', label: 'Weight Management Consultation' },
        { value: 'nutrition_consultation', label: 'Nutrition Consultation' },
        { value: 'wellness_consultation', label: 'Wellness Consultation' },
        { value: 'immune_system_assessment', label: 'Immune System Assessment' },
        { value: 'body_composition_analysis', label: 'Body Composition Analysis' },
        { value: 'product_consultation', label: 'Product Consultation' },
    ],
};

// Export for use in other files
window.API_CONFIG = API_CONFIG;
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.CONSTANTS = CONSTANTS;