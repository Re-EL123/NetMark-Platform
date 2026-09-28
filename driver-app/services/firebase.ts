// services/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  
    apiKey: "AIzaSyAqimDHQNVGdCapyRwGuw1WrWX2iqgev-8",
    authDomain: "greenworldplatform.firebaseapp.com",
    projectId: "greenworldplatform",
    storageBucket: "greenworldplatform.firebasestorage.app",
    messagingSenderId: "181251136924",
    appId: "1:181251136924:web:67de91a673d6d3cf537c59"

};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);