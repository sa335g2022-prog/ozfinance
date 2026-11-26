import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
} from 'firebase/messaging';
import { db, firebaseApp, handleFirestoreError, OperationType } from './firebase';
import {
  loadSoundEnabledPref,
  playCategoryNotificationSound,
} from './notifications';

export interface PushSetupStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string | null;
  vapidConfigured: boolean;
  serviceWorkerActive: boolean;
  error?: string;
}

const TOKEN_STORAGE_KEY = 'ozf_active_fcm_token_id_v1';

let cachedMessaging: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!cachedMessaging) {
      cachedMessaging = getMessaging(firebaseApp);
    }
    return cachedMessaging;
  } catch {
    return null;
  }
}

export function getConfiguredVapidKey(): string {
  return ((import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) || '').trim();
}

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

export async function requestAndRegisterPushToken(params: {
  uid?: string;
  custId: string;
  role: 'admin' | 'customer';
  soundEnabled?: boolean;
}): Promise<PushSetupStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      token: null,
      vapidConfigured: Boolean(getConfiguredVapidKey()),
      serviceWorkerActive: false,
      error: 'Browser tidak mendukung Web Push Notification API.',
    };
  }

  const swReg = await registerFcmServiceWorker();
  const messaging = await getMessagingInstance();
  const vapidKey = getConfiguredVapidKey();

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      supported: Boolean(messaging),
      permission,
      token: null,
      vapidConfigured: Boolean(vapidKey),
      serviceWorkerActive: Boolean(swReg),
      error: 'Izin notifikasi browser belum diberikan atau diblokir.',
    };
  }

  if (!messaging || !swReg) {
    return {
      supported: false,
      permission,
      token: null,
      vapidConfigured: Boolean(vapidKey),
      serviceWorkerActive: Boolean(swReg),
      error: 'Notifikasi suara & browser aktif (Service Worker tidak tersedia di mode ini).',
    };
  }

  try {
    const token = await getToken(
      messaging,
      vapidKey
        ? { vapidKey, serviceWorkerRegistration: swReg }
        : { serviceWorkerRegistration: swReg }
    );

    if (!token) {
      return {
        supported: true,
        permission,
        token: null,
        vapidConfigured: Boolean(vapidKey),
        serviceWorkerActive: true,
      };
    }

    if (params.uid) {
      const tokenId = `${params.uid}_${params.role}_${token.slice(0, 24).replace(/[^a-zA-Z0-9_\-]/g, '')}`;
      const docRef = doc(db, 'deviceTokens', tokenId);
      const existing = await getDoc(docRef);
      const soundPref = params.soundEnabled ?? loadSoundEnabledPref();

      await setDoc(
        docRef,
        {
          tokenId,
          userId: params.uid,
          custId: params.custId,
          role: params.role,
          fcmToken: token,
          platform: navigator.userAgent.slice(0, 60) || 'web',
          soundEnabled: soundPref,
          createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, tokenId);
      } catch {
        // Ignore
      }
    }

    return {
      supported: true,
      permission,
      token,
      vapidConfigured: true,
      serviceWorkerActive: true,
    };
  } catch {
    return {
      supported: true,
      permission,
      token: null,
      vapidConfigured: Boolean(vapidKey),
      serviceWorkerActive: Boolean(swReg),
    };
  }
}

export async function removeCurrentDeviceToken(): Promise<void> {
  try {
    const tokenId = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!tokenId) return;
    await deleteDoc(doc(db, 'deviceTokens', tokenId));
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    // Token cleanup should fail gracefully without blocking logout
    console.warn('Device token cleanup skipped:', err);
  }
}

export async function syncDeviceTokenSoundPref(soundEnabled: boolean): Promise<void> {
  try {
    const tokenId = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!tokenId) return;
    const ref = doc(db, 'deviceTokens', tokenId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await setDoc(
      ref,
      {
        soundEnabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'deviceTokens');
  }
}

export async function subscribeForegroundPush(
  onForegroundMessage: (payload: MessagePayload) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => undefined;

  return onMessage(messaging, (payload) => {
    const data = payload.data || {};
    const category =
      data.type === 'TRANSACTION_ALERT' ? 'TRANSACTION_ALERT' : 'CHAT_MESSAGE';
    playCategoryNotificationSound(category);

    // Show clean foreground Web Notification if user granted permission and wants OS toast
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      const title = payload.notification?.title || data.title || 'OZdigiFinance';
      const body = payload.notification?.body || data.body || '';
      const tag = data.transactionId || data.messageId || 'ozf-fg';
      try {
        const n = new Notification(title, { body, tag });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Some mobile browsers require ServiceWorkerRegistration.showNotification
      }
    }

    onForegroundMessage(payload);
  });
}
