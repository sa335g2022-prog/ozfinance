import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  let firebaseConfig: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(
      path.resolve(__dirname, 'firebase-applet-config.json'),
      'utf8'
    );
    firebaseConfig = JSON.parse(raw) as Record<string, string>;
  } catch {
    firebaseConfig = {};
  }

  const pickEnv = (key: string, fallbackKey: string): string => {
    const fromEnv = (process.env[key] || '').trim();
    if (fromEnv) return fromEnv;
    return (firebaseConfig[fallbackKey] || '').trim();
  };

  const viteFirebaseDefine: Record<string, string> = {
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(
      pickEnv('VITE_FIREBASE_API_KEY', 'apiKey')
    ),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(
      pickEnv('VITE_FIREBASE_AUTH_DOMAIN', 'authDomain')
    ),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(
      pickEnv('VITE_FIREBASE_PROJECT_ID', 'projectId')
    ),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(
      pickEnv('VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket')
    ),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(
      pickEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId')
    ),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(
      pickEnv('VITE_FIREBASE_APP_ID', 'appId')
    ),
    'import.meta.env.VITE_FIREBASE_DATABASE_ID': JSON.stringify(
      pickEnv('VITE_FIREBASE_DATABASE_ID', 'firestoreDatabaseId')
    ),
    'import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID': JSON.stringify(
      pickEnv('VITE_FIREBASE_OAUTH_CLIENT_ID', 'oAuthClientId')
    ),
  };

  return {
    define: viteFirebaseDefine,
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
