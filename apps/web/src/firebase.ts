import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyD19zqKbOIS4Hgev-8xXcJAEpzVcj6f1ZQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'greenworldplatform.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'greenworldplatform',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'greenworldplatform.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '485223826602',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:485223826602:web:579d45b89cfa2e553435d3',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-C5XPLQKPPT'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
