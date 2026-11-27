import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Cloud,
  Eye,
  EyeOff,
  Fingerprint,
  Home,
  KeyRound,
  LogOut,
  Mail,
  Music,
  Phone,
  Plus,
  RotateCcw,
  RotateCw,
  Shield,
  Trash2,
  Upload,
  User,
  UserPlus,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import type { PushSetupStatus } from '../lib/firebase-messaging';
import {
  clearDeviceSound,
  loadCustomSoundMeta,
  playCategoryNotificationSound,
  saveDeviceSound,
  type CustomSoundMeta,
  type SoundChannel,
} from '../lib/notifications';
import type {
  CustomerNotification,
  CustomerRegistryItem,
  LoanItem,
  SavingsAccount,
  SavingsFrequency,
  ViewRole,
} from '../types/app';
import {
  ADMIN_EMAIL,
  buildLoanItem,
  formatRupiah,
  generateNextCustomerId,
  summarizeCustomerFromLoans,
  verifyAdminLogin,
  verifyCustomerLogin,
} from '../utils/finance';
import {
  authenticateWebAuthnFingerprint,
  isWebAuthnSupported,
  loadWebAuthnCredentials,
  registerWebAuthnFingerprint,
  removeWebAuthnCredential,
} from '../utils/webauthn';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  maxWidthClass?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  maxWidthClass = 'max-w-[470px]',
  headerActions,
  children,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          <div className="flex items-center gap-1.5">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label={`Tutup ${title}`}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

interface DeviceSoundControlsProps {
  soundEnabled: boolean;
  onToast: (msg: string) => void;
}

const DeviceSoundControls: React.FC<DeviceSoundControlsProps> = ({ soundEnabled, onToast }) => {
  const [soundMeta, setSoundMeta] = useState<Record<SoundChannel, CustomSoundMeta | null>>(() =>
    loadCustomSoundMeta()
  );
  const chatAudioRef = useRef<HTMLInputElement | null>(null);
  const alertAudioRef = useRef<HTMLInputElement | null>(null);

  const handleUploadSound = async (channel: SoundChannel, file?: File | null) => {
    if (!file) return;
    try {
      const saved = await saveDeviceSound(channel, file);
      setSoundMeta(loadCustomSoundMeta());
      playCategoryNotificationSound(
        channel === 'chat' ? 'CHAT_MESSAGE' : 'TRANSACTION_ALERT',
        true
      );
      onToast(
        `Nada ${channel === 'chat' ? 'Pesan' : 'Pemberitahuan'} diubah ke "${saved.name}".`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat nada perangkat.');
    }
  };

  const handleResetSound = async (channel: SoundChannel) => {
    await clearDeviceSound(channel);
    setSoundMeta(loadCustomSoundMeta());
    onToast(
      `Nada ${channel === 'chat' ? 'Pesan' : 'Pemberitahuan'} dikembalikan ke nada bawaan.`
    );
  };

  const rows: {
    channel: SoundChannel;
    label: string;
    defaultLabel: string;
    category: 'CHAT_MESSAGE' | 'TRANSACTION_ALERT';
    inputRef: React.RefObject<HTMLInputElement | null>;
    testIdUpload: string;
    testIdTest: string;
  }[] = [
    {
      channel: 'chat',
      label: 'Nada Pesan (Chat)',
      defaultLabel: 'Nada Bawaan Pesan',
      category: 'CHAT_MESSAGE',
      inputRef: chatAudioRef,
      testIdUpload: 'upload-chat-sound-input',
      testIdTest: 'test-chat-sound-btn',
    },
    {
      channel: 'alert',
      label: 'Nada Pemberitahuan',
      defaultLabel: 'Nada Bawaan Pemberitahuan',
      category: 'TRANSACTION_ALERT',
      inputRef: alertAudioRef,
      testIdUpload: 'upload-alert-sound-input',
      testIdTest: 'test-alert-sound-btn',
    },
  ];

  return (
    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/80">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
          <Music className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Nada Notifikasi (Pesan vs Pemberitahuan)</span>
        </span>
      </div>

      {rows.map((row) => {
        const current = soundMeta[row.channel];
        return (
          <div
            key={row.channel}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <strong className="block text-[11px] font-bold text-slate-900 dark:text-white">
                {row.label}
              </strong>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {current ? current.name : row.defaultLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <input
                ref={row.inputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                data-testid={row.testIdUpload}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  void handleUploadSound(row.channel, file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                data-testid={row.testIdTest}
                onClick={() => playCategoryNotificationSound(row.category, soundEnabled || true)}
                className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500"
              >
                Tes
              </button>
              <button
                type="button"
                onClick={() => row.inputRef.current?.click()}
                className="min-h-[30px] px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1 hover:border-blue-500"
              >
                <Upload className="w-3 h-3" />
                <span>Dari Perangkat</span>
              </button>
              {current && (
                <button
                  type="button"
                  onClick={() => void handleResetSound(row.channel)}
                  className="min-h-[30px] px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* =====================================================================
   1. CUSTOMER NOTIFICATION CENTER MODAL
   ===================================================================== */
interface NotifCenterModalProps {
  notifications: CustomerNotification[];
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  pushPermission?: NotificationPermission | 'unsupported';
  onEnablePush?: () => void;
  onTestChime: () => void;
  onMarkAllRead: () => void;
  onMarkSingleRead: (id: string) => void;
  onOpenTarget?: (notif: CustomerNotification) => void;
  onToast?: (msg: string) => void;
  onClose: () => void;
}

export const NotifCenterModal: React.FC<NotifCenterModalProps> = ({
  notifications,
  soundEnabled = true,
  onToggleSound,
  pushPermission,
  onEnablePush,
  onTestChime,
  onMarkAllRead,
  onMarkSingleRead,
  onOpenTarget,
  onToast,
  onClose,
}) => {
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  return (
    <ModalShell
      title="Pemberitahuan"
      onClose={onClose}
      headerActions={
        <>
          {onToggleSound && (
            <button
              type="button"
              data-testid="notif-sound-toggle-btn"
              onClick={onToggleSound}
              aria-pressed={soundEnabled}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 hover:border-blue-500"
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
              )}
              <span>{soundEnabled ? 'Suara Aktif' : 'Suara Mati'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSoundPicker((v) => !v)}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 hover:border-blue-500"
          >
            <Music className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Nada</span>
          </button>
          <button
            type="button"
            onClick={onMarkAllRead}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500"
          >
            Tandai Dibaca
          </button>
        </>
      }
    >
      {showSoundPicker && (
        <div className="mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Uji &amp; Tambah Nada dari Perangkat
            </span>
            <button
              type="button"
              onClick={onTestChime}
              className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold"
            >
              Tes Pemberitahuan
            </button>
          </div>
          <DeviceSoundControls
            soundEnabled={soundEnabled}
            onToast={onToast ?? (() => undefined)}
          />
        </div>
      )}

      {onEnablePush && pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
        <div className="mb-3 p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate">
              Aktifkan push notification agar tetap masuk saat tab ditutup.
            </span>
          </div>
          <button
            type="button"
            onClick={onEnablePush}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shrink-0"
          >
            Aktifkan
          </button>
        </div>
      )}

      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {notifications.length === 0 ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
            Belum ada pemberitahuan baru.
          </p>
        ) : (
          notifications.map((n) => {
            const Icon =
              n.category === 'pay' ? CheckCircle2 : n.category === 'warn' ? Clock : Wallet;
            const iconColor =
              n.category === 'pay'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                : n.category === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400';

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  onMarkSingleRead(n.id);
                  if (onOpenTarget && (n.conversationId || n.transactionId)) {
                    onOpenTarget(n);
                  }
                }}
                className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                  n.unread
                    ? 'border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-bold text-slate-900 dark:text-white">
                      {n.title}
                    </strong>
                    {n.unread && (
                      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 shrink-0">
                        Baru
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {n.desc}
                  </p>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                    {n.time}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </ModalShell>
  );
};

/* =====================================================================
   2. PROFILE & PHOTO CROPPER + PASSWORD + WEBAUTHN MODAL
   ===================================================================== */
interface ProfileModalProps {
  currentView: ViewRole;
  isAdminSession: boolean;
  activeUserId: string;
  activeUserIdentifier: string;
  displayName: string;
  officialName: string;
  firebaseEmail?: string | null;
  firebaseConnected?: boolean;
  pendingSyncCount?: number;
  onLinkFirebaseGoogle?: () => Promise<void> | void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  pushStatus?: PushSetupStatus | null;
  onEnablePush?: () => Promise<void> | void;
  onSwitchRole: (role: 'customer' | 'admin') => void;
  onPreviewGuest: () => void;
  onSaveProfile: (newName: string, avatarDataUrl: string, newPassword: string) => void;
  onRequestLogout: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  currentView,
  isAdminSession,
  activeUserId,
  activeUserIdentifier,
  displayName,
  officialName,
  firebaseEmail,
  firebaseConnected = true,
  pendingSyncCount = 0,
  onLinkFirebaseGoogle,
  soundEnabled = true,
  onToggleSound,
  pushStatus,
  onEnablePush,
  onSwitchRole,
  onPreviewGuest,
  onSaveProfile,
  onRequestLogout,
  onClose,
  onToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    x: number;
    y: number;
  }>({ dragging: false, startX: 0, startY: 0, x: 0, y: 0 });

  const [zoomPct, setZoomPct] = useState(100);
  const [rotDeg, setRotDeg] = useState(0);
  const [nameInput, setNameInput] = useState(displayName);
  const [passInput, setPassInput] = useState('');
  const [showPass, setShowPass] = useState(false);

  const accountRole: 'customer' | 'admin' = currentView === 'admin' ? 'admin' : 'customer';
  const [fpRegistered, setFpRegistered] = useState<boolean>(() =>
    loadWebAuthnCredentials().some(
      (c) => c.role === accountRole && c.userId === activeUserId
    )
  );
  const [fpBusy, setFpBusy] = useState(false);
  const [fpStatusMsg, setFpStatusMsg] = useState<string | null>(null);

  const drawCrop = useCallback(
    (zoomVal = zoomPct, rotVal = rotDeg, nameVal = nameInput) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2 + dragRef.current.x, h / 2 + dragRef.current.y);
      ctx.rotate((rotVal * Math.PI) / 180);
      ctx.scale(zoomVal / 100, zoomVal / 100);

      const img = imgRef.current;
      if (img) {
        const ratio = Math.max(w / img.width, h / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        grad.addColorStop(0, '#2563eb');
        grad.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 64px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials =
          nameVal
            .trim()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .map((s) => s[0] || '')
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'BD';
        ctx.fillText(initials, 0, 4);
      }
      ctx.restore();
    },
    [zoomPct, rotDeg, nameInput]
  );

  useEffect(() => {
    drawCrop();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawCrop]);

  const scheduleDraw = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawCrop();
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result;
      if (typeof src !== 'string') return;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        dragRef.current = { dragging: false, startX: 0, startY: 0, x: 0, y: 0 };
        setZoomPct(100);
        setRotDeg(0);
        drawCrop(100, 0, nameInput);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const stepRotate = (delta: number) => {
    setRotDeg((prev) => {
      let next = (prev + delta) % 360;
      if (next < 0) next += 360;
      return next;
    });
  };

  const resetCrop = () => {
    dragRef.current = { dragging: false, startX: 0, startY: 0, x: 0, y: 0 };
    setZoomPct(100);
    setRotDeg(0);
  };

  const handleSave = () => {
    if (passInput && passInput.trim().length < 4) {
      onToast('Password baru minimal 4 karakter.');
      return;
    }
    const dataUrl = canvasRef.current ? canvasRef.current.toDataURL('image/png') : '';
    onSaveProfile(nameInput.trim(), dataUrl, passInput.trim());
  };

  const handleRegisterFingerprint = async () => {
    setFpBusy(true);
    setFpStatusMsg(null);
    const res = await registerWebAuthnFingerprint({
      role: accountRole,
      userId: activeUserId,
      identifier: activeUserIdentifier,
      displayName: displayName || officialName,
    });
    setFpBusy(false);
    if (res.ok) {
      setFpRegistered(true);
      setFpStatusMsg('Sidik jari perangkat berhasil didaftarkan untuk login biometrik.');
      onToast('Sidik jari asli berhasil didaftarkan!');
    } else {
      setFpStatusMsg(res.error);
      onToast(res.error);
    }
  };

  const handleRemoveFingerprint = () => {
    removeWebAuthnCredential(accountRole, activeUserId);
    setFpRegistered(false);
    setFpStatusMsg('Sidik jari untuk akun ini dihapus dari perangkat.');
    onToast('Sidik jari dihapus dari perangkat.');
  };

  return (
    <ModalShell title="Edit Data Profil & Pengaturan" onClose={onClose}>
      {/* Quick Role Switcher */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-4">
        <button
          type="button"
          onClick={() => {
            onSwitchRole('customer');
            onClose();
          }}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            currentView === 'customer'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <User className="w-3.5 h-3.5 shrink-0" />
          <span>Nasabah {officialName}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onSwitchRole('admin');
            onClose();
          }}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            currentView === 'admin'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>{isAdminSession ? 'Mode Admin' : 'Login Admin'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onPreviewGuest();
            onClose();
          }}
          className={`min-h-[36px] px-2 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            currentView === 'guest'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Home className="w-3.5 h-3.5 shrink-0" />
          <span>Lihat Tamu</span>
        </button>
      </div>

      {/* Crop Stage */}
      <div className="flex flex-col items-center gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 mb-4">
        <canvas
          ref={canvasRef}
          width={240}
          height={240}
          title="Geser foto untuk mengatur posisi crop"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current.dragging = true;
            dragRef.current.startX = e.clientX - dragRef.current.x;
            dragRef.current.startY = e.clientY - dragRef.current.y;
          }}
          onPointerMove={(e) => {
            if (!dragRef.current.dragging) return;
            dragRef.current.x = e.clientX - dragRef.current.startX;
            dragRef.current.y = e.clientY - dragRef.current.startY;
            scheduleDraw();
          }}
          onPointerUp={() => {
            dragRef.current.dragging = false;
          }}
          onPointerCancel={() => {
            dragRef.current.dragging = false;
          }}
          className="w-40 h-40 rounded-full border-3 border-blue-600 cursor-grab active:cursor-grabbing touch-none shadow-md bg-slate-200 dark:bg-slate-700"
        />
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Geser foto dalam lingkaran · Zoom &amp; Putar 360°
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-label="Pilih foto profil"
          className="text-[11px] max-w-[230px] text-slate-600 dark:text-slate-300"
        />
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="crop-zoom"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Zoom Foto (<span className="tabular-nums">{zoomPct}</span>%)
          </label>
          <input
            id="crop-zoom"
            type="range"
            className="oz-range"
            min={50}
            max={300}
            value={zoomPct}
            onChange={(e) => setZoomPct(Number(e.target.value))}
          />
        </div>

        <div>
          <label
            htmlFor="crop-rot"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Putar Foto (<span className="tabular-nums">{rotDeg}</span>°)
          </label>
          <input
            id="crop-rot"
            type="range"
            className="oz-range"
            min={0}
            max={360}
            value={rotDeg}
            onChange={(e) => setRotDeg(Number(e.target.value))}
          />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              type="button"
              onClick={() => stepRotate(-90)}
              className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={() => stepRotate(90)}
              className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>+90°</span>
            </button>
            <button
              type="button"
              onClick={resetCrop}
              className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            >
              Reset
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="edit-display-name"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Nama Tampilan Akun (Tidak mengubah nama resmi {officialName} di data Admin)
          </label>
          <input
            id="edit-display-name"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="edit-pass"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            {currentView === 'admin'
              ? 'Ganti Password Admin (Minimal 4 karakter)'
              : 'Ganti Password Login Anda (Minimal 4 karakter)'}
          </label>
          <div className="flex gap-2">
            <input
              id="edit-pass"
              type={showPass ? 'text' : 'password'}
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="Kosongkan jika tidak ingin ubah password"
              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Real WebAuthn Biometric Fingerprint Enrollment */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <strong className="text-xs font-bold text-slate-900 dark:text-white">
                Sidik Jari Perangkat (WebAuthn Asli)
              </strong>
            </div>
            <span
              className={`text-[11px] font-bold ${
                fpRegistered
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {fpRegistered ? 'Terdaftar' : 'Belum Terdaftar'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Gunakan sensor sidik jari / biometrik asli perangkat ini untuk masuk cepat tanpa mengetik password.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="register-fingerprint-btn"
              disabled={fpBusy || !isWebAuthnSupported()}
              onClick={() => void handleRegisterFingerprint()}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>
                {fpBusy
                  ? 'Menunggu Sensor...'
                  : fpRegistered
                  ? 'Perbarui Sidik Jari'
                  : 'Daftarkan Sidik Jari'}
              </span>
            </button>

            {fpRegistered && (
              <button
                type="button"
                onClick={handleRemoveFingerprint}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 text-xs font-semibold"
              >
                Hapus
              </button>
            )}
          </div>

          {fpStatusMsg && (
            <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
              {fpStatusMsg}
            </p>
          )}
        </div>

        {/* Firebase Cloud & Push Notification Preferences */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <strong className="text-xs font-bold text-slate-900 dark:text-white truncate">
                Firebase Cloud &amp; Notifikasi
              </strong>
            </div>
            <span
              data-testid="profile-firebase-status"
              className={`text-[11px] font-semibold truncate ${
                firebaseEmail
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {firebaseEmail
                ? pendingSyncCount > 0
                  ? `${firebaseEmail} · Sinkronisasi (${pendingSyncCount})`
                  : `Sinkron Cloud: ${firebaseEmail}`
                : firebaseConnected
                ? 'Mode Lokal · Belum Taut Cloud'
                : 'Mode Lokal Offline'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onToggleSound && (
              <button
                type="button"
                data-testid="profile-sound-toggle-btn"
                onClick={onToggleSound}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span>{soundEnabled ? 'Suara Notifikasi: Aktif' : 'Suara Notifikasi: Nonaktif'}</span>
              </button>
            )}

            {onEnablePush && (
              <button
                type="button"
                data-testid="profile-enable-push-btn"
                onClick={() => void onEnablePush()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>
                  {pushStatus?.token
                    ? 'Push FCM Aktif'
                    : pushStatus?.permission === 'granted'
                    ? 'Push Perangkat Aktif'
                    : 'Aktifkan Push Notification'}
                </span>
              </button>
            )}

            {!firebaseEmail && onLinkFirebaseGoogle && (
              <button
                type="button"
                data-testid="profile-link-google-btn"
                onClick={() => void onLinkFirebaseGoogle()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold inline-flex items-center gap-1.5 hover:border-blue-500"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Sinkronkan Cloud Firebase</span>
              </button>
            )}
          </div>

          {pushStatus?.error && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              {pushStatus.error}
            </p>
          )}

          <DeviceSoundControls soundEnabled={soundEnabled} onToast={onToast} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onRequestLogout}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs font-bold inline-flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Simpan
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

/* =====================================================================
   3. AUTH MODAL (WA + PASSWORD LOGIN, REGISTER NASABAH BARU, ADMIN LOGIN, + WEBAUTHN)
   ===================================================================== */
interface AuthModalProps {
  mode: 'login' | 'register';
  initialTab?: 'customer' | 'admin';
  customers: CustomerRegistryItem[];
  customerPasswords: Record<string, string>;
  adminPassword: string;
  onGoogleSignIn?: (roleTab: 'customer' | 'admin') => Promise<{ ok: boolean; error?: string }>;
  onRegisterCustomer?: (
    officialName: string,
    whatsapp: string,
    password: string
  ) => { ok: true } | { ok: false; error: string };
  onLogin: (
    role: 'customer' | 'admin',
    userId: string,
    officialName: string,
    whatsapp?: string
  ) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  mode,
  initialTab = 'customer',
  customers,
  customerPasswords,
  adminPassword,
  onGoogleSignIn,
  onRegisterCustomer,
  onLogin,
  onClose,
}) => {
  const [loginTab, setLoginTab] = useState<'customer' | 'register' | 'admin'>(() =>
    mode === 'register' ? 'register' : initialTab
  );
  const [waInput, setWaInput] = useState('');
  const [custPassInput, setCustPassInput] = useState('');
  const [showCustPass, setShowCustPass] = useState(false);

  const [regNameInput, setRegNameInput] = useState('');
  const [regWaInput, setRegWaInput] = useState('');
  const [regPassInput, setRegPassInput] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [fpBusy, setFpBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    setLoginTab(mode === 'register' ? 'register' : initialTab);
    setAuthError(null);
  }, [mode, initialTab]);

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = verifyCustomerLogin(customers, customerPasswords, waInput, custPassInput);
    if (!res.ok) {
      setAuthError(res.error);
      return;
    }
    onLogin('customer', res.customer.id, res.customer.officialName, res.customer.whatsapp);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!onRegisterCustomer) {
      setAuthError('Pendaftaran nasabah belum tersedia.');
      return;
    }
    const res = onRegisterCustomer(regNameInput, regWaInput, regPassInput);
    if (!res.ok) {
      setAuthError(res.error);
    }
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = verifyAdminLogin(adminEmailInput, adminPassInput, adminPassword);
    if (!res.ok) {
      setAuthError(res.error);
      return;
    }
    onLogin('admin', 'ADM-001', 'Admin OZdigiFinance', ADMIN_EMAIL);
  };

  const handleFingerprintLogin = async (role: 'customer' | 'admin') => {
    setAuthError(null);
    setFpBusy(true);
    const res = await authenticateWebAuthnFingerprint(role);
    setFpBusy(false);

    if (!res.ok) {
      setAuthError(res.error);
      return;
    }

    if (res.credential.role === 'admin') {
      onLogin('admin', res.credential.userId || 'ADM-001', 'Admin OZdigiFinance', ADMIN_EMAIL);
      return;
    }

    const matchedCust = customers.find((c) => c.id === res.credential.userId);
    if (!matchedCust) {
      setAuthError('Akun nasabah untuk sidik jari ini sudah dihapus dari daftar aktif.');
      return;
    }
    onLogin('customer', matchedCust.id, matchedCust.officialName, matchedCust.whatsapp);
  };

  const handleGoogleLoginClick = async () => {
    if (!onGoogleSignIn) return;
    setAuthError(null);
    setGoogleBusy(true);
    const res = await onGoogleSignIn(loginTab === 'admin' ? 'admin' : 'customer');
    setGoogleBusy(false);
    if (!res.ok && res.error) {
      setAuthError(res.error);
    }
  };

  return (
    <ModalShell
      title={
        loginTab === 'register'
          ? 'Daftar Nasabah Baru OZdigiFinance'
          : 'Masuk ke OZdigiFinance'
      }
      onClose={onClose}
    >
      {/* Role & Registration Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-4">
        <button
          type="button"
          data-testid="auth-tab-customer"
          onClick={() => {
            setLoginTab('customer');
            setAuthError(null);
          }}
          className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            loginTab === 'customer'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <User className="w-3.5 h-3.5 shrink-0" />
          <span>Nasabah</span>
        </button>
        <button
          type="button"
          data-testid="auth-tab-register"
          onClick={() => {
            setLoginTab('register');
            setAuthError(null);
          }}
          className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            loginTab === 'register'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Daftar</span>
        </button>
        <button
          type="button"
          data-testid="auth-tab-admin"
          onClick={() => {
            setLoginTab('admin');
            setAuthError(null);
          }}
          className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors ${
            loginTab === 'admin'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Admin</span>
        </button>
      </div>

      {authError && (
        <div
          role="alert"
          className="mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {authError}
        </div>
      )}

      {loginTab === 'register' ? (
        <form onSubmit={handleRegisterSubmit} className="space-y-3.5" data-testid="auth-register-form">
          <div>
            <label
              htmlFor="auth-reg-name-input"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Nama Lengkap Sesuai Identitas
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-reg-name-input"
                data-testid="auth-reg-name-input"
                type="text"
                value={regNameInput}
                onChange={(e) => setRegNameInput(e.target.value)}
                placeholder="Contoh: Rina Sari"
                required
                className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-reg-wa-input"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              No. WhatsApp Aktif
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-reg-wa-input"
                data-testid="auth-reg-wa-input"
                type="tel"
                value={regWaInput}
                onChange={(e) => setRegWaInput(e.target.value)}
                placeholder="Contoh: 081234567890"
                required
                className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-reg-pass-input"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Buat Password Akun
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-reg-pass-input"
                  data-testid="auth-reg-pass-input"
                  type={showRegPass ? 'text' : 'password'}
                  value={regPassInput}
                  onChange={(e) => setRegPassInput(e.target.value)}
                  placeholder="Min. 4 karakter (kosong = No. WhatsApp)"
                  className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowRegPass((v) => !v)}
                aria-label={showRegPass ? 'Sembunyikan password' : 'Tampilkan password'}
                className="w-11 h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0"
              >
                {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Setelah mendaftar, akun nasabah Anda langsung aktif dan dapat langsung digunakan untuk masuk.
            </p>
          </div>

          <button
            type="submit"
            data-testid="auth-reg-submit-btn"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
          >
            Daftar &amp; Masuk Sekarang
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            {onGoogleSignIn && (
              <button
                type="button"
                data-testid="auth-google-register-btn"
                disabled={googleBusy}
                onClick={() => void handleGoogleLoginClick()}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {googleBusy ? 'Menghubungkan Google...' : 'Daftar / Masuk via Google (Cloud)'}
                </span>
              </button>
            )}
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Sudah terdaftar?{' '}
              <button
                type="button"
                onClick={() => {
                  setLoginTab('customer');
                  setAuthError(null);
                }}
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Login Nasabah
              </button>
            </p>
          </div>
        </form>
      ) : loginTab === 'customer' ? (
        <form onSubmit={handleCustomerSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="auth-wa-input"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              No. WhatsApp Terdaftar
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-wa-input"
                type="tel"
                value={waInput}
                onChange={(e) => setWaInput(e.target.value)}
                placeholder="Contoh: 087736661267"
                required
                className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-cust-pass-input"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Password Akun
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-cust-pass-input"
                  type={showCustPass ? 'text' : 'password'}
                  value={custPassInput}
                  onChange={(e) => setCustPassInput(e.target.value)}
                  placeholder="Default: No. WhatsApp Anda"
                  required
                  className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowCustPass((v) => !v)}
                aria-label={showCustPass ? 'Sembunyikan password' : 'Tampilkan password'}
                className="w-11 h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0"
              >
                {showCustPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Password awal sama dengan No. WhatsApp Anda dan dapat diubah kapan saja di Profil atau oleh Admin.
            </p>
          </div>

          <button
            type="submit"
            data-testid="auth-cust-submit-btn"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
          >
            Masuk sebagai Nasabah
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              type="button"
              data-testid="auth-fingerprint-cust-btn"
              disabled={fpBusy}
              onClick={() => void handleFingerprintLogin('customer')}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:border-blue-500 text-blue-700 dark:text-blue-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4 shrink-0" />
              <span>
                {fpBusy ? 'Memverifikasi Sidik Jari...' : 'Masuk dengan Sidik Jari (Fingerprint)'}
              </span>
            </button>

            {onGoogleSignIn && (
              <button
                type="button"
                data-testid="auth-google-btn"
                disabled={googleBusy}
                onClick={() => void handleGoogleLoginClick()}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {googleBusy ? 'Menghubungkan Google...' : 'Masuk dengan Google (Firebase Cloud)'}
                </span>
              </button>
            )}

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Belum punya akun?{' '}
              <button
                type="button"
                onClick={() => {
                  setLoginTab('register');
                  setAuthError(null);
                }}
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Daftar Nasabah Baru
              </button>
            </p>
          </div>
        </form>
      ) : (
        <form onSubmit={handleAdminSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="auth-admin-email"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Email Admin
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-admin-email"
                type="email"
                value={adminEmailInput}
                onChange={(e) => setAdminEmailInput(e.target.value)}
                placeholder="Masukkan email admin"
                required
                className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-admin-pass"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Password Admin
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-admin-pass"
                  type={showAdminPass ? 'text' : 'password'}
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  placeholder="Masukkan password admin"
                  required
                  className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAdminPass((v) => !v)}
                aria-label={showAdminPass ? 'Sembunyikan password' : 'Tampilkan password'}
                className="w-11 h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0"
              >
                {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            data-testid="auth-admin-submit-btn"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
          >
            Masuk sebagai Admin
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              type="button"
              data-testid="auth-fingerprint-admin-btn"
              disabled={fpBusy}
              onClick={() => void handleFingerprintLogin('admin')}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:border-blue-500 text-blue-700 dark:text-blue-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4 shrink-0" />
              <span>
                {fpBusy ? 'Memverifikasi Sidik Jari...' : 'Masuk Admin dengan Sidik Jari'}
              </span>
            </button>

            {onGoogleSignIn && (
              <button
                type="button"
                data-testid="auth-google-admin-btn"
                disabled={googleBusy}
                onClick={() => void handleGoogleLoginClick()}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {googleBusy ? 'Menghubungkan Google...' : 'Masuk Admin dengan Google (Firebase)'}
                </span>
              </button>
            )}
          </div>
        </form>
      )}
    </ModalShell>
  );
};

/* =====================================================================
   4. LOGOUT CONFIRMATION MODAL
   ===================================================================== */
interface LogoutConfirmModalProps {
  onConfirm: () => void;
  onClose: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  onConfirm,
  onClose,
}) => {
  return (
    <ModalShell title="Konfirmasi Keluar Akun" onClose={onClose} maxWidthClass="max-w-[390px]">
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
        Apakah Anda yakin ingin keluar dari akun?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
        >
          Ya, Keluar
        </button>
      </div>
    </ModalShell>
  );
};

/* =====================================================================
   5. CUSTOMER DEPOSIT MODAL
   ===================================================================== */
interface DepositModalProps {
  onSubmit: (amount: number) => void;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ onSubmit, onClose }) => {
  const [amountInput, setAmountInput] = useState('250000');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amountInput);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onSubmit(numeric);
  };

  return (
    <ModalShell title="Setor Tabungan Digital" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="deposit-amount"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
          >
            Nominal Setoran (Rp) — Nominal Bebas Tanpa Batas
          </label>
          <input
            id="deposit-amount"
            data-testid="cust-deposit-amount-input"
            type="number"
            inputMode="numeric"
            min={1}
            step="any"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Masukkan nominal setor berapapun"
            required
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[100000, 250000, 500000].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setAmountInput(String(val))}
              className="min-h-[38px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Rp {val / 1000} rb
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Konfirmasi Setoran
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   6. ADMIN RECORD PAYMENT MODAL
   ===================================================================== */
interface AdminPayModalProps {
  customers: CustomerRegistryItem[];
  onSubmit: (custId: string, officialName: string, desc: string, amount: number) => void;
  onClose: () => void;
}

export const AdminPayModal: React.FC<AdminPayModalProps> = ({ customers, onSubmit, onClose }) => {
  const firstCustomer = customers[0];
  const firstLoan = firstCustomer?.loans[0];
  const [custPair, setCustPair] = useState(
    firstCustomer ? `${firstCustomer.id}|${firstCustomer.officialName}` : ''
  );
  const [desc, setDesc] = useState(
    firstLoan
      ? `${firstLoan.productName} · Angsuran ke-${firstLoan.paidInstallments + 1}`
      : 'Pembayaran Angsuran'
  );
  const [amount, setAmount] = useState(firstLoan?.monthlyInstallment ?? 250_000);

  const handleCustomerChange = (value: string) => {
    setCustPair(value);
    const [custId] = value.split('|');
    const matched = customers.find((c) => c.id === custId);
    if (matched) {
      const loan = matched.loans[0];
      setDesc(
        loan
          ? `${loan.productName} · Angsuran ke-${loan.paidInstallments + 1}`
          : 'Pembayaran Angsuran'
      );
      setAmount(loan?.monthlyInstallment ?? 250_000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const [custId, officialName] = custPair.split('|');
    if (!custId || amount <= 0) return;
    onSubmit(custId, officialName, desc.trim() || 'Pembayaran Angsuran', amount);
  };

  return (
    <ModalShell title="Catat & Verifikasi Pembayaran Nasabah" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label
            htmlFor="admin-pay-cust"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Pilih Nasabah Resmi
          </label>
          <select
            id="admin-pay-cust"
            value={custPair}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          >
            {customers.map((c) => (
              <option key={c.id} value={`${c.id}|${c.officialName}`}>
                {c.officialName} ({c.id} · WA: {c.whatsapp})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="admin-pay-desc"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Keterangan Angsuran
          </label>
          <input
            id="admin-pay-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            required
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="admin-pay-nom"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Nominal Pembayaran (Rp)
          </label>
          <input
            id="admin-pay-nom"
            type="number"
            min={10000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Simpan &amp; Verifikasi
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   7. ADMIN SAVINGS TRANSACTION MODAL
   ===================================================================== */
interface AdminSavingsModalProps {
  accounts: SavingsAccount[];
  initialCustId: string;
  initialTxType: 'setor' | 'tarik';
  onSubmit: (custId: string, txType: 'setor' | 'tarik', amount: number, note: string) => void;
  onClose: () => void;
}

export const AdminSavingsModal: React.FC<AdminSavingsModalProps> = ({
  accounts,
  initialCustId,
  initialTxType,
  onSubmit,
  onClose,
}) => {
  const [custId, setCustId] = useState(
    accounts.some((a) => a.id === initialCustId) ? initialCustId : (accounts[0]?.id ?? '')
  );
  const [txType, setTxType] = useState<'setor' | 'tarik'>(initialTxType);
  const [amountInput, setAmountInput] = useState('250000');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amountInput);
    if (!custId || !Number.isFinite(numeric) || numeric <= 0) return;
    onSubmit(custId, txType, numeric, note.trim());
  };

  return (
    <ModalShell title="Catat & Verifikasi Tabungan Nasabah" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label
            htmlFor="admin-sav-cust"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Pilih Rekening Nasabah (Nama Resmi)
          </label>
          <select
            id="admin-sav-cust"
            value={custId}
            onChange={(e) => setCustId(e.target.value)}
            disabled={accounts.length === 0}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-60"
          >
            {accounts.length === 0 ? (
              <option value="">Belum ada rekening tabungan nasabah</option>
            ) : (
              accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.id} — {acc.officialName} ({acc.program} · Saldo: {formatRupiah(acc.balance)})
                </option>
              ))
            )}
          </select>
          {accounts.length === 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              Data nasabah tabungan sedang dikosongkan sementara.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="admin-sav-type"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Jenis Transaksi
          </label>
          <select
            id="admin-sav-type"
            value={txType}
            onChange={(e) => setTxType(e.target.value as 'setor' | 'tarik')}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="setor">Setoran Tabungan (+)</option>
            <option value="tarik">Penarikan Saldo (-)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="admin-sav-amount"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Nominal Transaksi (Rp) — Nominal Bebas Tanpa Batas
          </label>
          <input
            id="admin-sav-amount"
            data-testid="admin-sav-amount-input"
            type="number"
            inputMode="numeric"
            min={1}
            step="any"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Masukkan nominal berapapun"
            required
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { val: 50000, label: 'Rp 50 rb' },
            { val: 250000, label: 'Rp 250 rb' },
            { val: 500000, label: 'Rp 500 rb' },
            { val: 1000000, label: 'Rp 1 jt' },
          ].map((p) => (
            <button
              key={p.val}
              type="button"
              onClick={() => setAmountInput(String(p.val))}
              className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-[11px] font-semibold"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor="admin-sav-note"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Catatan Admin (Opsional)
          </label>
          <input
            id="admin-sav-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Setoran rutin mingguan via transfer"
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={accounts.length === 0}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold"
          >
            Simpan &amp; Verifikasi
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   8. ADMIN CUSTOMER ADD / EDIT MODAL (WITH SEPARATED LOANS)
   ===================================================================== */
interface LoanDraft {
  id: string;
  productName: string;
  monthlyInstallment: number;
  paidInstallments: number;
  totalInstallments: number;
  dueDateDay: string;
}

interface CustomerEditorModalProps {
  customer: CustomerRegistryItem | null;
  existingCustomers: CustomerRegistryItem[];
  onSave: (customer: CustomerRegistryItem, isNew: boolean) => void;
  onClose: () => void;
}

export const CustomerEditorModal: React.FC<CustomerEditorModalProps> = ({
  customer,
  existingCustomers,
  onSave,
  onClose,
}) => {
  const isNew = !customer;
  const [custId, setCustId] = useState(
    customer?.id ?? generateNextCustomerId(existingCustomers)
  );
  const [officialName, setOfficialName] = useState(customer?.officialName ?? '');
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp ?? '');
  const [status, setStatus] = useState<'Aktif' | 'Berjalan'>(customer?.status ?? 'Aktif');
  const [loanDrafts, setLoanDrafts] = useState<LoanDraft[]>(() => {
    if (customer && customer.loans.length > 0) {
      return customer.loans.map((l) => ({
        id: l.id,
        productName: l.productName,
        monthlyInstallment: l.monthlyInstallment,
        paidInstallments: l.paidInstallments,
        totalInstallments: l.totalInstallments,
        dueDateDay: l.dueDateDay,
      }));
    }
    if (customer && customer.loans.length === 0) {
      return [];
    }
    return [
      {
        id: `LN-${Date.now()}-1`,
        productName: 'Spinjam',
        monthlyInstallment: 300_000,
        paidInstallments: 0,
        totalInstallments: 6,
        dueDateDay: 'Tgl 25',
      },
    ];
  });

  const handleAddLoanDraft = () => {
    setLoanDrafts((prev) => [
      ...prev,
      {
        id: `LN-${Date.now()}-${prev.length + 1}`,
        productName: 'Pinjaman Baru',
        monthlyInstallment: 250_000,
        paidInstallments: 0,
        totalInstallments: 6,
        dueDateDay: 'Tgl 25',
      },
    ]);
  };

  const handleUpdateLoanDraft = (
    idx: number,
    patch: Partial<LoanDraft>
  ) => {
    setLoanDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleRemoveLoanDraft = (idx: number) => {
    setLoanDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = officialName.trim();
    const cleanId = custId.trim().toUpperCase() || generateNextCustomerId(existingCustomers);
    const cleanWa = whatsapp.trim();
    if (!cleanName || !cleanWa) return;

    const existingLoansMap = new Map<string, LoanItem>(
      (customer?.loans ?? []).map((l) => [l.id, l])
    );

    const builtLoans: LoanItem[] = loanDrafts.map((draft) => {
      const prevLoan = existingLoansMap.get(draft.id);
      const unchangedSchedule =
        prevLoan &&
        prevLoan.totalInstallments === draft.totalInstallments &&
        prevLoan.paidInstallments === draft.paidInstallments &&
        prevLoan.monthlyInstallment === draft.monthlyInstallment &&
        prevLoan.dueDateDay === draft.dueDateDay
          ? prevLoan.schedule
          : undefined;

      return buildLoanItem({
        id: draft.id,
        productName: draft.productName,
        monthlyInstallment: draft.monthlyInstallment,
        paidInstallments: draft.paidInstallments,
        totalInstallments: draft.totalInstallments,
        dueDateDay: draft.dueDateDay,
        existingSchedule: unchangedSchedule,
      });
    });

    const summary = summarizeCustomerFromLoans({
      id: cleanId,
      officialName: cleanName,
      whatsapp: cleanWa,
      status,
      loans: builtLoans,
    });

    onSave(summary, isNew);
  };

  return (
    <ModalShell
      title={isNew ? 'Tambah Data Nasabah Baru' : `Edit Data Nasabah: ${customer.officialName}`}
      onClose={onClose}
      maxWidthClass="max-w-[600px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="cust-ed-id"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              ID Nasabah
            </label>
            <input
              id="cust-ed-id"
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
              readOnly={!isNew}
              required
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100 read-only:opacity-75"
            />
          </div>
          <div>
            <label
              htmlFor="cust-ed-status"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Status
            </label>
            <select
              id="cust-ed-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Aktif' | 'Berjalan')}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="Aktif">Aktif</option>
              <option value="Berjalan">Berjalan</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="cust-ed-name"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Nama Resmi Nasabah
            </label>
            <input
              id="cust-ed-name"
              value={officialName}
              onChange={(e) => setOfficialName(e.target.value)}
              placeholder="Contoh: BUDI"
              required
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="cust-ed-wa"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              No. WhatsApp
            </label>
            <input
              id="cust-ed-wa"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Contoh: 081234567890"
              required
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Separated Loan Contracts */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div>
              <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                Kontrak Pinjaman Terpisah ({loanDrafts.length})
              </strong>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Setiap pinjaman dicatat terpisah beserta cicilan &amp; jatuh temponya
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddLoanDraft}
              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-xs font-bold inline-flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/60"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pinjaman</span>
            </button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {loanDrafts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                Belum ada kontrak pinjaman. Klik &ldquo;Tambah Pinjaman&rdquo; jika ingin menambahkan.
              </p>
            ) : (
              loanDrafts.map((loan, idx) => (
                <div
                  key={loan.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                      Pinjaman #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLoanDraft(idx)}
                      aria-label={`Hapus pinjaman #${idx + 1}`}
                      className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 hover:underline"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                        Nama Produk / Pinjaman
                      </label>
                      <input
                        value={loan.productName}
                        onChange={(e) =>
                          handleUpdateLoanDraft(idx, { productName: e.target.value })
                        }
                        required
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                        Tagihan / Bln (Rp)
                      </label>
                      <input
                        type="number"
                        min={10000}
                        value={loan.monthlyInstallment}
                        onChange={(e) =>
                          handleUpdateLoanDraft(idx, {
                            monthlyInstallment: Number(e.target.value),
                          })
                        }
                        required
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                        Lunas (Bln)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={loan.totalInstallments}
                        value={loan.paidInstallments}
                        onChange={(e) =>
                          handleUpdateLoanDraft(idx, {
                            paidInstallments: Number(e.target.value),
                          })
                        }
                        required
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                        Total Tenor (Bln)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={loan.totalInstallments}
                        onChange={(e) =>
                          handleUpdateLoanDraft(idx, {
                            totalInstallments: Number(e.target.value),
                          })
                        }
                        required
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                        Jatuh Tempo
                      </label>
                      <input
                        value={loan.dueDateDay}
                        onChange={(e) =>
                          handleUpdateLoanDraft(idx, { dueDateDay: e.target.value })
                        }
                        placeholder="Tgl 25"
                        required
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            {isNew ? 'Simpan Nasabah Baru' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   9. CONFIRM DELETE CUSTOMER MODAL
   ===================================================================== */
interface ConfirmDeleteModalProps {
  customer: CustomerRegistryItem;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  customer,
  onConfirm,
  onClose,
}) => {
  return (
    <ModalShell title="Hapus Data Nasabah" onClose={onClose} maxWidthClass="max-w-[410px]">
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
        Anda yakin ingin menghapus data nasabah{' '}
        <strong className="text-slate-900 dark:text-white">
          {customer.officialName} ({customer.id})
        </strong>
        ?
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
        Seluruh kontrak pinjaman terkait nasabah ini akan dihapus dari daftar aktif.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
        >
          Ya, Hapus Data
        </button>
      </div>
    </ModalShell>
  );
};

/* =====================================================================
   10. CONVERT LOAN <-> SAVINGS MODAL
   ===================================================================== */
export type ConvertModalState =
  | { mode: 'loanToSavings'; custId: string; officialName: string; loan: LoanItem }
  | { mode: 'savingsToLoan'; account: SavingsAccount };

interface ConvertTypeModalProps {
  target: ConvertModalState;
  onConfirmLoanToSavings: (
    custId: string,
    loanId: string,
    program: SavingsFrequency,
    amount: number
  ) => void;
  onConfirmSavingsToLoan: (
    custId: string,
    productName: string,
    monthlyInstallment: number,
    totalInstallments: number,
    dueDateDay: string
  ) => void;
  onClose: () => void;
}

export const ConvertTypeModal: React.FC<ConvertTypeModalProps> = ({
  target,
  onConfirmLoanToSavings,
  onConfirmSavingsToLoan,
  onClose,
}) => {
  const [program, setProgram] = useState<SavingsFrequency>('Menabung Mingguan');
  const [savAmount, setSavAmount] = useState(
    target.mode === 'loanToSavings' ? target.loan.monthlyInstallment : 0
  );

  const [productName, setProductName] = useState('Pinjaman Konversi Tabungan');
  const [totalInstallments, setTotalInstallments] = useState(6);
  const [monthlyInstallment, setMonthlyInstallment] = useState(() => {
    if (target.mode === 'savingsToLoan') {
      return Math.max(50_000, Math.round((target.account.balance || 600_000) / 6));
    }
    return 300_000;
  });
  const [dueDateDay, setDueDateDay] = useState('Tgl 25');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (target.mode === 'loanToSavings') {
      onConfirmLoanToSavings(target.custId, target.loan.id, program, Math.max(0, savAmount));
    } else {
      onConfirmSavingsToLoan(
        target.account.id,
        productName.trim() || 'Pinjaman Konversi',
        Math.max(10_000, monthlyInstallment),
        Math.max(1, totalInstallments),
        dueDateDay.trim() || 'Tgl 25'
      );
    }
  };

  return (
    <ModalShell
      title={
        target.mode === 'loanToSavings'
          ? 'Ubah Pinjaman Menjadi Tabungan'
          : 'Ubah Tabungan Menjadi Pinjaman'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center gap-2.5 text-xs">
          <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="text-slate-700 dark:text-slate-200">
            {target.mode === 'loanToSavings' ? (
              <>
                Mengubah kontrak <strong>{target.loan.productName}</strong> milik{' '}
                <strong>{target.officialName}</strong> menjadi rekening tabungan.
              </>
            ) : (
              <>
                Mengubah rekening tabungan <strong>{target.account.officialName}</strong> (Saldo:{' '}
                {formatRupiah(target.account.balance)}) menjadi kontrak pinjaman baru.
              </>
            )}
          </div>
        </div>

        {target.mode === 'loanToSavings' ? (
          <>
            <div>
              <label
                htmlFor="conv-sav-prog"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Program Tabungan Tujuan
              </label>
              <select
                id="conv-sav-prog"
                value={program}
                onChange={(e) => setProgram(e.target.value as SavingsFrequency)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Menabung Harian">Menabung Harian</option>
                <option value="Menabung Mingguan">Menabung Mingguan</option>
                <option value="Menabung Bulanan">Menabung Bulanan</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="conv-sav-amt"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Saldo Awal Tabungan Hasil Konversi (Rp)
              </label>
              <input
                id="conv-sav-amt"
                type="number"
                min={0}
                value={savAmount}
                onChange={(e) => setSavAmount(Number(e.target.value))}
                required
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono-num"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="conv-loan-prod"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Nama Produk Pinjaman Baru
              </label>
              <input
                id="conv-loan-prod"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="conv-loan-inst"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
                >
                  Cicilan / Bln
                </label>
                <input
                  id="conv-loan-inst"
                  type="number"
                  min={10000}
                  value={monthlyInstallment}
                  onChange={(e) => setMonthlyInstallment(Number(e.target.value))}
                  required
                  className="w-full min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono-num"
                />
              </div>
              <div>
                <label
                  htmlFor="conv-loan-tenor"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
                >
                  Tenor (Bln)
                </label>
                <input
                  id="conv-loan-tenor"
                  type="number"
                  min={1}
                  max={24}
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(Number(e.target.value))}
                  required
                  className="w-full min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="conv-loan-due"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
                >
                  Jatuh Tempo
                </label>
                <input
                  id="conv-loan-due"
                  value={dueDateDay}
                  onChange={(e) => setDueDateDay(e.target.value)}
                  required
                  className="w-full min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Konfirmasi Perubahan
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   11. ADMIN CHANGE CUSTOMER PASSWORD MODAL
   ===================================================================== */
interface ChangeCustomerPasswordModalProps {
  customer: CustomerRegistryItem;
  currentPassword: string;
  onSave: (custId: string, newPassword: string) => void;
  onClose: () => void;
}

export const ChangeCustomerPasswordModal: React.FC<ChangeCustomerPasswordModalProps> = ({
  customer,
  currentPassword,
  onSave,
  onClose,
}) => {
  const [newPassword, setNewPassword] = useState(currentPassword);
  const [showPass, setShowPass] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPassword.trim();
    if (trimmed.length < 4) {
      setErrorMsg('Password nasabah minimal 4 karakter.');
      return;
    }
    onSave(customer.id, trimmed);
  };

  return (
    <ModalShell
      title={`Ubah Password Nasabah: ${customer.officialName}`}
      onClose={onClose}
      maxWidthClass="max-w-[430px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
          <p className="font-bold text-slate-900 dark:text-white">
            {customer.officialName} ({customer.id})
          </p>
          <p className="text-slate-500 dark:text-slate-400 font-mono-num">
            No. WhatsApp Login: {customer.whatsapp}
          </p>
        </div>

        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{errorMsg}</p>
        )}

        <div>
          <label
            htmlFor="admin-cust-pass-input"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Password Baru Nasabah
          </label>
          <div className="flex gap-2">
            <input
              id="admin-cust-pass-input"
              type={showPass ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
              className="w-11 h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNewPassword(customer.whatsapp)}
          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
        >
          Reset ke No. WhatsApp ({customer.whatsapp})
        </button>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            data-testid="save-cust-pass-btn"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Simpan Password Nasabah
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/* =====================================================================
   12. ADMIN LOAN MONTHLY PAYMENT / PAYOFF MODAL
   ===================================================================== */
interface LoanPayModalProps {
  customer: CustomerRegistryItem;
  loan: LoanItem;
  onConfirm: (custId: string, loanId: string, mode: 'monthly' | 'full') => void;
  onClose: () => void;
}

export const LoanPayModal: React.FC<LoanPayModalProps> = ({
  customer,
  loan,
  onConfirm,
  onClose,
}) => {
  const [payMode, setPayMode] = useState<'monthly' | 'full'>('monthly');
  const nextInstallment = Math.min(loan.totalInstallments, loan.paidInstallments + 1);
  const alreadyPaidOff = loan.paidInstallments >= loan.totalInstallments || loan.remainingDebt <= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (alreadyPaidOff) return;
    onConfirm(customer.id, loan.id, payMode);
  };

  return (
    <ModalShell
      title="Pelunasan & Pembayaran Bulanan Pinjaman"
      onClose={onClose}
      maxWidthClass="max-w-[460px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm text-slate-900 dark:text-white">
              {customer.officialName} ({customer.id})
            </strong>
            <span className="font-mono-num text-emerald-700 dark:text-emerald-400 font-semibold">
              WA: {customer.whatsapp}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-semibold">
            Kontrak: {loan.productName}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Progres: {loan.paidInstallments} / {loan.totalInstallments} Bulan
            </span>
            <span className="font-mono-num font-bold text-blue-700 dark:text-blue-400">
              Sisa: {formatRupiah(loan.remainingDebt)}
            </span>
          </div>
        </div>

        {alreadyPaidOff ? (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Kontrak pinjaman ini sudah LUNAS sepenuhnya.
          </div>
        ) : (
          <div className="space-y-2.5">
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                payMode === 'monthly'
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="loanPayMode"
                value="monthly"
                checked={payMode === 'monthly'}
                onChange={() => setPayMode('monthly')}
                className="mt-1"
              />
              <div className="flex-1">
                <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                  Pembayaran Bulanan (Angsuran ke-{nextInstallment})
                </strong>
                <span className="text-xs font-mono-num font-bold text-blue-700 dark:text-blue-400">
                  {formatRupiah(loan.monthlyInstallment)}
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                payMode === 'full'
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="loanPayMode"
                value="full"
                checked={payMode === 'full'}
                onChange={() => setPayMode('full')}
                className="mt-1"
              />
              <div className="flex-1">
                <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                  Pelunasan Seluruh Sisa Kontrak
                </strong>
                <span className="text-xs font-mono-num font-bold text-emerald-700 dark:text-emerald-400">
                  {formatRupiah(loan.remainingDebt)}
                </span>
              </div>
            </label>

            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-center gap-2 text-[11px] text-blue-800 dark:text-blue-300">
              <Bell className="w-4 h-4 shrink-0" />
              <span>
                Otomatis mengirim notifikasi suara &amp; pemberitahuan &ldquo;Pembayaran bulan ini telah lunas&rdquo; ke akun nasabah.
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            Batal
          </button>
          {!alreadyPaidOff && (
            <button
              type="submit"
              data-testid="confirm-loan-pay-btn"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Lunasi &amp; Kirim Notifikasi
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
};

