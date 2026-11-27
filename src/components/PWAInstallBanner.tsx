import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, CheckCircle2 } from 'lucide-react';
import {
  detectIOSBrowser,
  detectStandaloneMode,
  PWA_REMINDER_COOLDOWN_MS,
  readDismissedUntilMs,
  saveDismissedUntilMs,
  shouldShowInstallBanner,
  type BeforeInstallPromptEvent,
} from '../utils/pwa';

export interface PWAInstallBannerProps {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isIOS?: boolean;
  onPromptConsumed: () => void;
  onInstalled: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  deferredPrompt,
  isInstalled,
  isIOS: isIOSProp,
  onPromptConsumed,
  onInstalled,
}) => {
  const [isIOS, setIsIOS] = useState<boolean>(() => isIOSProp ?? detectIOSBrowser());
  const [dismissedUntilMs, setDismissedUntilMs] = useState<number | null>(() =>
    readDismissedUntilMs()
  );
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setIsIOS(isIOSProp ?? detectIOSBrowser());
  }, [isIOSProp]);

  // If browser fires appinstalled while banner was open, reflect confirmation
  useEffect(() => {
    const onAppInstalled = () => {
      setInstallSuccess(true);
      setShowGuideModal(false);
    };
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('ozf:appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('ozf:appinstalled', onAppInstalled);
    };
  }, []);

  const visible = shouldShowInstallBanner({
    isInstalled: isInstalled || detectStandaloneMode(),
    dismissedUntilMs,
  });

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowGuideModal(true);
      return;
    }

    if (deferredPrompt) {
      try {
        setInstalling(true);
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        onPromptConsumed();
        if (choice.outcome === 'accepted') {
          onInstalled();
          setInstallSuccess(true);
        } else {
          // User dismissed native browser prompt — respect reminder cooldown
          const until = Date.now() + PWA_REMINDER_COOLDOWN_MS;
          setDismissedUntilMs(until);
          saveDismissedUntilMs(until);
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
        setShowGuideModal(true);
      } finally {
        setInstalling(false);
      }
      return;
    }

    setShowGuideModal(true);
  };

  const installHandlerRef = React.useRef(handleInstallClick);
  installHandlerRef.current = handleInstallClick;

  useEffect(() => {
    const onExternalInstallRequest = () => {
      void installHandlerRef.current();
    };
    window.addEventListener('ozf:request-install', onExternalInstallRequest);
    return () => window.removeEventListener('ozf:request-install', onExternalInstallRequest);
  }, []);

  const handleDismiss = () => {
    const until = Date.now() + PWA_REMINDER_COOLDOWN_MS;
    setDismissedUntilMs(until);
    saveDismissedUntilMs(until);
  };

  return (
    <>
      {visible && (
        <aside
          aria-label="Instal Aplikasi PWA"
          data-testid="pwa-install-banner"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 p-4 shadow-2xl text-white relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30 border border-blue-400/30 overflow-hidden">
                <img
                  src="/icon-192.png"
                  alt="Logo OZdigiFinance"
                  className="w-full h-full object-cover"
                />
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
                    data-testid="pwa-install-btn"
                    disabled={installing}
                    onClick={() => void handleInstallClick()}
                    className="flex-1 min-h-[38px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{installing ? 'MEMPROSES...' : 'INSTALL SEKARANG'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="pwa-dismiss-btn"
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
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white border border-blue-500/30 flex items-center justify-center overflow-hidden">
                  <img
                    src="/icon-192.png"
                    alt="Logo OZdigiFinance"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-sm font-bold">Panduan Instalasi PWA</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Tutup panduan instalasi"
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>Browser Safari iOS memerlukan pemasangan melalui menu bagikan:</p>
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
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                  <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p>
                    Dialog instalasi otomatis belum tersedia dari browser saat ini (misalnya karena dibuka lewat WebView/pratinjau atau sedang tidak aktif di Chrome Android).
                  </p>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-200">
                  <li>
                    Pastikan aplikasi dibuka langsung di <strong className="text-blue-400">Google Chrome</strong> atau <strong className="text-blue-400">Edge</strong> (bukan browser dalam aplikasi).
                  </li>
                  <li>
                    Ketuk menu titik tiga (<strong className="text-blue-400">⋮</strong>) di pojok kanan atas, lalu pilih <strong className="text-blue-400">Instal aplikasi</strong> / <strong className="text-blue-400">Tambahkan ke layar utama</strong>.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
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
