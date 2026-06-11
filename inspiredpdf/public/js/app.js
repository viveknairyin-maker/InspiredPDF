import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDUUb-wEXLy1YYe8iauxeehHSn-Jg-k9KY",
  authDomain: "inspiredpdf.firebaseapp.com",
  projectId: "inspiredpdf",
  storageBucket: "inspiredpdf.firebasestorage.app",
  messagingSenderId: "433590225047",
  appId: "1:433590225047:web:292fb6d27df589040601d2",
  measurementId: "G-3KLS4M3YSZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);
const auth = null; // Removed Firebase Authentication

// Generate or retrieve a persistent local session ID to act as a user ID
function getOrCreateLocalSessionId() {
  let sessionId = localStorage.getItem('inspiredpdf_userId');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('inspiredpdf_userId', sessionId);
  }
  return sessionId;
}

const localSessionId = getOrCreateLocalSessionId();
console.log("Local session ID:", localSessionId);

// Resolve authPromise immediately with simulated user details
const authPromise = Promise.resolve({ uid: localSessionId });

export { app, db, storage, auth, functions, authPromise };
