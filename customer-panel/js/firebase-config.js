// Initialize Firebase
firebase.initializeApp(FIREBASE_CONFIG);

const auth = firebase.auth();

// Export auth instance
window.firebaseAuth = auth;