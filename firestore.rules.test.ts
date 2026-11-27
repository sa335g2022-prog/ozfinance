import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

test('firestore.rules enforces global default-deny and strict rules_version 2', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s+write:\s+if\s+false;\s*\}/);
});

test('firestore.rules validates IDs strictly and prevents get/exists inside allow list', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  assert.match(rules, /function\s+isValidId\(id\)/);
  assert.match(rules, /function\s+isAdminToken\(\)/);

  const listLines = rules
    .split('\n')
    .filter((line) => line.includes('allow list:'));
  assert.ok(listLines.length >= 8);
  for (const line of listLines) {
    assert.equal(line.includes('get('), false, `Unsafe get() in list rule: ${line}`);
    assert.equal(line.includes('exists('), false, `Unsafe exists() in list rule: ${line}`);
    assert.equal(line.includes('isAdmin()'), false, `isAdmin() calls exists() — must use isAdminToken(): ${line}`);
  }
});

test('firestore.rules forbids client deletion of ledger transactions and customer system messages', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  assert.match(rules, /match\s+\/transactions\/\{transactionId\}[\s\S]*allow\s+create:\s+if\s+isVerifiedUser\(\)[\s\S]*isAdmin\(\)/);
  assert.match(rules, /match\s+\/transactions\/\{transactionId\}[\s\S]*allow\s+delete:\s+if\s+false;/);
  assert.match(rules, /incoming\(\)\.messageType\s*!=\s*'system_payment'/);
  assert.match(rules, /incoming\(\)\.senderRole\s*==\s*'customer'/);
});

test('firebase-blueprint.json covers all core domain entities and indexes exist', () => {
  const bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8')) as {
    entities?: Record<string, unknown>;
    firestore?: Record<string, unknown>;
  };
  assert.ok(bp.entities);
  assert.ok(bp.firestore);
  const expectedPaths = [
    '/admins/{adminId}',
    '/users/{userId}',
    '/customers/{customerId}',
    '/savingsAccounts/{accountId}',
    '/conversations/{conversationId}',
    '/conversations/{conversationId}/messages/{messageId}',
    '/transactions/{transactionId}',
    '/notifications/{notificationId}',
    '/deviceTokens/{tokenId}',
  ];
  for (const p of expectedPaths) {
    assert.ok(p in (bp.firestore || {}), `Missing collection path in blueprint: ${p}`);
  }
});

test('Firebase environment variables are auto-populated from firebase-applet-config.json without manual .env.example prompts', () => {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, string>;
  const envText = fs.readFileSync(envPath, 'utf-8');
  const envExampleText = fs.readFileSync(envExamplePath, 'utf-8');

  assert.equal(
    envExampleText.includes('VITE_FIREBASE_'),
    false,
    '.env.example must not declare VITE_FIREBASE_* variables that trigger manual secret prompts'
  );

  const requiredPairs: [string, string][] = [
    ['VITE_FIREBASE_API_KEY', cfg.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', cfg.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', cfg.projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', cfg.storageBucket],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', cfg.messagingSenderId],
    ['VITE_FIREBASE_APP_ID', cfg.appId],
    ['VITE_FIREBASE_DATABASE_ID', cfg.firestoreDatabaseId],
    ['VITE_FIREBASE_OAUTH_CLIENT_ID', cfg.oAuthClientId],
  ];

  for (const [envKey, expectedVal] of requiredPairs) {
    assert.ok(expectedVal && !expectedVal.includes('remixed-'), `Invalid ${envKey} source value`);
    assert.ok(
      envText.includes(`${envKey}=${expectedVal}`),
      `Missing or mismatched ${envKey} in .env`
    );
  }
});
