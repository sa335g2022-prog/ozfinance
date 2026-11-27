import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function registerPwaServiceWorkerWithAutoUpdate(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    let hadActiveController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadActiveController || refreshing) {
        hadActiveController = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        const activateWaiting = (worker: ServiceWorker | null) => {
          if (worker) {
            worker.postMessage({type: 'SKIP_WAITING'});
          }
        };

        if (registration.waiting) {
          activateWaiting(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              activateWaiting(newWorker);
            }
          });
        });

        const checkForUpdate = () => {
          void registration.update().catch(() => undefined);
        };

        // Check immediately and periodically when app returns to foreground
        checkForUpdate();
        window.setInterval(checkForUpdate, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdate();
          }
        });
      })
      .catch((err) => {
        console.warn('PWA service worker registration failed:', err);
      });
  });
}

registerPwaServiceWorkerWithAutoUpdate();

createRoot(document.getElementById('root')!).render(<App />);
