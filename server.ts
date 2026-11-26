import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let configJson: Record<string, string> = {};
try {
  configJson = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, string>;
} catch {
  configJson = {};
}

const pickServerFirebaseVal = (envKey: string, jsonKey: string): string =>
  (process.env[envKey] || configJson[jsonKey] || '').trim();

const resolvedServerFirebase = {
  apiKey: pickServerFirebaseVal('VITE_FIREBASE_API_KEY', 'apiKey'),
  authDomain: pickServerFirebaseVal('VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'),
  projectId: pickServerFirebaseVal('VITE_FIREBASE_PROJECT_ID', 'projectId'),
  storageBucket: pickServerFirebaseVal('VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'),
  messagingSenderId: pickServerFirebaseVal('VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'),
  appId: pickServerFirebaseVal('VITE_FIREBASE_APP_ID', 'appId'),
  firestoreDatabaseId: pickServerFirebaseVal('VITE_FIREBASE_DATABASE_ID', 'firestoreDatabaseId'),
  oAuthClientId: pickServerFirebaseVal('VITE_FIREBASE_OAUTH_CLIENT_ID', 'oAuthClientId'),
};

const firebaseProjectId = resolvedServerFirebase.projectId;
const firestoreDatabaseId = resolvedServerFirebase.firestoreDatabaseId;
const configuredEnvCount = Object.values(resolvedServerFirebase).filter(
  (v) => Boolean(v) && !v.includes('remixed-')
).length;
const totalRequiredEnvCount = Object.keys(resolvedServerFirebase).length;
const envVariablesComplete = configuredEnvCount === totalRequiredEnvCount;

const HAS_REAL_FIREBASE =
  Boolean(firebaseProjectId) &&
  firebaseProjectId !== 'remixed-project-id' &&
  firestoreDatabaseId !== 'remixed-firestore-database-id';

const ADMIN_EMAILS = new Set(['sa33.5g.2022@gmail.com', 'alfauzy80@gmail.com']);

// Initialize Firebase Admin SDK with projectId only so verifyIdToken works on every project without IAM
const adminApp = HAS_REAL_FIREBASE
  ? getApps().length > 0
    ? getApp()
    : initializeApp({ projectId: firebaseProjectId })
  : null;

interface AuthedRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

async function requireFirebaseAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!adminApp) {
    res.status(503).json({ error: 'Firebase project belum dikonfigurasi.' });
    return;
  }
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token otorisasi Bearer diperlukan.' });
    return;
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Token kosong.' });
    return;
  }
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(idToken);
    req.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token Firebase tidak valid atau kedaluwarsa.' });
  }
}

function isVerifiedAdminToken(user?: DecodedIdToken): boolean {
  if (!user || !user.email || !user.email_verified) return false;
  return ADMIN_EMAILS.has(user.email.toLowerCase());
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      firebaseConfigured: HAS_REAL_FIREBASE,
      envVariablesComplete,
      configuredEnvCount,
      totalRequiredEnvCount,
      projectId: HAS_REAL_FIREBASE ? firebaseProjectId : null,
      firestoreDatabaseId: HAS_REAL_FIREBASE ? firestoreDatabaseId : null,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/auth/verify', requireFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const user = req.firebaseUser!;
    const isAdmin = isVerifiedAdminToken(user);
    res.json({
      verified: true,
      uid: user.uid,
      email: user.email || null,
      emailVerified: Boolean(user.email_verified),
      role: isAdmin ? 'admin' : 'customer',
    });
  });

  app.post('/api/transactions/audit-check', requireFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const user = req.firebaseUser!;
    if (!isVerifiedAdminToken(user)) {
      res.status(403).json({ error: 'Hanya Admin terverifikasi yang dapat memvalidasi transaksi.' });
      return;
    }
    const body = req.body as {
      transactionId?: unknown;
      customerId?: unknown;
      nominal?: unknown;
      sisaTagihan?: unknown;
    };

    if (
      typeof body.transactionId !== 'string' ||
      !/^[a-zA-Z0-9_\-]+$/.test(body.transactionId) ||
      typeof body.customerId !== 'string' ||
      typeof body.nominal !== 'number' ||
      !Number.isFinite(body.nominal) ||
      body.nominal <= 0 ||
      typeof body.sisaTagihan !== 'number' ||
      !Number.isFinite(body.sisaTagihan) ||
      body.sisaTagihan < 0
    ) {
      res.status(400).json({ error: 'Payload transaksi tidak valid.' });
      return;
    }

    res.json({
      valid: true,
      transactionId: body.transactionId,
      verifiedByUid: user.uid,
      verifiedAt: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`OZdigiFinance server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
