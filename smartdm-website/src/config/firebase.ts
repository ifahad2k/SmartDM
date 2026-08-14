import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA0XYmxHUytoBGnpGoZ78fmzNtu4P6zz1k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smartdm-web-de735.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smartdm-web-de735",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "smartdm-web-de735.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "599803214400",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:599803214400:web:3fa6e34a2e747e9ab0bda5"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Enable Auth browser local persistence for secure session caching
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('Auth persistence note:', err);
});

let db: Firestore;
try {
  db = getFirestore(app);
  // Enable IndexedDB cache for instant offline & cached page loads
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore multi-tab persistence active');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore browser persistence unsupported');
    }
  });
} catch (e) {
  console.warn('Firestore initialization fallback:', e);
  db = null as any;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const githubProvider = new GithubAuthProvider();

export { app, auth, db, googleProvider, githubProvider };
