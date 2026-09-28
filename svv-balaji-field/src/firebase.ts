import { getApp, getApps, initializeApp } from 'firebase/app';

/**
 * Firebase web config for push notifications (see push.ts). These values are public by design -
 * they identify the project to the browser; sending requires the server's service account.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA7N9tum2YeOkm3PjXAUp7MPUL5ZtOQc60',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'svv-balaji.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'svv-balaji',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'svv-balaji.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '809690429898',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:809690429898:web:40b10eb9ca60f5340ff733',
};

export const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BH-Pk_K4v7OOPNfMchcj7aLR-K8XmHMNG-1uzEDzpoPMwzyxHCjhBO09haZoqPWTUH8EWiWu5hRy6zTgSgXGsyE';

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
