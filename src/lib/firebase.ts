import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const readEnvStr = (envKey: string, fallback: string): string => {
  const envVal = (import.meta.env[envKey] as string | undefined)?.trim();
  return envVal || (fallback || '').trim();
};

export const RESOLVED_FIREBASE_CONFIG = {
  projectId: readEnvStr('VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId),
  appId: readEnvStr('VITE_FIREBASE_APP_ID', firebaseConfig.appId),
  apiKey: readEnvStr('VITE_FIREBASE_API_KEY', firebaseConfig.apiKey),
  authDomain: readEnvStr('VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain),
  firestoreDatabaseId: readEnvStr(
    'VITE_FIREBASE_DATABASE_ID',
    firebaseConfig.firestoreDatabaseId
  ),
  storageBucket: readEnvStr(
    'VITE_FIREBASE_STORAGE_BUCKET',
    firebaseConfig.storageBucket
  ),
  messagingSenderId: readEnvStr(
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    firebaseConfig.messagingSenderId
  ),
  oAuthClientId: readEnvStr(
    'VITE_FIREBASE_OAUTH_CLIENT_ID',
    firebaseConfig.oAuthClientId
  ),
  measurementId: firebaseConfig.measurementId || '',
  recaptchaSiteKey: firebaseConfig.recaptchaSiteKey || '',
};

export const FIREBASE_CONFIG = RESOLVED_FIREBASE_CONFIG;

export const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_DATABASE_ID',
  'VITE_FIREBASE_OAUTH_CLIENT_ID',
] as const;

export function getFirebaseEnvValidation(): {
  valid: boolean;
  configuredCount: number;
  totalRequired: number;
  missingKeys: string[];
} {
  const keyMap: Record<(typeof REQUIRED_FIREBASE_ENV_KEYS)[number], string> = {
    VITE_FIREBASE_API_KEY: RESOLVED_FIREBASE_CONFIG.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: RESOLVED_FIREBASE_CONFIG.authDomain,
    VITE_FIREBASE_PROJECT_ID: RESOLVED_FIREBASE_CONFIG.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: RESOLVED_FIREBASE_CONFIG.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: RESOLVED_FIREBASE_CONFIG.messagingSenderId,
    VITE_FIREBASE_APP_ID: RESOLVED_FIREBASE_CONFIG.appId,
    VITE_FIREBASE_DATABASE_ID: RESOLVED_FIREBASE_CONFIG.firestoreDatabaseId,
    VITE_FIREBASE_OAUTH_CLIENT_ID: RESOLVED_FIREBASE_CONFIG.oAuthClientId,
  };
  const missingKeys = REQUIRED_FIREBASE_ENV_KEYS.filter(
    (k) => !keyMap[k] || keyMap[k].includes('remixed-')
  );
  return {
    valid: missingKeys.length === 0,
    configuredCount: REQUIRED_FIREBASE_ENV_KEYS.length - missingKeys.length,
    totalRequired: REQUIRED_FIREBASE_ENV_KEYS.length,
    missingKeys,
  };
}

export const HAS_VALID_FIREBASE_CONFIG = getFirebaseEnvValidation().valid;

let appInstance: FirebaseApp;
if (getApps().length > 0) {
  appInstance = getApp();
} else {
  appInstance = initializeApp(RESOLVED_FIREBASE_CONFIG);
}

export const firebaseApp: FirebaseApp = appInstance;
export const auth: Auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// CRITICAL: Pass firestoreDatabaseId explicitly so queries target the provisioned database
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    firebaseApp,
    { experimentalAutoDetectLongPolling: true },
    RESOLVED_FIREBASE_CONFIG.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(firebaseApp, RESOLVED_FIREBASE_CONFIG.firestoreDatabaseId);
}
export const db: Firestore = dbInstance;

export const storage: FirebaseStorage = getStorage(firebaseApp);

// Optional Firebase App Check initialization when reCAPTCHA Enterprise key is configured
let appCheckInitialized = false;
export function initOptionalAppCheck(): boolean {
  if (appCheckInitialized || typeof window === 'undefined') return appCheckInitialized;
  const siteKey =
    (import.meta.env.VITE_FIREBASE_APP_CHECK_KEY as string | undefined)?.trim() ||
    firebaseConfig.recaptchaSiteKey?.trim() ||
    '';
  if (!siteKey) return false;
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface ConnectionStatus {
  connected: boolean;
  offline: boolean;
  message: string;
}

let connectionTested = false;
let connectionPromise: Promise<ConnectionStatus> | null = null;

export async function testConnection(): Promise<ConnectionStatus> {
  if (!HAS_VALID_FIREBASE_CONFIG) {
    return {
      connected: false,
      offline: true,
      message: 'Konfigurasi Firebase belum tersedia.',
    };
  }
  if (connectionPromise) return connectionPromise;
  connectionPromise = (async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      connectionTested = true;
      return {
        connected: true,
        offline: false,
        message: 'Terhubung ke Cloud Firestore.',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('the client is offline')) {
        return {
          connected: false,
          offline: true,
          message: 'Koneksi Cloud Firestore offline.',
        };
      }
      // Permission denied on nonexistent test doc still proves live connectivity to Firestore server
      connectionTested = true;
      return {
        connected: true,
        offline: false,
        message: 'Server Cloud Firestore aktif.',
      };
    }
  })();
  return connectionPromise;
}

export function isConnectionTested(): boolean {
  return connectionTested;
}

if (typeof window !== 'undefined') {
  initOptionalAppCheck();
}
