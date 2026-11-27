// OZdigiFinance PWA Service Worker with Auto-Update & Offline Fallback
const CACHE_NAME = 'ozdigifinance-pwa-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('ozdigifinance-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Never intercept cross-origin APIs (Firebase, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Always bypass dynamic backend routes, manifest files, and service worker scripts
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/service-worker.js' ||
    url.pathname === '/firebase-messaging-sw.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json'
  ) {
    return;
  }

  // Network-first for HTML navigation requests so app auto-updates immediately
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'));
          return cached || Response.error();
        })
    );
    return;
  }

  // Cache-first with background refresh for static assets (JS/CSS/PNG/ICO)
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const networkFetch = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok && networkRes.type === 'basic') {
            const copy = networkRes.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => cachedRes || Response.error());

      return cachedRes || networkFetch;
    })
  );
});
