import { computeSessionSignature, DEFAULT_ADMIN_PASSWORD, isValidSessionPayload } from './finance';
import type { CustomerNotification, ThemeMode, UserSession } from '../types/app';
import { INITIAL_NOTIFICATIONS } from '../data/seed';

export const SESSION_KEY = 'ozdigifinance_auth_session_v1';
export const COOKIE_NAME = 'ozf_session_token';
export const NOTIF_STORAGE_KEY = 'ozf_customer_notifs_v3';
export const CUSTOMER_PASSWORDS_KEY = 'ozf_customer_passwords_v1';
export const ADMIN_PASSWORD_KEY = 'ozf_admin_password_v1';
export const THEME_KEY = 'oz_theme';
export const DISPLAY_NAME_KEY = 'oz_display_name';
export const AVATAR_KEY = 'oz_avatar_url';
export const SOUND_PREF_KEY = 'oz_notif_sound_v1';

export function loadCustomerPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOMER_PASSWORDS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveCustomerPasswords(map: Record<string, string>): void {
  try {
    localStorage.setItem(CUSTOMER_PASSWORDS_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

export function loadAdminPassword(): string {
  try {
    const raw = localStorage.getItem(ADMIN_PASSWORD_KEY);
    if (raw && raw.length > 0) return raw;
  } catch {
    // Ignore
  }
  return DEFAULT_ADMIN_PASSWORD;
}

export function saveAdminPassword(pass: string): void {
  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, pass);
  } catch {
    // Ignore
  }
}

export function createSessionToken(
  role: 'customer' | 'admin',
  userId: string,
  officialName: string,
  whatsapp?: string
): UserSession {
  const now = Date.now();
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const sessionBase = {
    tokenId: 'tok_' + rand,
    userId,
    officialName,
    ...(whatsapp ? { whatsapp } : {}),
    role,
    issuedAt: now,
    expiresAt: now + 365 * 24 * 60 * 60 * 1000,
  };

  return {
    ...sessionBase,
    signature: computeSessionSignature(sessionBase),
  };
}

export function persistSession(session: UserSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors
  }
  const secureFlag = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    session.tokenId + '.' + session.signature
  )}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;
}

export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

export function getValidSession(): UserSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValidSessionPayload(parsed)) {
      return parsed;
    }
    clearPersistedSession();
    return null;
  } catch {
    clearPersistedSession();
    return null;
  }
}

export function loadStoredNotifications(): CustomerNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CustomerNotification[];
    }
  } catch {
    // Fallback
  }
  return INITIAL_NOTIFICATIONS;
}

export function saveStoredNotifications(list: CustomerNotification[]): void {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

export function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore
  }
  return 'light';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
}

let sharedAudioCtx: AudioContext | null = null;

export function unlockAudioContext(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
  } catch {
    // Ignore audio context restrictions
  }
}

export function playNotifChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }

    const now = sharedAudioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5
    notes.forEach((freq, idx) => {
      if (!sharedAudioCtx) return;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.42);

      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.45);
    });
  } catch {
    // Ignore audio failures in headless browsers
  }
}
