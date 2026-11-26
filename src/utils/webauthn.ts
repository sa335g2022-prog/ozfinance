export interface StoredWebAuthnCredential {
  credentialId: string;
  role: 'customer' | 'admin';
  userId: string;
  identifier: string;
  displayName: string;
  createdAt: number;
}

export const WEBAUTHN_CREDS_KEY = 'ozf_webauthn_creds_v1';

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get)
  );
}

export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export function loadWebAuthnCredentials(): StoredWebAuthnCredential[] {
  try {
    const raw = localStorage.getItem(WEBAUTHN_CREDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredWebAuthnCredential =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof (item as StoredWebAuthnCredential).credentialId === 'string' &&
            ((item as StoredWebAuthnCredential).role === 'customer' ||
              (item as StoredWebAuthnCredential).role === 'admin') &&
            typeof (item as StoredWebAuthnCredential).userId === 'string'
        )
    );
  } catch {
    return [];
  }
}

export function saveWebAuthnCredentials(creds: StoredWebAuthnCredential[]): void {
  try {
    localStorage.setItem(WEBAUTHN_CREDS_KEY, JSON.stringify(creds));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeWebAuthnCredential(role: 'customer' | 'admin', userId: string): void {
  const next = loadWebAuthnCredentials().filter(
    (c) => !(c.role === role && c.userId === userId)
  );
  saveWebAuthnCredentials(next);
}

function formatWebAuthnError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') {
      return 'Verifikasi sidik jari dibatalkan atau waktu habis.';
    }
    if (err.name === 'SecurityError') {
      return 'Akses sensor sidik jari diblokir oleh kebijakan keamanan browser/domain ini.';
    }
    if (err.name === 'NotSupportedError') {
      return 'Perangkat atau browser ini tidak mendukung autentikasi sidik jari (WebAuthn).';
    }
    if (err.name === 'InvalidStateError') {
      return 'Sidik jari perangkat sudah terdaftar sebelumnya.';
    }
    return `Gagal mengakses sidik jari (${err.name}): ${err.message}`;
  }
  return 'Gagal melakukan autentikasi sidik jari pada perangkat ini.';
}

export async function registerWebAuthnFingerprint(params: {
  role: 'customer' | 'admin';
  userId: string;
  identifier: string;
  displayName: string;
}): Promise<{ ok: true; credential: StoredWebAuthnCredential } | { ok: false; error: string }> {
  if (!isWebAuthnSupported()) {
    return {
      ok: false,
      error: 'Browser atau perangkat ini belum mendukung WebAuthn Fingerprint.',
    };
  }

  try {
    const challengeBuffer = new ArrayBuffer(32);
    const challenge = new Uint8Array(challengeBuffer);
    crypto.getRandomValues(challenge);

    const encodedUserId = new TextEncoder().encode(`${params.role}:${params.userId}`);
    const userIdBuffer = new ArrayBuffer(encodedUserId.byteLength);
    new Uint8Array(userIdBuffer).set(encodedUserId);

    const created = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'OZdigiFinance',
        },
        user: {
          id: new Uint8Array(userIdBuffer),
          name: params.identifier,
          displayName: params.displayName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    });

    if (!(created instanceof PublicKeyCredential)) {
      return { ok: false, error: 'Pendaftaran sidik jari tidak mengembalikan kredensial valid.' };
    }

    const record: StoredWebAuthnCredential = {
      credentialId: bufferToBase64Url(created.rawId),
      role: params.role,
      userId: params.userId,
      identifier: params.identifier,
      displayName: params.displayName,
      createdAt: Date.now(),
    };

    const existing = loadWebAuthnCredentials().filter(
      (c) => !(c.role === params.role && c.userId === params.userId)
    );
    saveWebAuthnCredentials([...existing, record]);

    return { ok: true, credential: record };
  } catch (err) {
    return { ok: false, error: formatWebAuthnError(err) };
  }
}

export async function authenticateWebAuthnFingerprint(
  roleFilter?: 'customer' | 'admin'
): Promise<{ ok: true; credential: StoredWebAuthnCredential } | { ok: false; error: string }> {
  if (!isWebAuthnSupported()) {
    return {
      ok: false,
      error: 'Browser atau perangkat ini belum mendukung WebAuthn Fingerprint.',
    };
  }

  const allCreds = loadWebAuthnCredentials();
  const candidates = roleFilter
    ? allCreds.filter((c) => c.role === roleFilter)
    : allCreds;

  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        roleFilter === 'admin'
          ? 'Belum ada sidik jari Admin terdaftar di perangkat ini. Masuk dengan email & password dulu lalu daftarkan sidik jari di menu Profil.'
          : 'Belum ada sidik jari Nasabah terdaftar di perangkat ini. Masuk dengan No. WA & password dulu lalu daftarkan sidik jari di menu Profil.',
    };
  }

  try {
    const challengeBuffer = new ArrayBuffer(32);
    const challenge = new Uint8Array(challengeBuffer);
    crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: candidates.map((c) => ({
          id: base64UrlToUint8Array(c.credentialId),
          type: 'public-key' as const,
        })),
        userVerification: 'required',
        timeout: 60_000,
      },
    });

    if (!(assertion instanceof PublicKeyCredential)) {
      return { ok: false, error: 'Autentikasi sidik jari gagal diverifikasi.' };
    }

    const returnedId = bufferToBase64Url(assertion.rawId);
    const matched = candidates.find((c) => c.credentialId === returnedId) ?? candidates[0];
    return { ok: true, credential: matched };
  } catch (err) {
    return { ok: false, error: formatWebAuthnError(err) };
  }
}
