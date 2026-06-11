import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

let app;

// Try loading Hosting Auto-Init config
try {
  const response = await fetch('/__/firebase/init.json');
  const config = await response.json();
  app = initializeApp(config);
  console.log("Firebase initialized via auto-init config");
} catch (e) {
  console.warn("Could not load Firebase auto-init config. Using local fallback.");
  // Default config fallback - standard for local dev / emulator tests
  const firebaseConfig = {
    apiKey: "AIzaSyDUUb-wEXLy1YYe8iauxeehHSn-Jg-k9KY",
    authDomain: "inspiredpdf.firebaseapp.com",
    projectId: "inspiredpdf",
    storageBucket: "inspiredpdf.firebasestorage.app",
    messagingSenderId: "433590225047",
    appId: "1:433590225047:web:292fb6d27df589040601d2",
    measurementId: "G-3KLS4M3YSZ"
  };
  app = initializeApp(firebaseConfig);
  
  // Initialize Analytics if not on localhost
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    try {
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js").then(({ getAnalytics }) => {
        getAnalytics(app);
        console.log("Firebase Analytics initialized");
      });
    } catch (analyticsError) {
      console.warn("Failed to load Firebase Analytics:", analyticsError);
    }
  }
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Connect to local Firebase Emulators if running locally
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log("Connecting Firebase services to local emulators...");
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9199);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Silently sign in anonymously
async function initAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        localStorage.setItem('inspiredpdf_userId', user.uid);
        console.log("User is signed in anonymously:", user.uid);
        resolve(user);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            localStorage.setItem('inspiredpdf_userId', cred.user.uid);
            console.log("Newly signed in anonymously:", cred.user.uid);
            resolve(cred.user);
          })
          .catch((err) => {
            console.error("Anonymous authentication failed:", err);
            reject(err);
          });
      }
    });
  });
}

// Start auth process immediately
const authPromise = initAuth();

export { app, auth, db, storage, functions, authPromise };
