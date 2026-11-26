import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const until = localStorage.getItem('oz_pwa_dismissed_until');
      if (until && Number(until) > Date.now()) return true;
    } catch {}
    return false;
  });
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(standalone);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallSuccess(true);
      try {
        localStorage.setItem('oz_pwa_installed', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setInstallSuccess(true);
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    } else {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('oz_pwa_dismissed_until', String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {}
  };

  return (
    <>
      <aside
        aria-label="Instal Aplikasi PWA"
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
      >
        <div className="rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 p-4 shadow-2xl text-white relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30 border border-blue-400/30">
              <Smartphone className="w-6 h-6 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold tracking-wide uppercase text-blue-400">
                  INSTAL APLIKASI SEKARANG
                </h3>
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Tutup banner"
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Instal aplikasi untuk akses lebih cepat, mudah, dan nyaman langsung dari layar utama perangkat Anda.
              </p>

              <div className="mt-3.5 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="flex-1 min-h-[38px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>INSTALL SEKARANG</span>
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  NANTI SAJA
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold">Panduan Instalasi PWA</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>Browser Safari iOS memerlukan beberapa langkah manual sederhana:</p>
                <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-200">
                  <li>
                    Tekan tombol <strong className="text-blue-400">Share</strong> (ikon kotak dengan panah ke atas) di bilah Safari.
                  </li>
                  <li>
                    Gulir ke bawah dan ketuk <strong className="text-blue-400">Add to Home Screen</strong> (Tambahkan ke Layar Utama).
                  </li>
                  <li>Konfirmasi dengan menekan <strong className="text-blue-400">Add</strong>.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>
                  Browser Anda siap memasang aplikasi. Jika prompt otomatis tidak muncul, Anda dapat menggunakan menu titik tiga (<strong className="text-blue-400">⋮</strong>) di sudut kanan atas browser Chrome, lalu pilih <strong className="text-blue-400">Install app</strong> atau <strong className="text-blue-400">Add to Home screen</strong>.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {installSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/40 p-6 text-white shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold">Aplikasi Berhasil Dipasang!</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              OZdigiFinance kini terinstal di perangkat Anda dan dapat diakses langsung dari layar utama dalam mode standalone.
            </p>
            <button
              type="button"
              onClick={() => setInstallSuccess(false)}
              className="w-full min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
            >
              Buka Aplikasi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
