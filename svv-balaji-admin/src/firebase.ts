import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from 'firebase/messaging';

/**
 * Firebase Configuration dynamically sourced from environment variables
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA7N9tum2YeOkm3PjXAUp7MPUL5ZtOQc60",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "svv-balaji.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "svv-balaji",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "svv-balaji.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "809690429898",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:809690429898:web:40b10eb9ca60f5340ff733",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-FD1TK6KFBN"
};

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BH-Pk_K4v7OOPNfMchcj7aLR-K8XmHMNG-1uzEDzpoPMwzyxHCjhBO09haZoqPWTUH8EWiWu5hRy6zTgSgXGsyE";

// Initialize Firebase Singleton
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Initialize Google Analytics if supported
 */
export const initAnalytics = async () => {
  if (typeof window !== 'undefined' && await isAnalyticsSupported()) {
    return getAnalytics(app);
  }
  return null;
};

/**
 * Request FCM Push Notification Token from browser
 */
export const requestFcmToken = async (): Promise<string | null> => {
  try {
    if (typeof window === 'undefined') return null;
    const messagingSupported = await isMessagingSupported();
    if (!messagingSupported) {
      console.warn('FCM Messaging is not supported in this browser.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return null;
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    console.log('[Firebase] Admin FCM Token:', token);
    return token;
  } catch (error) {
    console.error('[Firebase] Error requesting FCM Token:', error);
    return null;
  }
};

/**
 * Listen for Foreground Push Notifications
 */
export const onForegroundMessage = async (callback: (payload: any) => void) => {
  try {
    const messagingSupported = await isMessagingSupported();
    if (!messagingSupported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log('[Firebase] Foreground Message received:', payload);
      callback(payload);
    });
  } catch (error) {
    console.error('[Firebase] Error in foreground message listener:', error);
    return () => {};
  }
};
