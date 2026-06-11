import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app);

// Silently sign in anonymously
async function initAuth() {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
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

export { app, db, storage, auth, functions, authPromise };
