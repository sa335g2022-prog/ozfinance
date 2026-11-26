import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { SOUND_PREF_KEY, unlockAudioContext } from '../utils/storage';

export type NotificationCategory =
  | 'CHAT_MESSAGE'
  | 'TRANSACTION_ALERT'
  | 'SAVINGS_ALERT'
  | 'SYSTEM_INFO';

export interface FirestoreNotification {
  notificationId: string;
  recipientId: string;
  recipientUid: string;
  senderId: string;
  title: string;
  body: string;
  type: NotificationCategory;
  transactionId?: string;
  conversationId?: string;
  isRead: boolean;
  createdAt?: Timestamp | null;
}

export function loadSoundEnabledPref(): boolean {
  try {
    const val = localStorage.getItem(SOUND_PREF_KEY);
    if (val === 'false') return false;
  } catch {
    // Ignore
  }
  return true;
}

export function saveSoundEnabledPref(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore
  }
}

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedCtx) sharedCtx = new AudioCtx();
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Plays distinct category sounds when page is active and user has sound enabled:
 * - CHAT_MESSAGE: crisp two-tone chime (A5 -> C#6)
 * - TRANSACTION_ALERT: celebratory 3-note chime (C5 -> E5 -> G5)
 */
export function playCategoryNotificationSound(
  category: 'CHAT_MESSAGE' | 'TRANSACTION_ALERT',
  soundEnabled: boolean = loadSoundEnabledPref()
): void {
  if (!soundEnabled) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    // Background notifications rely on native browser/OS Web Push sound
    return;
  }
  unlockAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes =
      category === 'TRANSACTION_ALERT'
        ? [523.25, 659.25, 783.99]
        : [880.0, 1108.73];
    const step = category === 'TRANSACTION_ALERT' ? 0.11 : 0.09;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * step);

      gain.gain.setValueAtTime(0.0001, now + idx * step);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * step + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * step + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * step);
      osc.stop(now + idx * step + 0.38);
    });
  } catch {
    // Ignore in environments restricting Web Audio
  }
}

export function subscribeUserNotifications(
  params: {
    role: 'admin' | 'customer';
    uid: string;
    custId?: string;
  },
  onUpdate: (items: FirestoreNotification[]) => void
): Unsubscribe {
  const colRef = collection(db, 'notifications');
  const q =
    params.role === 'admin'
      ? query(
          colRef,
          where('recipientId', '==', 'ADMIN'),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      : query(
          colRef,
          where('recipientUid', '==', params.uid),
          orderBy('createdAt', 'desc'),
          limit(50)
        );

  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreNotification[] = snap.docs.map(
        (d) => d.data() as FirestoreNotification
      );
      onUpdate(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  );
}

export async function createNotificationDoc(payload: {
  notificationId: string;
  recipientId: string;
  recipientUid: string;
  senderId: string;
  title: string;
  body: string;
  type: NotificationCategory;
  transactionId?: string;
  conversationId?: string;
}): Promise<void> {
  const path = `notifications/${payload.notificationId}`;
  try {
    await setDoc(doc(db, 'notifications', payload.notificationId), {
      notificationId: payload.notificationId,
      recipientId: payload.recipientId,
      recipientUid: payload.recipientUid,
      senderId: payload.senderId,
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 1000),
      type: payload.type,
      ...(payload.transactionId ? { transactionId: payload.transactionId } : {}),
      ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markAllUserNotificationsRead(
  notifications: FirestoreNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;

  try {
    const batch = writeBatch(db);
    unread.slice(0, 450).forEach((item) => {
      batch.update(doc(db, 'notifications', item.notificationId), { isRead: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'notifications');
  }
}
