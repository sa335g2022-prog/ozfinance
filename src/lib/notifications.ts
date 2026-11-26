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

export type SoundChannel = 'chat' | 'alert';

export interface CustomSoundMeta {
  name: string;
  mimeType: string;
  size: number;
}

const CUSTOM_SOUND_META_KEY = 'ozf_custom_sound_meta_v1';
const IDB_NAME = 'ozdigifinance_sounds_v1';
const IDB_STORE = 'sounds';

const cachedAudioUrl: Partial<Record<SoundChannel, string>> = {};
const cachedAudioBlobLoaded: Partial<Record<SoundChannel, boolean>> = {};

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

export function loadCustomSoundMeta(): Record<SoundChannel, CustomSoundMeta | null> {
  try {
    const raw = localStorage.getItem(CUSTOM_SOUND_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<SoundChannel, CustomSoundMeta | null>>;
      return {
        chat: parsed.chat ?? null,
        alert: parsed.alert ?? null,
      };
    }
  } catch {
    // Ignore
  }
  return { chat: null, alert: null };
}

function saveCustomSoundMeta(next: Record<SoundChannel, CustomSoundMeta | null>): void {
  try {
    localStorage.setItem(CUSTOM_SOUND_META_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

function openSoundDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getStoredSoundBlob(channel: SoundChannel): Promise<Blob | null> {
  const database = await openSoundDb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(channel);
      req.onsuccess = () => {
        const res = req.result;
        resolve(res instanceof Blob ? res : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function preloadCustomSounds(): Promise<void> {
  const meta = loadCustomSoundMeta();
  const channels: SoundChannel[] = ['chat', 'alert'];
  await Promise.all(
    channels.map(async (ch) => {
      if (!meta[ch] || cachedAudioUrl[ch]) return;
      const blob = await getStoredSoundBlob(ch);
      cachedAudioBlobLoaded[ch] = true;
      if (blob) {
        cachedAudioUrl[ch] = URL.createObjectURL(blob);
      }
    })
  );
}

export async function saveDeviceSound(
  channel: SoundChannel,
  file: File
): Promise<CustomSoundMeta> {
  const isAudioMime = file.type.startsWith('audio/');
  const isAudioExt = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name);
  if (!isAudioMime && !isAudioExt) {
    throw new Error('Pilih file audio/nada yang valid (.mp3, .wav, .ogg, .m4a).');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran file suara maksimal 5 MB.');
  }

  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || 'audio/mpeg',
  });

  const database = await openSoundDb();
  if (database) {
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = database.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, channel);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Gagal menyimpan nada ke penyimpanan perangkat.'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Gagal menyimpan nada perangkat.'));
      }
    });
  }

  if (cachedAudioUrl[channel]) {
    URL.revokeObjectURL(cachedAudioUrl[channel]!);
  }
  cachedAudioUrl[channel] = URL.createObjectURL(blob);
  cachedAudioBlobLoaded[channel] = true;

  const metaItem: CustomSoundMeta = {
    name: file.name.slice(0, 80),
    mimeType: blob.type,
    size: file.size,
  };
  const allMeta = loadCustomSoundMeta();
  allMeta[channel] = metaItem;
  saveCustomSoundMeta(allMeta);
  return metaItem;
}

export async function clearDeviceSound(channel: SoundChannel): Promise<void> {
  const database = await openSoundDb();
  if (database) {
    await new Promise<void>((resolve) => {
      try {
        const tx = database.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(channel);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  if (cachedAudioUrl[channel]) {
    URL.revokeObjectURL(cachedAudioUrl[channel]!);
    delete cachedAudioUrl[channel];
  }
  cachedAudioBlobLoaded[channel] = false;

  const allMeta = loadCustomSoundMeta();
  allMeta[channel] = null;
  saveCustomSoundMeta(allMeta);
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

function playSynthCategoryChime(category: 'CHAT_MESSAGE' | 'TRANSACTION_ALERT'): void {
  unlockAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    if (category === 'CHAT_MESSAGE') {
      // Crisp 2-note chat bubble ping (high A5 -> D6, triangle wave)
      const notes = [880.0, 1174.66];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.085);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.085);
        gain.gain.exponentialRampToValueAtTime(0.16, now + idx * 0.085 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.085 + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.085);
        osc.stop(now + idx * 0.085 + 0.26);
      });
    } else {
      // Distinct 3-note resonant bell chord for alerts/notifications (C5 -> E5 -> C6)
      const notes = [523.25, 659.25, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.13);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.13);
        gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.13 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.13 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.13);
        osc.stop(now + idx * 0.13 + 0.48);
      });
    }
  } catch {
    // Ignore in environments restricting Web Audio
  }
}

/**
 * Plays distinct category sounds (custom device audio if uploaded, otherwise distinct Web Audio chime):
 * - CHAT_MESSAGE ('chat' channel): crisp two-tone chat bubble ping
 * - TRANSACTION_ALERT ('alert' channel): distinct 3-note bell chime
 */
export function playCategoryNotificationSound(
  category: 'CHAT_MESSAGE' | 'TRANSACTION_ALERT',
  soundEnabled: boolean = loadSoundEnabledPref()
): void {
  if (!soundEnabled) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }

  const channel: SoundChannel = category === 'CHAT_MESSAGE' ? 'chat' : 'alert';
  const meta = loadCustomSoundMeta();

  if (meta[channel]) {
    const playFromUrl = (url: string) => {
      try {
        const audio = new Audio(url);
        audio.volume = 0.85;
        void audio.play().catch(() => {
          playSynthCategoryChime(category);
        });
      } catch {
        playSynthCategoryChime(category);
      }
    };

    if (cachedAudioUrl[channel]) {
      playFromUrl(cachedAudioUrl[channel]!);
      return;
    }

    if (!cachedAudioBlobLoaded[channel]) {
      void getStoredSoundBlob(channel).then((blob) => {
        cachedAudioBlobLoaded[channel] = true;
        if (blob) {
          cachedAudioUrl[channel] = URL.createObjectURL(blob);
          playFromUrl(cachedAudioUrl[channel]!);
        } else {
          playSynthCategoryChime(category);
        }
      });
      return;
    }
  }

  playSynthCategoryChime(category);
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
