/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

// Public Firebase Web App config (matches firebase-applet-config.json)
const firebaseConfig = {
  apiKey: 'AIzaSyCoJCde2o4n0_pCxkfKmTlu7u5J6_O1yJw',
  authDomain: 'gen-lang-client-0844275464.firebaseapp.com',
  projectId: 'gen-lang-client-0844275464',
  storageBucket: 'gen-lang-client-0844275464.firebasestorage.app',
  messagingSenderId: '15396321415',
  appId: '1:15396321415:web:98206717e9f0855e386022',
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// Synchronously register background push handler (prevents duplicate notifications when data-only payloads are used)
messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const notif = payload?.notification || {};
  const title = notif.title || data.title || 'OZdigiFinance';
  const body = notif.body || data.body || 'Ada pembaruan pesan atau transaksi.';
  const notifType = data.type || 'CHAT_MESSAGE';
  const tag =
    data.transactionId ||
    data.messageId ||
    data.conversationId ||
    'ozdigifinance-notif';

  const options = {
    body,
    tag,
    renotify: true,
    requireInteraction: notifType === 'TRANSACTION_ALERT',
    vibrate: notifType === 'TRANSACTION_ALERT' ? [200, 100, 200] : [140],
    silent: false,
    data: {
      url: data.clickUrl || '/',
      type: notifType,
      conversationId: data.conversationId || '',
      transactionId: data.transactionId || '',
    },
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl =
    data.conversationId
      ? `/?open=chat&conversationId=${encodeURIComponent(data.conversationId)}`
      : data.transactionId
      ? `/?open=transaction&transactionId=${encodeURIComponent(data.transactionId)}`
      : data.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'OZF_NOTIFICATION_CLICK',
              payload: data,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
