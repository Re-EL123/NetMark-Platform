// API Configuration
const API_CONFIG = {
    baseURL: 'https://greenworldplatform.duckdns.org/api',
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

// App Constants
const CONSTANTS = {
    TOKEN_KEY: 'greenworld_admin_token',
    USER_KEY: 'greenworld_admin_user',
    ROLE: 'superAdmin',
    PAGE_SIZE: 20,
    CURRENCY: 'ZAR',
    LOCALE: 'en-ZA',
};

// Export for use in other files
window.API_CONFIG = API_CONFIG;
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.CONSTANTS = CONSTANTS;