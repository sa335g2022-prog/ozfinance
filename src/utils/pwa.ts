export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWA_DISMISSED_UNTIL_KEY = 'oz_pwa_dismissed_until';
export const PWA_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const matchStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const androidTwa =
    typeof document !== 'undefined' && document.referrer.includes('android-app://');
  return Boolean(matchStandalone || iosStandalone || androidTwa);
}

export function detectIOSBrowser(userAgent?: string): boolean {
  const ua = (
    userAgent ??
    (typeof window !== 'undefined' ? window.navigator.userAgent : '')
  ).toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function shouldShowInstallBanner(params: {
  isInstalled: boolean;
  dismissedUntilMs: number | null;
  nowMs?: number;
}): boolean {
  if (params.isInstalled) return false;
  const now = params.nowMs ?? Date.now();
  if (params.dismissedUntilMs !== null && params.dismissedUntilMs > now) {
    return false;
  }
  return true;
}

export function readDismissedUntilMs(): number | null {
  try {
    const raw = localStorage.getItem(PWA_DISMISSED_UNTIL_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export function saveDismissedUntilMs(untilMs: number): void {
  try {
    localStorage.setItem(PWA_DISMISSED_UNTIL_KEY, String(untilMs));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearDismissedUntil(): void {
  try {
    localStorage.removeItem(PWA_DISMISSED_UNTIL_KEY);
  } catch {
    // Ignore storage quota errors
  }
}
