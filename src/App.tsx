import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  INITIAL_CHAT_THREADS,
  INITIAL_CUSTOMERS,
  INITIAL_PENDING_BILLS,
  INITIAL_SAVINGS_ACCOUNTS,
  INITIAL_SAVINGS_MUTATIONS,
  INITIAL_TRANSACTIONS,
} from './data/seed';
import type {
  AdminPageId,
  ChatMessage,
  CustomerNotification,
  CustomerPageId,
  CustomerRegistryItem,
  LoanItem,
  PendingBill,
  SavingsAccount,
  SavingsFrequency,
  SavingsMutation,
  ThemeMode,
  TransactionRecord,
  ViewRole,
} from './types/app';
import {
  ADMIN_EMAIL,
  applyLoanPayment,
  buildLoanItem,
  buildTransactionsCsv,
  ensureCustomerDefaultPassword,
  formatRupiah,
  normalizePhoneDigits,
  registerNewCustomerAccount,
  summarizeCustomerFromLoans,
} from './utils/finance';
import {
  detectIOSBrowser,
  detectStandaloneMode,
  type BeforeInstallPromptEvent,
} from './utils/pwa';
import {
  AVATAR_KEY,
  DISPLAY_NAME_KEY,
  NOTIF_STORAGE_KEY,
  clearPersistedSession,
  createSessionToken,
  getInitialTheme,
  getValidSession,
  loadAdminPassword,
  loadCustomerPasswords,
  loadStoredNotifications,
  persistSession,
  saveAdminPassword,
  saveCustomerPasswords,
  saveStoredNotifications,
  saveTheme,
  unlockAudioContext,
} from './utils/storage';
import { HAS_VALID_FIREBASE_CONFIG, testConnection } from './lib/firebase';
import {
  OWNER_ADMIN_EMAIL,
  deleteCustomerFromFirestore,
  deleteSavingsFromFirestore,
  ensureFirebaseUserProfile,
  isTrustedAdminEmail,
  linkCustomerUidByWhatsapp,
  saveCustomerToFirestore,
  saveSavingsToFirestore,
  seedFirestoreIfEmpty,
  signInWithFirebaseGoogle,
  signOutFirebase,
  subscribeFirebaseAuthState,
  subscribeFirestoreCustomers,
  subscribeFirestoreSavings,
  updateFirebasePassword,
  updateUserProfileInFirestore,
  updateUserSoundPreferenceInFirestore,
} from './lib/auth';
import {
  enqueueCloudSyncTask,
  ensureConversationDocInFirestore,
  flushCloudSyncQueue,
  loadCloudSyncQueue,
  saveTransactionDocToFirestore,
  type CloudSyncTask,
} from './lib/cloudSync';
import {
  loadOlderConversationMessages,
  markConversationMessagesRead,
  sendFirestoreChatMessage,
  subscribeConversationMessages,
  subscribeConversations,
  toUiChatMessage,
  type FirestoreChatMessage,
  type FirestoreConversation,
} from './lib/chat';
import {
  buildDeterministicLoanTxId,
  formatPaymentSystemMessage,
  recordAdminLoanPaymentAtomic,
  subscribeFirestoreTransactions,
} from './lib/transactions';
import {
  createNotificationDoc,
  loadSoundEnabledPref,
  markAllUserNotificationsRead,
  markNotificationAsRead,
  playCategoryNotificationSound,
  preloadCustomSounds,
  saveSoundEnabledPref,
  subscribeUserNotifications,
  type FirestoreNotification,
} from './lib/notifications';
import {
  getConfiguredVapidKey,
  registerFcmServiceWorker,
  removeCurrentDeviceToken,
  requestAndRegisterPushToken,
  subscribeForegroundPush,
  syncDeviceTokenSoundPref,
  type PushSetupStatus,
} from './lib/firebase-messaging';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuestView } from './components/GuestView';
import { CustomerView } from './components/CustomerView';
import { AdminView } from './components/AdminView';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import {
  AdminPayModal,
  AdminSavingsModal,
  AuthModal,
  ChangeCustomerPasswordModal,
  ConfirmDeleteModal,
  ConvertTypeModal,
  CustomerEditorModal,
  DepositModal,
  LoanPayModal,
  LogoutConfirmModal,
  NotifCenterModal,
  ProfileModal,
  type ConvertModalState,
} from './components/Modals';

const LOCAL_CUSTOMERS_KEY = 'ozf_local_customers_v1';
const LOCAL_TRANSACTIONS_KEY = 'ozf_local_transactions_v1';
const LOCAL_CHATS_KEY = 'ozf_local_chats_v1';
const LOCAL_UNREAD_CHAT_KEY = 'ozf_local_unread_chat_v1';
const LOCAL_SAVINGS_KEY = 'ozf_local_savings_v1';
const LOCAL_BILLS_KEY = 'ozf_local_bills_v1';

interface UnreadChatPair {
  admin: number;
  customer: number;
}

function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function formatFirestoreNotifTime(nf: FirestoreNotification): string {
  if (nf.createdAt && typeof nf.createdAt.toDate === 'function') {
    try {
      return nf.createdAt.toDate().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // Fallback below
    }
  }
  return 'Baru saja';
}

type ActiveModal =
  | null
  | { type: 'auth'; mode: 'login' | 'register'; initialTab?: 'customer' | 'admin' }
  | { type: 'notifs' }
  | { type: 'profile' }
  | { type: 'logout' }
  | { type: 'deposit' }
  | { type: 'adminPay' }
  | { type: 'adminSavings'; custId: string; txType: 'setor' | 'tarik' }
  | { type: 'customerEditor'; customer: CustomerRegistryItem | null }
  | { type: 'confirmDelete'; customer: CustomerRegistryItem }
  | { type: 'changeCustPass'; customer: CustomerRegistryItem }
  | { type: 'loanPay'; customer: CustomerRegistryItem; loan: LoanItem }
  | { type: 'convertType'; target: ConvertModalState };

function AppInner() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  const [currentView, setCurrentView] = useState<ViewRole>(() => {
    const sess = getValidSession();
    return sess ? sess.role : 'guest';
  });

  const [customers, setCustomers] = useState<CustomerRegistryItem[]>(() =>
    loadLocalJson<CustomerRegistryItem[]>(LOCAL_CUSTOMERS_KEY, INITIAL_CUSTOMERS)
  );

  const [activeCustomerId, setActiveCustomerId] = useState<string>(() => {
    const localCusts = loadLocalJson<CustomerRegistryItem[]>(
      LOCAL_CUSTOMERS_KEY,
      INITIAL_CUSTOMERS
    );
    const sess = getValidSession();
    if (sess?.role === 'customer' && localCusts.some((c) => c.id === sess.userId)) {
      return sess.userId;
    }
    return localCusts[0]?.id ?? INITIAL_CUSTOMERS[0].id;
  });

  const activeCustomer = useMemo(
    () =>
      customers.find((c) => c.id === activeCustomerId) ??
      customers[0] ??
      INITIAL_CUSTOMERS[0],
    [activeCustomerId, customers]
  );

  const [custPage, setCustPage] = useState<CustomerPageId>('c-beranda');
  const [adminPage, setAdminPage] = useState<AdminPageId>('a-dashboard');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const [displayName, setDisplayName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(DISPLAY_NAME_KEY);
      if (saved && saved !== 'Budi Santoso') return saved;
    } catch {
      // Ignore
    }
    return INITIAL_CUSTOMERS[0].officialName;
  });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AVATAR_KEY);
    } catch {
      return null;
    }
  });

  const [transactions, setTransactions] = useState<TransactionRecord[]>(() =>
    loadLocalJson<TransactionRecord[]>(LOCAL_TRANSACTIONS_KEY, INITIAL_TRANSACTIONS)
  );
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>(() =>
    loadLocalJson<SavingsAccount[]>(LOCAL_SAVINGS_KEY, INITIAL_SAVINGS_ACCOUNTS)
  );
  const [savingsMutations, setSavingsMutations] = useState<SavingsMutation[]>(
    INITIAL_SAVINGS_MUTATIONS
  );
  const [monthlySavingsInflow, setMonthlySavingsInflow] = useState<number>(0);
  const [defaultSavingsFreq, setDefaultSavingsFreq] =
    useState<SavingsFrequency>('Menabung Mingguan');
  const [pendingBills, setPendingBills] = useState<PendingBill[]>(() =>
    loadLocalJson<PendingBill[]>(LOCAL_BILLS_KEY, INITIAL_PENDING_BILLS)
  );
  const [chatsByCustomer, setChatsByCustomer] = useState<Record<string, ChatMessage[]>>(() =>
    loadLocalJson<Record<string, ChatMessage[]>>(LOCAL_CHATS_KEY, INITIAL_CHAT_THREADS)
  );
  const [unreadChatMap, setUnreadChatMap] = useState<Record<string, UnreadChatPair>>(() =>
    loadLocalJson<Record<string, UnreadChatPair>>(LOCAL_UNREAD_CHAT_KEY, {})
  );

  const [selectedAdminChatCustId, setSelectedAdminChatCustId] = useState<string>(
    INITIAL_CUSTOMERS[0].id
  );
  const [isAdminSession, setIsAdminSession] = useState<boolean>(
    () => getValidSession()?.role === 'admin'
  );
  const [customerPasswords, setCustomerPasswords] = useState<Record<string, string>>(() =>
    loadCustomerPasswords()
  );
  const [adminPassword, setAdminPassword] = useState<string>(() => loadAdminPassword());

  const [notifications, setNotifications] = useState<CustomerNotification[]>(() =>
    loadStoredNotifications()
  );
  const [adminBellCount, setAdminBellCount] = useState<number>(0);
  const [bellUrgentKey, setBellUrgentKey] = useState<number>(0);

  // Firebase Cloud States
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseRole, setFirebaseRole] = useState<'admin' | 'customer' | null>(null);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(HAS_VALID_FIREBASE_CONFIG);
  const [firestoreConversations, setFirestoreConversations] = useState<FirestoreConversation[]>(
    []
  );
  const [firestoreRawMessages, setFirestoreRawMessages] = useState<FirestoreChatMessage[]>([]);
  const [olderMessagesByConv, setOlderMessagesByConv] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [oldestCursor, setOldestCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState<boolean>(false);
  const [firestoreNotifications, setFirestoreNotifications] = useState<FirestoreNotification[]>(
    []
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => loadSoundEnabledPref());
  const [pushStatus, setPushStatus] = useState<PushSetupStatus | null>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return null;
    return {
      supported: true,
      permission: Notification.permission,
      token: null,
      vapidConfigured: Boolean(getConfiguredVapidKey()),
      serviceWorkerActive: 'serviceWorker' in navigator,
    };
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const inFlightPaymentIdsRef = useRef<Set<string>>(new Set());
  const seenFirestoreNotifIdsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadDoneRef = useRef<boolean>(false);
  const prevUnreadCountsRef = useRef<Record<string, UnreadChatPair>>({});
  const initialConvLoadDoneRef = useRef<boolean>(false);

  // PWA Smart Auto Install States
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window === 'undefined') return null;
    return (
      (window as unknown as { __ozfDeferredPrompt?: BeforeInstallPromptEvent | null })
        .__ozfDeferredPrompt ?? null
    );
  });
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const installedFlag = Boolean(
      (window as unknown as { __ozfAppInstalled?: boolean }).__ozfAppInstalled
    );
    return installedFlag || detectStandaloneMode();
  });
  const [isIOSDevice] = useState<boolean>(() => detectIOSBrowser());
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(
    () => loadCloudSyncQueue().length
  );

  const [swipeIndicator, setSwipeIndicator] = useState<'left' | 'right' | null>(null);
  const lastHomeBackTimeRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 3200);
  }, []);

  const syncOrEnqueue = useCallback(
    async (task: CloudSyncTask, directWrite?: () => Promise<void>) => {
      if (firebaseUser && firebaseUser.emailVerified && directWrite) {
        try {
          await directWrite();
          return;
        } catch {
          // Fall back to offline sync queue so mutations never get lost
        }
      }
      const count = enqueueCloudSyncTask(task);
      setPendingSyncCount(count);
    },
    [firebaseUser]
  );

  // Sync theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
    const meta = document.getElementById('theme-meta');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f3f6fa');
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Unlock Web Audio on first pointer gesture
  useEffect(() => {
    const onFirstPointer = () => unlockAudioContext();
    document.addEventListener('pointerdown', onFirstPointer, { once: true });
    return () => document.removeEventListener('pointerdown', onFirstPointer);
  }, []);

  // Initial Firebase connectivity check, custom audio preload & FCM service worker registration
  useEffect(() => {
    void testConnection().then((status) => {
      if (status.connected) setFirebaseConnected(true);
    });
    void preloadCustomSounds();
    void registerFcmServiceWorker();
  }, []);

  // PWA beforeinstallprompt & appinstalled lifecycle
  useEffect(() => {
    const win = window as unknown as {
      __ozfDeferredPrompt?: BeforeInstallPromptEvent | null;
      __ozfAppInstalled?: boolean;
    };

    if (win.__ozfDeferredPrompt) {
      setDeferredPrompt(win.__ozfDeferredPrompt);
    }
    if (win.__ozfAppInstalled || detectStandaloneMode()) {
      setIsPwaInstalled(true);
    }

    const navAny = window.navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
    };
    if (typeof navAny.getInstalledRelatedApps === 'function') {
      void navAny
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsPwaInstalled(true);
          }
        })
        .catch(() => undefined);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      win.__ozfDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const onEarlyPromptCaptured = () => {
      if (win.__ozfDeferredPrompt) {
        setDeferredPrompt(win.__ozfDeferredPrompt);
      }
    };

    const onAppInstalled = () => {
      win.__ozfDeferredPrompt = null;
      win.__ozfAppInstalled = true;
      setDeferredPrompt(null);
      setIsPwaInstalled(true);
      showToast('OZdigiFinance berhasil dipasang ke perangkat Anda!');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('ozf:beforeinstallprompt', onEarlyPromptCaptured);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('ozf:appinstalled', onAppInstalled);

    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const onDisplayModeChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        setIsPwaInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mql?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('ozf:beforeinstallprompt', onEarlyPromptCaptured);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('ozf:appinstalled', onAppInstalled);
      mql?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, [showToast]);

  // Persist local mirror cache so offline sessions & pre-sync state survive reloads
  useEffect(() => {
    saveLocalJson(LOCAL_CUSTOMERS_KEY, customers);
  }, [customers]);

  useEffect(() => {
    saveLocalJson(LOCAL_TRANSACTIONS_KEY, transactions);
  }, [transactions]);

  useEffect(() => {
    saveLocalJson(LOCAL_CHATS_KEY, chatsByCustomer);
  }, [chatsByCustomer]);

  useEffect(() => {
    saveLocalJson(LOCAL_UNREAD_CHAT_KEY, unreadChatMap);
  }, [unreadChatMap]);

  useEffect(() => {
    saveLocalJson(LOCAL_SAVINGS_KEY, savingsAccounts);
  }, [savingsAccounts]);

  useEffect(() => {
    saveLocalJson(LOCAL_BILLS_KEY, pendingBills);
  }, [pendingBills]);

  // Cross-tab real-time sync for local/hybrid session + notifications
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOTIF_STORAGE_KEY && e.newValue) {
        setNotifications(loadStoredNotifications());
        playCategoryNotificationSound('TRANSACTION_ALERT', soundEnabled);
        setBellUrgentKey((k) => k + 1);
        showToast('Pemberitahuan baru diterima!');
      } else if (e.key === LOCAL_CHATS_KEY && e.newValue && !firebaseUser) {
        setChatsByCustomer(
          loadLocalJson<Record<string, ChatMessage[]>>(LOCAL_CHATS_KEY, INITIAL_CHAT_THREADS)
        );
        playCategoryNotificationSound('CHAT_MESSAGE', soundEnabled);
      } else if (e.key === LOCAL_UNREAD_CHAT_KEY && e.newValue && !firebaseUser) {
        setUnreadChatMap(
          loadLocalJson<Record<string, UnreadChatPair>>(LOCAL_UNREAD_CHAT_KEY, {})
        );
      } else if (e.key === LOCAL_CUSTOMERS_KEY && e.newValue && !firebaseUser) {
        setCustomers(
          loadLocalJson<CustomerRegistryItem[]>(LOCAL_CUSTOMERS_KEY, INITIAL_CUSTOMERS)
        );
      } else if (e.key === LOCAL_TRANSACTIONS_KEY && e.newValue && !firebaseUser) {
        setTransactions(
          loadLocalJson<TransactionRecord[]>(LOCAL_TRANSACTIONS_KEY, INITIAL_TRANSACTIONS)
        );
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [firebaseUser, showToast, soundEnabled]);

  // Keyboard Escape closes open modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModal) {
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal]);

  // Firebase Auth listener & backend JWT token verification
  useEffect(() => {
    const unsub = subscribeFirebaseAuthState((user) => {
      setFirebaseUser(user);
      if (!user) {
        setFirebaseRole(null);
        setFirestoreConversations([]);
        setFirestoreNotifications([]);
        initialNotifLoadDoneRef.current = false;
        seenFirestoreNotifIdsRef.current.clear();
        return;
      }

      void (async () => {
        try {
          const profile = await ensureFirebaseUserProfile(user);
          setFirebaseRole(profile.role);
          setSoundEnabled(profile.soundEnabled);
          saveSoundEnabledPref(profile.soundEnabled);

          const token = await user.getIdToken();
          void fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => undefined);

          if (profile.role === 'admin') {
            await seedFirestoreIfEmpty(user.uid);
            setIsAdminSession(true);
            const sess = createSessionToken(
              'admin',
              'ADM-001',
              profile.nama || 'Admin OZdigiFinance',
              user.email || OWNER_ADMIN_EMAIL
            );
            persistSession(sess);
          } else {
            const sess = getValidSession();
            if (sess?.role === 'customer') {
              void linkCustomerUidByWhatsapp(
                customers,
                sess.whatsapp || '',
                user.uid
              );
            }
          }
        } catch (err) {
          console.warn('Firebase profile bootstrap info:', err);
        }
      })();
    });

    return () => unsub();
  }, []);

  // Automatic Cloud Sync Queue Flusher when Firebase Auth is active or connection returns
  useEffect(() => {
    if (!firebaseUser || !firebaseRole || !firebaseUser.emailVerified) return;

    const runFlush = () => {
      void flushCloudSyncQueue({
        role: firebaseRole,
        uid: firebaseUser.uid,
      }).then((res) => {
        setPendingSyncCount(res.remaining);
        if (res.synced > 0) {
          showToast(`${res.synced} data tersinkronisasi otomatis ke Cloud Firebase!`);
        }
      });
    };

    runFlush();
    window.addEventListener('online', runFlush);
    return () => window.removeEventListener('online', runFlush);
  }, [firebaseRole, firebaseUser, showToast]);

  // Firestore Real-time Subscriptions (Admin & Customer scoped)
  useEffect(() => {
    if (!firebaseUser || !firebaseRole || !firebaseUser.emailVerified) return;

    const unsubs: (() => void)[] = [];

    unsubs.push(
      subscribeFirestoreCustomers(
        { role: firebaseRole, uid: firebaseUser.uid },
        (list) => {
          setCustomers(list);
          if (firebaseRole === 'customer' && list[0]) {
            setActiveCustomerId(list[0].id);
            setDisplayName(list[0].officialName);
          }
        }
      )
    );

    unsubs.push(
      subscribeFirestoreSavings(
        { role: firebaseRole, uid: firebaseUser.uid },
        (list) => {
          setSavingsAccounts(list);
        }
      )
    );

    unsubs.push(
      subscribeFirestoreTransactions(
        { role: firebaseRole, uid: firebaseUser.uid },
        (list) => {
          setTransactions(list);
        }
      )
    );

    unsubs.push(
      subscribeConversations(
        { role: firebaseRole, uid: firebaseUser.uid },
        (convs) => {
          setFirestoreConversations(convs);
          if (initialConvLoadDoneRef.current) {
            const hasIncomingChat = convs.some((c) => {
              const prev = prevUnreadCountsRef.current[c.conversationId];
              return firebaseRole === 'admin'
                ? c.unreadAdmin > (prev?.admin ?? 0)
                : c.unreadCustomer > (prev?.customer ?? 0);
            });
            if (hasIncomingChat) {
              playCategoryNotificationSound('CHAT_MESSAGE', soundEnabled);
            }
          } else {
            initialConvLoadDoneRef.current = true;
          }

          const snapshotMap: Record<string, UnreadChatPair> = {};
          convs.forEach((c) => {
            snapshotMap[c.conversationId] = {
              admin: c.unreadAdmin,
              customer: c.unreadCustomer,
            };
          });
          prevUnreadCountsRef.current = snapshotMap;

          setUnreadChatMap((prev) => {
            const next = { ...prev };
            for (const c of convs) {
              next[c.customerId] = {
                admin: c.unreadAdmin,
                customer: c.unreadCustomer,
              };
            }
            return next;
          });
        }
      )
    );

    unsubs.push(
      subscribeUserNotifications(
        {
          role: firebaseRole,
          uid: firebaseUser.uid,
          custId: activeCustomer.id,
        },
        (items) => {
          setFirestoreNotifications(items);
          if (!initialNotifLoadDoneRef.current) {
            items.forEach((it) => seenFirestoreNotifIdsRef.current.add(it.notificationId));
            initialNotifLoadDoneRef.current = true;
            return;
          }
          const newlyAdded = items.filter(
            (it) => !it.isRead && !seenFirestoreNotifIdsRef.current.has(it.notificationId)
          );
          if (newlyAdded.length > 0) {
            newlyAdded.forEach((it) =>
              seenFirestoreNotifIdsRef.current.add(it.notificationId)
            );
            const hasTx = newlyAdded.some((it) => it.type === 'TRANSACTION_ALERT');
            playCategoryNotificationSound(
              hasTx ? 'TRANSACTION_ALERT' : 'CHAT_MESSAGE',
              soundEnabled
            );
            setBellUrgentKey((k) => k + 1);
            showToast(newlyAdded[0].title);
          }
        }
      )
    );

    let unsubFg: (() => void) | null = null;
    void subscribeForegroundPush((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'Pesan Baru';
      showToast(title);
    }).then((fn) => {
      unsubFg = fn;
    });

    return () => {
      unsubs.forEach((u) => u());
      if (unsubFg) unsubFg();
    };
  }, [firebaseUser, firebaseRole, activeCustomer.id, soundEnabled, showToast]);

  // Subscribe to Active Conversation Messages in Firestore
  const activeConversationId = useMemo(() => {
    if (currentView === 'admin') return selectedAdminChatCustId;
    return activeCustomer.id;
  }, [activeCustomer.id, currentView, selectedAdminChatCustId]);

  useEffect(() => {
    if (!firebaseUser || !firebaseRole || !firebaseUser.emailVerified || !activeConversationId) {
      setFirestoreRawMessages([]);
      setOldestCursor(null);
      setHasOlderMessages(false);
      return;
    }

    const convMatch = firestoreConversations.find(
      (c) => c.conversationId === activeConversationId
    );
    if (firebaseRole === 'customer' && !convMatch) {
      return;
    }

    const unsub = subscribeConversationMessages(
      activeConversationId,
      25,
      (rawMsgs, cursor) => {
        setFirestoreRawMessages(rawMsgs);
        setOldestCursor(cursor);
        setHasOlderMessages(rawMsgs.length >= 25 && Boolean(cursor));

        const uiMsgs = rawMsgs.map(toUiChatMessage);
        const older = olderMessagesByConv[activeConversationId] ?? [];
        const existingIds = new Set(uiMsgs.map((m) => m.id));
        const merged = [...older.filter((m) => !existingIds.has(m.id)), ...uiMsgs];
        setChatsByCustomer((prev) => ({
          ...prev,
          [activeConversationId]: merged,
        }));
      }
    );

    return () => unsub();
  }, [
    activeConversationId,
    firebaseRole,
    firebaseUser,
    firestoreConversations,
    olderMessagesByConv,
  ]);

  // Listen for Service Worker notification clicks and URL deep-link parameters
  useEffect(() => {
    const handleDeepTarget = (data?: {
      conversationId?: string;
      transactionId?: string;
      type?: string;
    }) => {
      if (!data) return;
      if (data.conversationId) {
        if (currentView === 'admin') {
          setSelectedAdminChatCustId(data.conversationId);
          setAdminPage('a-pesan');
        } else if (currentView === 'customer') {
          setCustPage('c-pesan');
        }
      } else if (data.transactionId) {
        if (currentView === 'admin') {
          setAdminPage('a-dashboard');
        } else if (currentView === 'customer') {
          setCustPage('c-beranda');
        }
      }
    };

    try {
      const params = new URLSearchParams(window.location.search);
      const openParam = params.get('open');
      const convParam = params.get('conversationId') || undefined;
      const txParam = params.get('transactionId') || undefined;
      if (openParam === 'chat' || convParam) {
        handleDeepTarget({ conversationId: convParam || activeCustomer.id });
      } else if (openParam === 'transaction' || txParam) {
        handleDeepTarget({ transactionId: txParam || 'tx' });
      } else if (openParam === 'register') {
        setActiveModal({ type: 'auth', mode: 'register' });
      } else if (openParam === 'login') {
        setActiveModal({ type: 'auth', mode: 'login' });
      }
    } catch {
      // Ignore query parse error
    }

    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OZF_NOTIFICATION_CLICK') {
        handleDeepTarget(event.data.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [activeCustomer.id, currentView]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!firebaseUser || !oldestCursor || !activeConversationId) return;
    try {
      const res = await loadOlderConversationMessages(
        activeConversationId,
        oldestCursor,
        25
      );
      const olderUi = res.messages.map(toUiChatMessage);
      setOldestCursor(res.nextCursor);
      setHasOlderMessages(res.messages.length >= 25 && Boolean(res.nextCursor));
      setOlderMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...olderUi, ...(prev[activeConversationId] ?? [])],
      }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat riwayat pesan.');
    }
  }, [activeConversationId, firebaseUser, oldestCursor, showToast]);

  // Mark messages read automatically when viewing Customer c-pesan or Admin a-pesan
  useEffect(() => {
    if (currentView === 'customer' && custPage === 'c-pesan') {
      const custId = activeCustomer.id;
      if (unreadChatMap[custId]?.customer) {
        setUnreadChatMap((prev) => ({
          ...prev,
          [custId]: {
            admin: prev[custId]?.admin ?? 0,
            customer: 0,
          },
        }));
      }
      setChatsByCustomer((prev) => {
        const list = prev[custId];
        if (!list || list.every((m) => m.sender !== 'admin' || m.status === 'read')) return prev;
        return {
          ...prev,
          [custId]: list.map((m) =>
            m.sender === 'admin' ? { ...m, status: 'read' as const } : m
          ),
        };
      });
      if (firebaseUser && firebaseUser.emailVerified && firestoreRawMessages.length > 0) {
        void markConversationMessagesRead({
          conversationId: custId,
          readerRole: 'customer',
          messages: firestoreRawMessages,
        }).catch(() => undefined);
      }
    }
  }, [
    activeCustomer.id,
    currentView,
    custPage,
    firebaseUser,
    firestoreRawMessages,
    unreadChatMap,
  ]);

  useEffect(() => {
    if (currentView === 'admin' && adminPage === 'a-pesan' && selectedAdminChatCustId) {
      const custId = selectedAdminChatCustId;
      if (unreadChatMap[custId]?.admin) {
        setUnreadChatMap((prev) => ({
          ...prev,
          [custId]: {
            admin: 0,
            customer: prev[custId]?.customer ?? 0,
          },
        }));
      }
      setChatsByCustomer((prev) => {
        const list = prev[custId];
        if (!list || list.every((m) => m.sender !== 'customer' || m.status === 'read')) {
          return prev;
        }
        return {
          ...prev,
          [custId]: list.map((m) =>
            m.sender === 'customer' ? { ...m, status: 'read' as const } : m
          ),
        };
      });
      if (firebaseUser && firebaseUser.emailVerified && firestoreRawMessages.length > 0) {
        void markConversationMessagesRead({
          conversationId: custId,
          readerRole: 'admin',
          messages: firestoreRawMessages,
        }).catch(() => undefined);
      }
    }
  }, [
    adminPage,
    currentView,
    firebaseUser,
    firestoreRawMessages,
    selectedAdminChatCustId,
    unreadChatMap,
  ]);

  const unreadChatByCustomer = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [cid, pair] of Object.entries(unreadChatMap) as [string, UnreadChatPair][]) {
      if (pair.admin > 0) out[cid] = pair.admin;
    }
    return out;
  }, [unreadChatMap]);

  const totalUnreadChatCount = useMemo(
    () =>
      (Object.values(unreadChatMap) as UnreadChatPair[]).reduce(
        (acc, p) => acc + (p.admin || 0),
        0
      ),
    [unreadChatMap]
  );

  const activeCustomerUnreadChatCount = useMemo(
    () => unreadChatMap[activeCustomer.id]?.customer ?? 0,
    [activeCustomer.id, unreadChatMap]
  );

  const pushCustomerNotification = useCallback(
    (payload: {
      id?: string;
      custId: string;
      category: 'warn' | 'pay' | 'sav';
      title: string;
      desc: string;
      transactionId?: string;
      conversationId?: string;
      playSound?: boolean;
      soundCategory?: 'CHAT_MESSAGE' | 'TRANSACTION_ALERT';
    }) => {
      const nowStr = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const notifId = payload.id || 'NTF-' + Date.now();
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notifId)) return prev;
        const next: CustomerNotification[] = [
          {
            id: notifId,
            custId: payload.custId,
            category: payload.category,
            title: payload.title,
            desc: payload.desc,
            time: `26 Nov 2026 · ${nowStr}`,
            unread: true,
            transactionId: payload.transactionId,
            conversationId: payload.conversationId,
          },
          ...prev,
        ];
        saveStoredNotifications(next);
        return next;
      });
      if (payload.playSound !== false) {
        playCategoryNotificationSound(
          payload.soundCategory ?? 'TRANSACTION_ALERT',
          soundEnabled
        );
        setBellUrgentKey((k) => k + 1);
      }
    },
    [soundEnabled]
  );

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      saveSoundEnabledPref(next);
      if (firebaseUser) {
        void updateUserSoundPreferenceInFirestore(firebaseUser.uid, next).catch(() => undefined);
        void syncDeviceTokenSoundPref(next).catch(() => undefined);
      }
      showToast(
        next ? 'Suara notifikasi diaktifkan.' : 'Suara notifikasi dinonaktifkan.'
      );
      return next;
    });
  }, [firebaseUser, showToast]);

  const handleEnablePush = useCallback(async () => {
    const role: 'admin' | 'customer' =
      currentView === 'admin' || firebaseRole === 'admin' ? 'admin' : 'customer';
    const res = await requestAndRegisterPushToken({
      uid: firebaseUser?.uid,
      custId: role === 'admin' ? 'ADM-001' : activeCustomer.id,
      role,
      soundEnabled,
    });
    setPushStatus(res);
    if (res.token) {
      showToast('Push Notification Firebase aktif pada perangkat ini!');
    } else if (res.permission === 'granted') {
      showToast('Notifikasi perangkat & suara aktif!');
    } else if (res.error) {
      showToast(res.error);
    }
  }, [activeCustomer.id, currentView, firebaseRole, firebaseUser?.uid, showToast, soundEnabled]);

  const handleLinkFirebaseGoogle = useCallback(async () => {
    try {
      const user = await signInWithFirebaseGoogle();
      setFirebaseConnected(true);
      const isEmailAdmin = isTrustedAdminEmail(user.email, user.emailVerified);
      const resolvedRole: 'admin' | 'customer' = isEmailAdmin ? 'admin' : 'customer';
      if (isEmailAdmin) {
        await seedFirestoreIfEmpty(user.uid);
      } else if (currentView === 'customer') {
        await linkCustomerUidByWhatsapp(customers, activeCustomer.whatsapp, user.uid);
        if (activeCustomer.loans.length === 0) {
          await saveCustomerToFirestore(activeCustomer, user.uid).catch(() => undefined);
          await ensureConversationDocInFirestore({
            customerId: activeCustomer.id,
            customerUid: user.uid,
            customerName: activeCustomer.officialName,
            customerWhatsapp: activeCustomer.whatsapp,
            adminId: 'ADMIN',
          }).catch(() => undefined);
        }
        const linkedSavings = savingsAccounts.find((a) => a.id === activeCustomer.id);
        if (linkedSavings) {
          await saveSavingsToFirestore(linkedSavings, user.uid).catch(() => undefined);
        }
      }
      const syncRes = await flushCloudSyncQueue({ role: resolvedRole, uid: user.uid });
      setPendingSyncCount(syncRes.remaining);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const res = await requestAndRegisterPushToken({
          uid: user.uid,
          custId: currentView === 'admin' ? 'ADM-001' : activeCustomer.id,
          role: currentView === 'admin' ? 'admin' : 'customer',
          soundEnabled,
        });
        setPushStatus(res);
      }
      showToast(
        syncRes.synced > 0
          ? `Akun Firebase terhubung & ${syncRes.synced} data tersinkronisasi!`
          : `Akun Firebase terhubung: ${user.email || user.uid}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('auth/unauthorized-domain')) {
        showToast(
          `Domain ${window.location.hostname} perlu ditambahkan ke Authorized Domains di Firebase Console.`
        );
      } else if (msg.includes('popup-closed-by-user')) {
        showToast('Penautan akun Google dibatalkan.');
      } else {
        showToast(msg || 'Gagal menautkan akun Google Firebase.');
      }
    }
  }, [
    activeCustomer,
    currentView,
    customers,
    savingsAccounts,
    showToast,
    soundEnabled,
  ]);

  // Navigation & Auth handlers
  const handleLogin = useCallback(
    (
      role: 'customer' | 'admin',
      userId: string,
      officialName: string,
      whatsapp?: string
    ) => {
      const matchedCust =
        role === 'customer'
          ? customers.find((c) => c.id === userId) ?? customers[0] ?? INITIAL_CUSTOMERS[0]
          : null;
      const resolvedId = matchedCust ? matchedCust.id : userId;
      const resolvedName = matchedCust ? matchedCust.officialName : officialName;
      const resolvedWa = matchedCust ? matchedCust.whatsapp : whatsapp;

      const session = createSessionToken(role, resolvedId, resolvedName, resolvedWa);
      persistSession(session);
      setIsAdminSession(session.role === 'admin');
      setActiveModal(null);
      setCurrentView(session.role);
      window.scrollTo({ top: 0, behavior: 'auto' });

      void testConnection().then((status) => {
        if (status.connected) setFirebaseConnected(true);
      });
      void registerFcmServiceWorker();
      void preloadCustomSounds();

      if (firebaseUser) {
        if (session.role === 'admin' && isTrustedAdminEmail(firebaseUser.email, firebaseUser.emailVerified)) {
          void seedFirestoreIfEmpty(firebaseUser.uid).catch(() => undefined);
        } else if (session.role === 'customer') {
          void linkCustomerUidByWhatsapp(customers, resolvedWa || '', firebaseUser.uid);
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          void requestAndRegisterPushToken({
            uid: firebaseUser.uid,
            custId: session.role === 'admin' ? 'ADM-001' : resolvedId,
            role: session.role,
            soundEnabled,
          }).then(setPushStatus);
        }
      }

      if (session.role === 'admin') {
        setAdminPage('a-dashboard');
        showToast('Login aktif: Panel Admin Operasional & Firebase Siap.');
      } else {
        setActiveCustomerId(resolvedId);
        setDisplayName(resolvedName);
        setCustPage('c-beranda');
        const hasUnread = notifications.some((n) => n.custId === resolvedId && n.unread);
        if (hasUnread) {
          playCategoryNotificationSound('TRANSACTION_ALERT', soundEnabled);
          setBellUrgentKey((k) => k + 1);
        }
        showToast(`Selamat datang kembali, ${resolvedName} (${resolvedId})!`);
      }
    },
    [customers, firebaseUser, notifications, showToast, soundEnabled]
  );

  const handleGoogleSignIn = useCallback(
    async (roleTab: 'customer' | 'admin'): Promise<{ ok: boolean; error?: string }> => {
      try {
        const user = await signInWithFirebaseGoogle();
        const isEmailAdmin = isTrustedAdminEmail(user.email, user.emailVerified);
        if (roleTab === 'admin' && !isEmailAdmin) {
          await signOutFirebase();
          return {
            ok: false,
            error: `Email ${user.email || ''} bukan akun Admin terdaftar (${OWNER_ADMIN_EMAIL} / ${ADMIN_EMAIL}).`,
          };
        }
        const role: 'admin' | 'customer' = isEmailAdmin && roleTab === 'admin' ? 'admin' : 'customer';
        if (role === 'admin') {
          await seedFirestoreIfEmpty(user.uid);
          const syncRes = await flushCloudSyncQueue({ role: 'admin', uid: user.uid });
          setPendingSyncCount(syncRes.remaining);
          handleLogin(
            'admin',
            'ADM-001',
            user.displayName || 'Admin OZdigiFinance',
            user.email || ADMIN_EMAIL
          );
        } else {
          let matched = customers.find(
            (c) => (c as CustomerRegistryItem & { ownerUid?: string }).ownerUid === user.uid
          );
          if (!matched) {
            const reg = registerNewCustomerAccount({
              existingCustomers: customers,
              officialName:
                user.displayName || user.email?.split('@')[0] || 'Nasabah OZdigiFinance',
              whatsapp: '0800' + String(Date.now()).slice(-8),
            });
            if (reg.ok) {
              matched = reg.customer;
              const initialSavings: SavingsAccount = {
                id: matched.id,
                officialName: matched.officialName,
                whatsapp: matched.whatsapp,
                program: defaultSavingsFreq,
                routine: 'Rp 0 / setoran',
                balance: 0,
                lastDate: '26 Nov 2026',
                status: 'Aktif',
              };
              setCustomers((prev) => [...prev, matched!]);
              setSavingsAccounts((prev) => [...prev, initialSavings]);
              setCustomerPasswords((prev) => {
                const next = { ...prev, [matched!.id]: reg.password };
                saveCustomerPasswords(next);
                return next;
              });
              await saveCustomerToFirestore(matched, user.uid).catch(() => undefined);
              await saveSavingsToFirestore(initialSavings, user.uid).catch(() => undefined);
              await ensureConversationDocInFirestore({
                customerId: matched.id,
                customerUid: user.uid,
                customerName: matched.officialName,
                customerWhatsapp: matched.whatsapp,
                adminId: 'ADMIN',
              }).catch(() => undefined);
            } else {
              matched = customers[0];
            }
          }
          handleLogin(
            'customer',
            matched.id,
            user.displayName || matched.officialName,
            matched.whatsapp
          );
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
        if (msg.includes('popup-closed-by-user')) {
          return { ok: false, error: 'Login Google dibatalkan.' };
        }
        return { ok: false, error: msg };
      }
    },
    [customers, defaultSavingsFreq, handleLogin]
  );

  const handleRegisterCustomer = useCallback(
    (
      officialName: string,
      whatsapp: string,
      password: string
    ): { ok: true } | { ok: false; error: string } => {
      const reg = registerNewCustomerAccount({
        existingCustomers: customers,
        officialName,
        whatsapp,
        password,
      });
      if (!reg.ok) return reg;

      const newCustomer = reg.customer;
      const ownerUid = firebaseUser?.emailVerified ? firebaseUser.uid : '';
      const initialSavings: SavingsAccount = {
        id: newCustomer.id,
        officialName: newCustomer.officialName,
        whatsapp: newCustomer.whatsapp,
        program: defaultSavingsFreq,
        routine: 'Rp 0 / setoran',
        balance: 0,
        lastDate: '26 Nov 2026',
        status: 'Aktif',
      };

      setCustomers((prev) => [...prev, newCustomer]);
      setSavingsAccounts((prev) => [...prev, initialSavings]);
      setChatsByCustomer((prev) => ({
        ...prev,
        [newCustomer.id]: prev[newCustomer.id] ?? [],
      }));
      setCustomerPasswords((prev) => {
        const next = { ...prev, [newCustomer.id]: reg.password };
        saveCustomerPasswords(next);
        return next;
      });

      void (async () => {
        await syncOrEnqueue(
          { kind: 'upsertCustomer', customer: newCustomer, ownerUid },
          () => saveCustomerToFirestore(newCustomer, ownerUid)
        );
        await syncOrEnqueue(
          { kind: 'upsertSavings', account: initialSavings, ownerUid },
          () => saveSavingsToFirestore(initialSavings, ownerUid)
        );
        await syncOrEnqueue(
          {
            kind: 'ensureConversation',
            customerId: newCustomer.id,
            customerUid: ownerUid,
            customerName: newCustomer.officialName,
            customerWhatsapp: newCustomer.whatsapp,
            adminId: 'ADMIN',
          },
          () =>
            ensureConversationDocInFirestore({
              customerId: newCustomer.id,
              customerUid: ownerUid,
              customerName: newCustomer.officialName,
              customerWhatsapp: newCustomer.whatsapp,
              adminId: 'ADMIN',
            })
        );
      })();

      const session = createSessionToken(
        'customer',
        newCustomer.id,
        newCustomer.officialName,
        newCustomer.whatsapp
      );
      persistSession(session);
      setIsAdminSession(false);
      setActiveModal(null);
      setActiveCustomerId(newCustomer.id);
      setDisplayName(newCustomer.officialName);
      setCustPage('c-beranda');
      setCurrentView('customer');
      window.scrollTo({ top: 0, behavior: 'auto' });
      showToast(
        `Pendaftaran berhasil! Selamat datang, ${newCustomer.officialName} (${newCustomer.id}).`
      );
      return { ok: true };
    },
    [customers, defaultSavingsFreq, firebaseUser, showToast, syncOrEnqueue]
  );

  const handleSwitchRole = useCallback(
    (targetRole: 'customer' | 'admin') => {
      const current = getValidSession();
      if (!current) {
        setActiveModal({
          type: 'auth',
          mode: 'login',
          initialTab: targetRole,
        });
        return;
      }
      if (targetRole === 'admin' && !isAdminSession) {
        setActiveModal({
          type: 'auth',
          mode: 'login',
          initialTab: 'admin',
        });
        showToast('Silakan masuk dengan akun Admin untuk mengakses Panel Admin.');
        return;
      }
      const updated = createSessionToken(
        targetRole,
        targetRole === 'admin' ? 'ADM-001' : activeCustomer.id,
        targetRole === 'admin' ? 'Admin OZdigiFinance' : activeCustomer.officialName,
        targetRole === 'admin' ? ADMIN_EMAIL : activeCustomer.whatsapp
      );
      persistSession(updated);
      setCurrentView(targetRole);
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (targetRole === 'admin') {
        setAdminPage('a-dashboard');
      } else {
        setCustPage('c-beranda');
        const hasUnread = notifications.some((n) => n.custId === activeCustomer.id && n.unread);
        if (hasUnread) {
          playCategoryNotificationSound('TRANSACTION_ALERT', soundEnabled);
          setBellUrgentKey((k) => k + 1);
        }
      }
    },
    [activeCustomer, isAdminSession, notifications, showToast, soundEnabled]
  );

  const handleExecuteLogout = useCallback(() => {
    clearPersistedSession();
    void removeCurrentDeviceToken();
    if (firebaseUser) {
      void signOutFirebase().catch(() => undefined);
    }
    setIsAdminSession(false);
    setActiveModal(null);
    setCurrentView('guest');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Anda telah keluar dari akun.');
  }, [firebaseUser, showToast]);

  // Swipe back gesture & popstate guard
  const handleBackNavigation = useCallback(() => {
    if (activeModal) {
      setActiveModal(null);
      return;
    }
    if (currentView === 'customer' && custPage !== 'c-beranda') {
      setCustPage('c-beranda');
      return;
    }
    if (currentView === 'admin' && adminPage !== 'a-dashboard') {
      setAdminPage('a-dashboard');
      return;
    }

    const now = Date.now();
    if (now - lastHomeBackTimeRef.current <= 2000) {
      lastHomeBackTimeRef.current = 0;
      showToast('Menutup aplikasi OZdigiFinance...');
    } else {
      lastHomeBackTimeRef.current = now;
      showToast('Swipe sekali lagi untuk keluar dari aplikasi.');
    }
  }, [activeModal, adminPage, currentView, custPage, showToast]);

  useEffect(() => {
    try {
      history.replaceState({ ozRoot: true }, '', '');
      history.pushState({ ozGuard: true }, '', '');
    } catch {
      // Ignore history restrictions
    }

    const onPopState = () => {
      handleBackNavigation();
      try {
        history.pushState({ ozGuard: true }, '', '');
      } catch {
        // Ignore
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleBackNavigation]);

  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let activeEdge: 'left' | 'right' | null = null;
    let swipeTriggered = false;

    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          'input, textarea, select, [contenteditable="true"], canvas, .overflow-x-auto'
        )
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isInteractive(e.target)) {
        activeEdge = null;
        return;
      }
      const t = e.touches[0];
      const vw = window.innerWidth;
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      swipeTriggered = false;

      if (touchStartX <= 42) activeEdge = 'left';
      else if (touchStartX >= vw - 42) activeEdge = 'right';
      else activeEdge = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeEdge || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = Math.abs(t.clientY - touchStartY);

      if (dy > 48 && Math.abs(dx) < dy) {
        activeEdge = null;
        setSwipeIndicator(null);
        return;
      }

      if (activeEdge === 'left' && dx > 35) {
        setSwipeIndicator('left');
        if (dx >= 78) swipeTriggered = true;
      } else if (activeEdge === 'right' && dx < -35) {
        setSwipeIndicator('right');
        if (dx <= -78) swipeTriggered = true;
      } else {
        setSwipeIndicator(null);
        swipeTriggered = false;
      }
    };

    const onTouchEnd = () => {
      setSwipeIndicator(null);
      if (activeEdge && swipeTriggered) {
        handleBackNavigation();
      }
      activeEdge = null;
      swipeTriggered = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleBackNavigation]);

  // Active Customer Savings & Notifications derived from unified state
  const activeCustomerSavings = useMemo(
    () => savingsAccounts.find((a) => a.id === activeCustomer.id),
    [activeCustomer.id, savingsAccounts]
  );

  const customerNotifications = useMemo(() => {
    const localMine = notifications.filter((n) => n.custId === activeCustomer.id);
    if (firebaseUser && firestoreNotifications.length > 0) {
      const mapped: CustomerNotification[] = firestoreNotifications.map((nf) => ({
        id: nf.notificationId,
        custId: activeCustomer.id,
        category:
          nf.type === 'SAVINGS_ALERT'
            ? 'sav'
            : nf.type === 'SYSTEM_INFO'
            ? 'warn'
            : 'pay',
        title: nf.title,
        desc: nf.body,
        time: formatFirestoreNotifTime(nf),
        unread: !nf.isRead,
        transactionId: nf.transactionId,
        conversationId: nf.conversationId,
      }));
      const seen = new Set(mapped.map((m) => m.id));
      return [...mapped, ...localMine.filter((m) => !seen.has(m.id))];
    }
    return localMine;
  }, [activeCustomer.id, firebaseUser, firestoreNotifications, notifications]);

  const unreadNotifCount = useMemo(
    () => customerNotifications.filter((n) => n.unread).length,
    [customerNotifications]
  );

  const handleChangeSavingsFreq = useCallback(
    (freq: SavingsFrequency) => {
      setDefaultSavingsFreq(freq);
      const ownerUid =
        (activeCustomer as CustomerRegistryItem & { ownerUid?: string }).ownerUid ||
        (firebaseUser?.emailVerified ? firebaseUser.uid : '');
      setSavingsAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id !== activeCustomer.id) return acc;
          const updated = { ...acc, program: freq };
          void syncOrEnqueue(
            { kind: 'upsertSavings', account: updated, ownerUid },
            () => saveSavingsToFirestore(updated, ownerUid)
          );
          return updated;
        })
      );
      showToast('Opsi tabungan diubah menjadi: ' + freq);
    },
    [activeCustomer, firebaseUser, showToast, syncOrEnqueue]
  );

  const handleCustomerDeposit = useCallback(
    (amount: number) => {
      const program = activeCustomerSavings?.program ?? defaultSavingsFreq;
      const ownerUid =
        (activeCustomer as CustomerRegistryItem & { ownerUid?: string }).ownerUid ||
        (firebaseUser?.emailVerified ? firebaseUser.uid : '');
      const updatedAcc: SavingsAccount = {
        id: activeCustomer.id,
        officialName: activeCustomer.officialName,
        whatsapp: activeCustomer.whatsapp,
        program,
        routine: `${formatRupiah(amount)} / setoran`,
        balance: (activeCustomerSavings?.balance ?? 0) + amount,
        lastDate: '26 Nov 2026',
        status: 'Aktif',
      };
      setSavingsAccounts((prev) => {
        const exists = prev.some((acc) => acc.id === activeCustomer.id);
        if (exists) {
          return prev.map((acc) => (acc.id === activeCustomer.id ? updatedAcc : acc));
        }
        return [...prev, updatedAcc];
      });
      setMonthlySavingsInflow((v) => v + amount);
      setSavingsMutations((prev) => [
        {
          id: 'MUT-' + Date.now(),
          date: '26 Nov 2026',
          officialName: activeCustomer.officialName,
          custId: activeCustomer.id,
          type: 'Setoran',
          program,
          amount,
        },
        ...prev,
      ]);

      const savTx: TransactionRecord = {
        id: 'SAV-20261126-' + String(Math.floor(100 + Math.random() * 899)),
        custId: activeCustomer.id,
        officialName: activeCustomer.officialName,
        description: 'Setoran Tabungan Digital',
        date: '26 Nov 2026',
        amount,
        status: 'Berhasil',
        scope: 'savings',
      };
      setTransactions((prev) => [savTx, ...prev]);

      void syncOrEnqueue(
        { kind: 'upsertSavings', account: updatedAcc, ownerUid },
        () => saveSavingsToFirestore(updatedAcc, ownerUid)
      );
      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: savTx,
          customerUid: ownerUid,
          adminId: 'ADMIN',
          sisaTagihan: activeCustomer.remainingDebt,
          jenisTransaksi: 'savings',
        },
        () =>
          saveTransactionDocToFirestore({
            tx: savTx,
            customerUid: ownerUid,
            adminId: 'ADMIN',
            sisaTagihan: activeCustomer.remainingDebt,
            jenisTransaksi: 'savings',
          })
      );

      pushCustomerNotification({
        custId: activeCustomer.id,
        category: 'sav',
        title: 'Setoran Tabungan Berhasil',
        desc: `Setoran tabungan ${formatRupiah(amount)} (${program}) berhasil dicatat ke rekening Anda.`,
        playSound: true,
        soundCategory: 'TRANSACTION_ALERT',
      });
      setActiveModal(null);
      showToast(`Setoran tabungan ${formatRupiah(amount)} berhasil ditambahkan!`);
    },
    [
      activeCustomer,
      activeCustomerSavings,
      defaultSavingsFreq,
      firebaseUser,
      pushCustomerNotification,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleSubmitPayProof = useCallback(
    (billLabel: string, amount: number) => {
      const txId = 'TRX-20261126-' + String(Math.floor(100 + Math.random() * 899));
      const ownerUid =
        (activeCustomer as CustomerRegistryItem & { ownerUid?: string }).ownerUid ||
        (firebaseUser?.emailVerified ? firebaseUser.uid : '');
      const proofTx: TransactionRecord = {
        id: txId,
        custId: activeCustomer.id,
        officialName: activeCustomer.officialName,
        description: billLabel,
        date: '26 Nov 2026',
        amount,
        status: 'Menunggu Verifikasi',
        scope: 'loan',
      };
      setTransactions((prev) => [proofTx, ...prev]);
      setPendingBills((prev) => [
        {
          id: 'BILL-' + Date.now(),
          dayBadge: '26',
          custId: activeCustomer.id,
          officialName: activeCustomer.officialName,
          whatsapp: activeCustomer.whatsapp,
          billTitle: billLabel,
          amount,
          subtitle: `${billLabel} · ${formatRupiah(amount)} · WA: ${activeCustomer.whatsapp} · Menunggu verifikasi`,
          verified: false,
        },
        ...prev,
      ]);

      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: proofTx,
          customerUid: ownerUid,
          adminId: 'ADMIN',
          sisaTagihan: activeCustomer.remainingDebt,
          jenisTransaksi: 'payment_proof',
        },
        () =>
          saveTransactionDocToFirestore({
            tx: proofTx,
            customerUid: ownerUid,
            adminId: 'ADMIN',
            sisaTagihan: activeCustomer.remainingDebt,
            jenisTransaksi: 'payment_proof',
          })
      );

      setAdminBellCount((c) => c + 1);
      showToast('Bukti pembayaran terkirim! Menunggu verifikasi Admin.');
      setCustPage('c-beranda');
    },
    [activeCustomer, firebaseUser, showToast, syncOrEnqueue]
  );

  // Two-Way Real-Time Chat: Customer -> Admin
  const handleSendChat = useCallback(
    (text: string, imageFile?: File | null) => {
      const custId = activeCustomer.id;
      const nowStr = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const conv = firestoreConversations.find((c) => c.conversationId === custId);
      const activeOwnerUid =
        (activeCustomer as CustomerRegistryItem & { ownerUid?: string }).ownerUid || '';
      const canUseFirestore =
        Boolean(firebaseUser?.emailVerified) &&
        (Boolean(conv?.customerUid && conv.customerUid === firebaseUser?.uid) ||
          activeOwnerUid === firebaseUser?.uid);

      if (canUseFirestore && firebaseUser) {
        void sendFirestoreChatMessage({
          conversationId: custId,
          customerId: custId,
          customerUid: firebaseUser.uid,
          customerName: activeCustomer.officialName,
          customerWhatsapp: activeCustomer.whatsapp,
          senderUid: firebaseUser.uid,
          senderRole: 'customer',
          senderName: activeCustomer.officialName,
          text,
          imageFile,
        }).catch((err) => {
          showToast(err instanceof Error ? err.message : 'Gagal mengirim pesan ke server.');
        });
        return;
      }

      if (imageFile && !canUseFirestore) {
        showToast(
          'Upload lampiran gambar ke Firebase Storage membutuhkan login Google (Firebase Cloud).'
        );
      }
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: 'MSG-' + Date.now(),
        sender: 'customer',
        senderRole: 'customer',
        senderName: activeCustomer.officialName,
        text: text.trim(),
        time: nowStr,
        messageType: 'text',
        status: 'sent',
      };
      setChatsByCustomer((prev) => ({
        ...prev,
        [custId]: [...(prev[custId] ?? []), userMsg],
      }));
      setUnreadChatMap((prev) => ({
        ...prev,
        [custId]: {
          admin: (prev[custId]?.admin ?? 0) + 1,
          customer: prev[custId]?.customer ?? 0,
        },
      }));
      setAdminBellCount((c) => c + 1);
    },
    [
      activeCustomer,
      firebaseUser,
      firestoreConversations,
      showToast,
    ]
  );

  // Two-Way Real-Time Chat: Admin -> Customer
  const handleSendAdminChat = useCallback(
    (custId: string, text: string, imageFile?: File | null) => {
      const targetCust = customers.find((c) => c.id === custId);
      const conv = firestoreConversations.find((c) => c.conversationId === custId);

      if (firebaseUser && firebaseRole === 'admin' && firebaseUser.emailVerified) {
        void sendFirestoreChatMessage({
          conversationId: custId,
          customerId: custId,
          customerUid: conv?.customerUid || '',
          customerName: targetCust?.officialName || custId,
          customerWhatsapp: targetCust?.whatsapp || '',
          senderUid: firebaseUser.uid,
          senderRole: 'admin',
          senderName: 'Admin OZdigiFinance',
          text,
          imageFile,
        }).catch((err) => {
          showToast(err instanceof Error ? err.message : 'Gagal mengirim pesan ke Firestore.');
        });
        return;
      }

      if (imageFile) {
        showToast(
          'Upload gambar ke Firebase Storage membutuhkan login Admin via Google (Firebase).'
        );
      }
      if (!text.trim()) return;

      const nowStr = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const adminMsg: ChatMessage = {
        id: 'MSG-ADM-' + Date.now(),
        sender: 'admin',
        senderRole: 'admin',
        senderName: 'Admin OZdigiFinance',
        text: text.trim(),
        time: nowStr,
        messageType: 'text',
        status: 'sent',
      };
      setChatsByCustomer((prev) => ({
        ...prev,
        [custId]: [...(prev[custId] ?? []), adminMsg],
      }));
      setUnreadChatMap((prev) => ({
        ...prev,
        [custId]: {
          admin: prev[custId]?.admin ?? 0,
          customer: (prev[custId]?.customer ?? 0) + 1,
        },
      }));
      pushCustomerNotification({
        custId,
        category: 'pay',
        title: 'Pesan Baru dari Admin OZdigiFinance',
        desc: text.trim(),
        conversationId: custId,
        playSound: true,
        soundCategory: 'CHAT_MESSAGE',
      });
    },
    [
      customers,
      firebaseRole,
      firebaseUser,
      firestoreConversations,
      pushCustomerNotification,
      showToast,
    ]
  );

  const handleVerifyBill = useCallback(
    (billId: string) => {
      const target = pendingBills.find((b) => b.id === billId);
      if (!target || target.verified) return;

      const targetCust = customers.find((c) => c.id === target.custId);
      const targetOwnerUid =
        (targetCust as (CustomerRegistryItem & { ownerUid?: string }) | undefined)?.ownerUid || '';
      const txId = 'TRX-20261126-VER-' + String(Math.floor(10 + Math.random() * 89));
      const newTx: TransactionRecord = {
        id: txId,
        custId: target.custId,
        officialName: target.officialName,
        description: `Pembayaran ${target.billTitle}`,
        date: '26 Nov 2026',
        amount: target.amount,
        status: 'Terverifikasi',
        scope: 'loan',
      };

      setPendingBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, verified: true } : b))
      );

      setTransactions((prev) => [newTx, ...prev]);

      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: newTx,
          customerUid: targetOwnerUid,
          adminId: firebaseUser?.uid || 'ADMIN',
          sisaTagihan: targetCust?.remainingDebt ?? 0,
          jenisTransaksi: 'loan',
        },
        firebaseRole === 'admin'
          ? () =>
              saveTransactionDocToFirestore({
                tx: newTx,
                customerUid: targetOwnerUid,
                adminId: firebaseUser?.uid || 'ADMIN',
                sisaTagihan: targetCust?.remainingDebt ?? 0,
                jenisTransaksi: 'loan',
              })
          : undefined
      );

      if (firebaseUser?.emailVerified && firebaseRole === 'admin' && targetOwnerUid) {
        void createNotificationDoc({
          notificationId: `NTF-${txId}`,
          recipientId: target.custId,
          recipientUid: targetOwnerUid,
          senderId: firebaseUser.uid,
          title: `Pembayaran ${target.billTitle} Terverifikasi`,
          body: `Pembayaran ${target.billTitle} sebesar ${formatRupiah(target.amount)} atas nama ${target.officialName} (${target.custId}) telah diverifikasi oleh Admin OZdigiFinance.`,
          type: 'TRANSACTION_ALERT',
          transactionId: txId,
        }).catch(() => undefined);
      }

      pushCustomerNotification({
        custId: target.custId,
        category: 'pay',
        title: `Pembayaran ${target.billTitle} Terverifikasi`,
        desc: `Pembayaran ${target.billTitle} sebesar ${formatRupiah(target.amount)} atas nama ${target.officialName} (${target.custId}) telah diverifikasi oleh Admin OZdigiFinance.`,
        transactionId: txId,
        playSound: true,
        soundCategory: 'TRANSACTION_ALERT',
      });

      showToast(`Pembayaran ${target.officialName} diverifikasi & notifikasi suara dikirim!`);
    },
    [
      customers,
      firebaseRole,
      firebaseUser,
      pendingBills,
      pushCustomerNotification,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleAdminPaySubmit = useCallback(
    (custId: string, officialName: string, desc: string, amount: number) => {
      const txId = 'TRX-20261126-ADM-' + String(Math.floor(10 + Math.random() * 89));
      const targetCust = customers.find((c) => c.id === custId);
      const targetOwnerUid =
        (targetCust as (CustomerRegistryItem & { ownerUid?: string }) | undefined)?.ownerUid || '';
      const tanggal = '26 Nov 2026';

      const newTx: TransactionRecord = {
        id: txId,
        custId,
        officialName,
        description: `Pembayaran ${desc}`,
        date: tanggal,
        amount,
        status: 'Terverifikasi',
        scope: 'loan',
      };
      setTransactions((prev) => [newTx, ...prev]);

      const sysText = formatPaymentSystemMessage({
        customerName: officialName,
        nominal: amount,
        tanggal,
        sisaTagihan: targetCust?.remainingDebt ?? 0,
      });
      setChatsByCustomer((prev) => ({
        ...prev,
        [custId]: [
          ...(prev[custId] ?? []),
          {
            id: `MSG-${txId}`,
            sender: 'admin',
            senderRole: 'system',
            senderName: 'SISTEM',
            text: sysText,
            time: new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            messageType: 'system_payment',
            transactionId: txId,
            status: 'sent',
          },
        ],
      }));
      setUnreadChatMap((prev) => ({
        ...prev,
        [custId]: {
          admin: prev[custId]?.admin ?? 0,
          customer: (prev[custId]?.customer ?? 0) + 1,
        },
      }));

      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: newTx,
          customerUid: targetOwnerUid,
          adminId: firebaseUser?.uid || 'ADMIN',
          sisaTagihan: targetCust?.remainingDebt ?? 0,
          jenisTransaksi: 'loan',
        },
        firebaseRole === 'admin'
          ? () =>
              saveTransactionDocToFirestore({
                tx: newTx,
                customerUid: targetOwnerUid,
                adminId: firebaseUser?.uid || 'ADMIN',
                sisaTagihan: targetCust?.remainingDebt ?? 0,
                jenisTransaksi: 'loan',
              })
          : undefined
      );

      if (firebaseUser?.emailVerified && firebaseRole === 'admin') {
        void sendFirestoreChatMessage({
          conversationId: custId,
          customerId: custId,
          customerUid: targetOwnerUid,
          customerName: officialName,
          customerWhatsapp: targetCust?.whatsapp || '',
          senderUid: firebaseUser.uid,
          senderRole: 'admin',
          senderName: 'Admin OZdigiFinance',
          text: sysText,
        }).catch(() => undefined);
      }

      pushCustomerNotification({
        id: `NTF-${txId}`,
        custId,
        category: 'pay',
        title: `Verifikasi ${desc} Berhasil`,
        desc: `Pembayaran ${desc} sebesar ${formatRupiah(amount)} atas nama ${officialName} (${custId}) telah diverifikasi oleh Admin OZdigiFinance.`,
        transactionId: txId,
        conversationId: custId,
        playSound: true,
        soundCategory: 'TRANSACTION_ALERT',
      });

      setActiveModal(null);
      showToast(`Pembayaran ${officialName} diverifikasi & pesan sistem dikirim!`);
    },
    [
      customers,
      firebaseRole,
      firebaseUser,
      pushCustomerNotification,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleAdminSavingsSubmit = useCallback(
    (custId: string, txType: 'setor' | 'tarik', amount: number, note: string) => {
      const targetAcc = savingsAccounts.find((a) => a.id === custId);
      if (!targetAcc) return;

      if (txType === 'tarik' && amount > targetAcc.balance) {
        showToast(
          `Saldo ${targetAcc.officialName} tidak mencukupi untuk penarikan ${formatRupiah(amount)}.`
        );
        return;
      }

      const targetCust = customers.find((c) => c.id === custId);
      const targetOwnerUid =
        (targetCust as (CustomerRegistryItem & { ownerUid?: string }) | undefined)?.ownerUid || '';

      const nextBalance =
        txType === 'setor' ? targetAcc.balance + amount : targetAcc.balance - amount;
      const updatedAcc: SavingsAccount = {
        ...targetAcc,
        balance: nextBalance,
        lastDate: txType === 'setor' ? '26 Nov 2026' : targetAcc.lastDate,
      };

      setSavingsAccounts((prev) =>
        prev.map((acc) => (acc.id !== custId ? acc : updatedAcc))
      );

      if (txType === 'setor') {
        setMonthlySavingsInflow((v) => v + amount);
      }

      setSavingsMutations((prev) => [
        {
          id: 'MUT-' + Date.now(),
          date: '26 Nov 2026',
          officialName: targetAcc.officialName,
          custId: targetAcc.id,
          type: txType === 'setor' ? 'Setoran' : 'Penarikan',
          program: targetAcc.program,
          amount,
          note,
        },
        ...prev,
      ]);

      const savTx: TransactionRecord = {
        id: 'SAV-20261126-ADM-' + String(Math.floor(10 + Math.random() * 89)),
        custId: targetAcc.id,
        officialName: targetAcc.officialName,
        description:
          txType === 'setor'
            ? 'Setoran Tabungan (Terverifikasi Admin)'
            : 'Penarikan Saldo Tabungan',
        date: '26 Nov 2026',
        amount,
        status: 'Terverifikasi',
        scope: 'savings',
      };
      setTransactions((prev) => [savTx, ...prev]);

      void syncOrEnqueue(
        { kind: 'upsertSavings', account: updatedAcc, ownerUid: targetOwnerUid },
        firebaseRole === 'admin'
          ? () => saveSavingsToFirestore(updatedAcc, targetOwnerUid)
          : undefined
      );
      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: savTx,
          customerUid: targetOwnerUid,
          adminId: firebaseUser?.uid || 'ADMIN',
          sisaTagihan: targetCust?.remainingDebt ?? 0,
          jenisTransaksi: 'savings',
        },
        firebaseRole === 'admin'
          ? () =>
              saveTransactionDocToFirestore({
                tx: savTx,
                customerUid: targetOwnerUid,
                adminId: firebaseUser?.uid || 'ADMIN',
                sisaTagihan: targetCust?.remainingDebt ?? 0,
                jenisTransaksi: 'savings',
              })
          : undefined
      );

      pushCustomerNotification({
        custId: targetAcc.id,
        category: 'sav',
        title:
          txType === 'setor'
            ? 'Verifikasi Setoran Tabungan Berhasil'
            : 'Verifikasi Penarikan Tabungan Berhasil',
        desc: `${txType === 'setor' ? 'Setoran' : 'Penarikan'} tabungan sebesar ${formatRupiah(
          amount
        )} (${targetAcc.program}) atas nama ${targetAcc.officialName} telah diverifikasi Admin${
          note ? ' · ' + note : ''
        }.`,
        playSound: true,
        soundCategory: 'TRANSACTION_ALERT',
      });

      setActiveModal(null);
      showToast(
        `${txType === 'setor' ? 'Setoran' : 'Penarikan'} ${formatRupiah(
          amount
        )} diverifikasi & notifikasi suara dikirim ke ${targetAcc.officialName}!`
      );
    },
    [
      customers,
      firebaseRole,
      firebaseUser,
      pushCustomerNotification,
      savingsAccounts,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleSaveCustomer = useCallback(
    (savedCustomer: CustomerRegistryItem, isNew: boolean) => {
      const normalizedWa = normalizePhoneDigits(savedCustomer.whatsapp);
      const duplicateWa = customers.find(
        (c) =>
          c.id !== savedCustomer.id &&
          normalizePhoneDigits(c.whatsapp) === normalizedWa &&
          normalizedWa.length > 0
      );
      if (duplicateWa) {
        showToast(
          `Nomor WhatsApp ${savedCustomer.whatsapp} sudah digunakan oleh ${duplicateWa.officialName} (${duplicateWa.id}).`
        );
        return;
      }

      if (isNew) {
        if (customers.some((c) => c.id === savedCustomer.id)) {
          showToast(`ID ${savedCustomer.id} sudah digunakan, gunakan ID lain.`);
          return;
        }
        const defaultSavings: SavingsAccount = {
          id: savedCustomer.id,
          officialName: savedCustomer.officialName,
          whatsapp: savedCustomer.whatsapp,
          program: defaultSavingsFreq,
          routine: 'Rp 0 / setoran',
          balance: 0,
          lastDate: '26 Nov 2026',
          status: 'Aktif',
        };
        setCustomers((prev) => [...prev, savedCustomer]);
        setSavingsAccounts((prev) =>
          prev.some((a) => a.id === savedCustomer.id) ? prev : [...prev, defaultSavings]
        );
        setChatsByCustomer((prev) => ({
          ...prev,
          [savedCustomer.id]: prev[savedCustomer.id] ?? [],
        }));
        setCustomerPasswords((prev) => {
          const next = ensureCustomerDefaultPassword(savedCustomer, prev);
          saveCustomerPasswords(next);
          return next;
        });

        void (async () => {
          await syncOrEnqueue(
            { kind: 'upsertCustomer', customer: savedCustomer },
            firebaseRole === 'admin' ? () => saveCustomerToFirestore(savedCustomer) : undefined
          );
          await syncOrEnqueue(
            { kind: 'upsertSavings', account: defaultSavings },
            firebaseRole === 'admin' ? () => saveSavingsToFirestore(defaultSavings) : undefined
          );
          await syncOrEnqueue(
            {
              kind: 'ensureConversation',
              customerId: savedCustomer.id,
              customerUid: '',
              customerName: savedCustomer.officialName,
              customerWhatsapp: savedCustomer.whatsapp,
              adminId: firebaseUser?.uid || 'ADMIN',
            },
            firebaseRole === 'admin'
              ? () =>
                  ensureConversationDocInFirestore({
                    customerId: savedCustomer.id,
                    customerUid: '',
                    customerName: savedCustomer.officialName,
                    customerWhatsapp: savedCustomer.whatsapp,
                    adminId: firebaseUser?.uid || 'ADMIN',
                  })
              : undefined
          );
        })();

        showToast(
          `Nasabah baru ${savedCustomer.officialName} (${savedCustomer.id}) berhasil ditambahkan & siap login dengan No. WhatsApp!`
        );
      } else {
        setCustomers((prev) =>
          prev.map((c) => (c.id === savedCustomer.id ? savedCustomer : c))
        );
        void syncOrEnqueue(
          { kind: 'upsertCustomer', customer: savedCustomer },
          firebaseRole === 'admin' ? () => saveCustomerToFirestore(savedCustomer) : undefined
        );
        setSavingsAccounts((prev) =>
          prev.map((acc) => {
            if (acc.id !== savedCustomer.id) return acc;
            const nextAcc = {
              ...acc,
              officialName: savedCustomer.officialName,
              whatsapp: savedCustomer.whatsapp,
            };
            void syncOrEnqueue(
              { kind: 'upsertSavings', account: nextAcc },
              firebaseRole === 'admin' ? () => saveSavingsToFirestore(nextAcc) : undefined
            );
            return nextAcc;
          })
        );
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.custId === savedCustomer.id
              ? { ...tx, officialName: savedCustomer.officialName }
              : tx
          )
        );
        setPendingBills((prev) =>
          prev.map((bill) =>
            bill.custId === savedCustomer.id
              ? {
                  ...bill,
                  officialName: savedCustomer.officialName,
                  whatsapp: savedCustomer.whatsapp,
                }
              : bill
          )
        );
        if (activeCustomerId === savedCustomer.id) {
          setDisplayName(savedCustomer.officialName);
        }
        showToast(`Data nasabah ${savedCustomer.officialName} berhasil diperbarui.`);
      }
      setActiveModal(null);
    },
    [
      activeCustomerId,
      customers,
      defaultSavingsFreq,
      firebaseRole,
      firebaseUser,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleDeleteCustomer = useCallback(
    (custId: string) => {
      const target = customers.find((c) => c.id === custId);
      const nextCustomers = customers.filter((c) => c.id !== custId);
      setCustomers(nextCustomers);
      setSavingsAccounts((prev) => prev.filter((acc) => acc.id !== custId));
      setPendingBills((prev) => prev.filter((b) => b.custId !== custId));
      void syncOrEnqueue(
        { kind: 'deleteCustomer', custId },
        firebaseRole === 'admin' ? () => deleteCustomerFromFirestore(custId) : undefined
      );
      void syncOrEnqueue(
        { kind: 'deleteSavings', custId },
        firebaseRole === 'admin' ? () => deleteSavingsFromFirestore(custId) : undefined
      );
      if (activeCustomerId === custId && nextCustomers[0]) {
        setActiveCustomerId(nextCustomers[0].id);
        setDisplayName(nextCustomers[0].officialName);
      }
      if (selectedAdminChatCustId === custId && nextCustomers[0]) {
        setSelectedAdminChatCustId(nextCustomers[0].id);
      }
      setActiveModal(null);
      showToast(`Data nasabah ${target?.officialName ?? custId} berhasil dihapus.`);
    },
    [
      activeCustomerId,
      customers,
      firebaseRole,
      selectedAdminChatCustId,
      showToast,
      syncOrEnqueue,
    ]
  );

  const handleConvertLoanToSavings = useCallback(
    (custId: string, loanId: string, program: SavingsFrequency, amount: number) => {
      const targetCust = customers.find((c) => c.id === custId);
      if (!targetCust) return;
      const targetLoan = targetCust.loans.find((l) => l.id === loanId);
      const remainingLoans = targetCust.loans.filter((l) => l.id !== loanId);

      const updatedCustomer = summarizeCustomerFromLoans({
        id: targetCust.id,
        officialName: targetCust.officialName,
        whatsapp: targetCust.whatsapp,
        status: targetCust.status,
        loans: remainingLoans,
      });

      setCustomers((prev) => prev.map((c) => (c.id === custId ? updatedCustomer : c)));
      void syncOrEnqueue(
        { kind: 'upsertCustomer', customer: updatedCustomer },
        firebaseRole === 'admin' ? () => saveCustomerToFirestore(updatedCustomer) : undefined
      );

      const existingAcc = savingsAccounts.find((acc) => acc.id === custId);
      const nextAcc: SavingsAccount = existingAcc
        ? {
            ...existingAcc,
            program,
            balance: existingAcc.balance + amount,
            lastDate: '26 Nov 2026',
            routine: `${formatRupiah(amount)} / setoran`,
          }
        : {
            id: targetCust.id,
            officialName: targetCust.officialName,
            whatsapp: targetCust.whatsapp,
            program,
            routine: `${formatRupiah(amount)} / setoran`,
            balance: amount,
            lastDate: '26 Nov 2026',
            status: 'Aktif',
          };

      setSavingsAccounts((prev) =>
        existingAcc
          ? prev.map((acc) => (acc.id === custId ? nextAcc : acc))
          : [...prev, nextAcc]
      );
      void syncOrEnqueue(
        { kind: 'upsertSavings', account: nextAcc },
        firebaseRole === 'admin' ? () => saveSavingsToFirestore(nextAcc) : undefined
      );

      if (amount > 0) {
        setMonthlySavingsInflow((v) => v + amount);
      }

      const sourceLabel = targetLoan?.productName ?? 'Pinjaman';
      setSavingsMutations((prev) => [
        {
          id: 'MUT-CONV-' + Date.now(),
          date: '26 Nov 2026',
          officialName: targetCust.officialName,
          custId: targetCust.id,
          type: 'Setoran',
          program,
          amount,
          note: `Konversi dari pinjaman ${sourceLabel}`,
        },
        ...prev,
      ]);

      const convTx: TransactionRecord = {
        id: 'SAV-CONV-' + String(Math.floor(100 + Math.random() * 899)),
        custId: targetCust.id,
        officialName: targetCust.officialName,
        description: `Konversi Pinjaman (${sourceLabel}) ke Tabungan`,
        date: '26 Nov 2026',
        amount,
        status: 'Terverifikasi',
        scope: 'savings',
      };
      setTransactions((prev) => [convTx, ...prev]);

      const targetOwnerUid =
        (targetCust as CustomerRegistryItem & { ownerUid?: string }).ownerUid || '';
      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: convTx,
          customerUid: targetOwnerUid,
          adminId: firebaseUser?.uid || 'ADMIN',
          sisaTagihan: updatedCustomer.remainingDebt,
          jenisTransaksi: 'savings',
        },
        firebaseRole === 'admin'
          ? () =>
              saveTransactionDocToFirestore({
                tx: convTx,
                customerUid: targetOwnerUid,
                adminId: firebaseUser?.uid || 'ADMIN',
                sisaTagihan: updatedCustomer.remainingDebt,
                jenisTransaksi: 'savings',
              })
          : undefined
      );

      setActiveModal(null);
      showToast(
        `${sourceLabel} milik ${targetCust.officialName} berhasil diubah menjadi Tabungan (${program}).`
      );
    },
    [customers, firebaseRole, firebaseUser, savingsAccounts, showToast, syncOrEnqueue]
  );

  const handleConvertSavingsToLoan = useCallback(
    (
      custId: string,
      productName: string,
      monthlyInstallment: number,
      totalInstallments: number,
      dueDateDay: string
    ) => {
      const targetAcc = savingsAccounts.find((a) => a.id === custId);
      if (!targetAcc) return;

      const newLoan: LoanItem = buildLoanItem({
        id: `LN-CONV-${Date.now()}`,
        productName,
        monthlyInstallment,
        paidInstallments: 0,
        totalInstallments,
        dueDateDay,
      });

      const existingCust = customers.find((c) => c.id === custId);
      const updatedCustomer = existingCust
        ? summarizeCustomerFromLoans({
            id: existingCust.id,
            officialName: existingCust.officialName,
            whatsapp: existingCust.whatsapp,
            status: 'Aktif',
            loans: [...existingCust.loans, newLoan],
          })
        : summarizeCustomerFromLoans({
            id: targetAcc.id,
            officialName: targetAcc.officialName,
            whatsapp: targetAcc.whatsapp,
            status: 'Aktif',
            loans: [newLoan],
          });

      setCustomers((prev) =>
        existingCust
          ? prev.map((c) => (c.id === custId ? updatedCustomer : c))
          : [...prev, updatedCustomer]
      );
      setSavingsAccounts((prev) => prev.filter((a) => a.id !== custId));

      void syncOrEnqueue(
        { kind: 'upsertCustomer', customer: updatedCustomer },
        firebaseRole === 'admin' ? () => saveCustomerToFirestore(updatedCustomer) : undefined
      );
      void syncOrEnqueue(
        { kind: 'deleteSavings', custId },
        firebaseRole === 'admin' ? () => deleteSavingsFromFirestore(custId) : undefined
      );

      const convTx: TransactionRecord = {
        id: 'TRX-CONV-' + String(Math.floor(100 + Math.random() * 899)),
        custId: targetAcc.id,
        officialName: targetAcc.officialName,
        description: `Konversi Tabungan menjadi Pinjaman (${productName})`,
        date: '26 Nov 2026',
        amount: monthlyInstallment * totalInstallments,
        status: 'Terverifikasi',
        scope: 'loan',
      };
      setTransactions((prev) => [convTx, ...prev]);

      const targetOwnerUid =
        (existingCust as (CustomerRegistryItem & { ownerUid?: string }) | undefined)?.ownerUid ||
        '';
      void syncOrEnqueue(
        {
          kind: 'upsertTransaction',
          tx: convTx,
          customerUid: targetOwnerUid,
          adminId: firebaseUser?.uid || 'ADMIN',
          sisaTagihan: updatedCustomer.remainingDebt,
          jenisTransaksi: 'loan',
        },
        firebaseRole === 'admin'
          ? () =>
              saveTransactionDocToFirestore({
                tx: convTx,
                customerUid: targetOwnerUid,
                adminId: firebaseUser?.uid || 'ADMIN',
                sisaTagihan: updatedCustomer.remainingDebt,
                jenisTransaksi: 'loan',
              })
          : undefined
      );

      setActiveModal(null);
      showToast(
        `Tabungan ${targetAcc.officialName} berhasil diubah menjadi Pinjaman (${productName}).`
      );
    },
    [customers, firebaseRole, firebaseUser, savingsAccounts, showToast, syncOrEnqueue]
  );

  const handleDownloadCsv = useCallback(() => {
    const csv = buildTransactionsCsv(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Laporan_OZdigiFinance_2026.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Laporan CSV berhasil diunduh.');
  }, [showToast, transactions]);

  const handleAdminChangeCustomerPassword = useCallback(
    (custId: string, newPassword: string) => {
      const target = customers.find((c) => c.id === custId);
      setCustomerPasswords((prev) => {
        const next = { ...prev, [custId]: newPassword };
        saveCustomerPasswords(next);
        return next;
      });
      setActiveModal(null);
      showToast(
        `Password login ${target?.officialName ?? custId} berhasil diperbarui.`
      );
    },
    [customers, showToast]
  );

  // Atomic & Idempotent Loan Payment Handler (Automated Ledger + System Chat + Notification)
  const handleConfirmLoanPayment = useCallback(
    async (custId: string, loanId: string, mode: 'monthly' | 'full') => {
      const targetCust = customers.find((c) => c.id === custId);
      if (!targetCust) return;
      const targetLoan = targetCust.loans.find((l) => l.id === loanId);
      if (!targetLoan) {
        showToast('Kontrak pinjaman tidak ditemukan.');
        setActiveModal(null);
        return;
      }

      const deterministicTxId = buildDeterministicLoanTxId({
        custId,
        loanId,
        mode,
        paidInstallmentsBefore: targetLoan.paidInstallments,
      });

      // Frontend idempotency guard against rapid duplicate clicks or retry
      if (
        inFlightPaymentIdsRef.current.has(deterministicTxId) ||
        transactions.some((t) => t.id === deterministicTxId)
      ) {
        showToast('Pembayaran untuk angsuran ini sudah tercatat (idempoten).');
        setActiveModal(null);
        return;
      }

      inFlightPaymentIdsRef.current.add(deterministicTxId);
      const tanggal = new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      try {
        if (firebaseUser && firebaseRole === 'admin' && firebaseUser.emailVerified) {
          const atomicRes = await recordAdminLoanPaymentAtomic({
            adminUid: firebaseUser.uid,
            customer: targetCust,
            loanId,
            mode,
            tanggal,
          });
          if (!atomicRes) {
            showToast('Kontrak pinjaman sudah lunas.');
            setActiveModal(null);
            return;
          }
          if (atomicRes.duplicate) {
            showToast('Transaksi sudah pernah tercatat sebelumnya (idempoten).');
            setActiveModal(null);
            return;
          }

          // Optional backend ID token audit verification
          void firebaseUser.getIdToken().then((token) =>
            fetch('/api/transactions/audit-check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                transactionId: atomicRes.transactionId,
                customerId: custId,
                nominal: atomicRes.paidAmount,
              }),
            }).catch(() => undefined)
          );

          setActiveModal(null);
          showToast(
            `Pembayaran ${targetCust.officialName} tercatat atomik di Firestore & pesan sistem terkirim!`
          );
          return;
        }

        // Offline / Local-Session mode executing identical invariant steps cleanly
        const result = applyLoanPayment(targetCust, loanId, mode);
        if (!result) {
          showToast('Kontrak pinjaman sudah lunas atau tidak ditemukan.');
          setActiveModal(null);
          return;
        }

        const systemMessageText = formatPaymentSystemMessage({
          customerName: targetCust.officialName,
          nominal: result.paidAmount,
          tanggal,
          sisaTagihan: result.updatedCustomer.remainingDebt,
        });

        setCustomers((prev) =>
          prev.map((c) => (c.id === custId ? result.updatedCustomer : c))
        );

        setPendingBills((prev) =>
          prev.map((bill) => (bill.custId === custId ? { ...bill, verified: true } : bill))
        );

        setTransactions((prev) => {
          if (prev.some((t) => t.id === deterministicTxId)) return prev;
          return [
            {
              id: deterministicTxId,
              custId,
              officialName: targetCust.officialName,
              description: result.isFullyPaid
                ? `Pelunasan Penuh ${result.productName}`
                : `Pembayaran Bulanan ${result.productName} (Ke-${result.installmentNumber})`,
              date: tanggal,
              amount: result.paidAmount,
              status: 'Terverifikasi',
              scope: 'loan',
            },
            ...prev,
          ];
        });

        const sysMsgId = `MSG-${deterministicTxId}`;
        const timeStr = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setChatsByCustomer((prev) => {
          const existing = prev[custId] ?? [];
          if (existing.some((m) => m.id === sysMsgId)) return prev;
          return {
            ...prev,
            [custId]: [
              ...existing,
              {
                id: sysMsgId,
                sender: 'admin',
                senderRole: 'system',
                senderName: 'SISTEM',
                text: systemMessageText,
                time: timeStr,
                messageType: 'system_payment',
                transactionId: deterministicTxId,
                status: 'sent',
              },
            ],
          };
        });

        setUnreadChatMap((prev) => ({
          ...prev,
          [custId]: {
            admin: prev[custId]?.admin ?? 0,
            customer: (prev[custId]?.customer ?? 0) + 1,
          },
        }));

        pushCustomerNotification({
          id: `NTF-${deterministicTxId}`,
          custId,
          category: 'pay',
          title: result.isFullyPaid
            ? `Pelunasan Pinjaman Lunas — ${result.productName}`
            : `Pembayaran Bulan Ini Lunas — ${result.productName}`,
          desc: `Pembayaran ${result.productName} (${
            result.isFullyPaid
              ? 'Pelunasan Penuh'
              : `Angsuran ke-${result.installmentNumber}`
          }) sebesar ${formatRupiah(result.paidAmount)} atas nama ${
            targetCust.officialName
          } (${targetCust.id}) untuk bulan ini telah LUNAS dan diverifikasi Admin.`,
          transactionId: deterministicTxId,
          conversationId: custId,
          playSound: true,
          soundCategory: 'TRANSACTION_ALERT',
        });

        setActiveModal(null);
        showToast(
          `Pembayaran ${targetCust.officialName} (${result.productName}) lunas & pesan sistem otomatis terkirim!`
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal memproses transaksi pembayaran.'
        );
      } finally {
        inFlightPaymentIdsRef.current.delete(deterministicTxId);
      }
    },
    [
      customers,
      firebaseRole,
      firebaseUser,
      pushCustomerNotification,
      showToast,
      transactions,
    ]
  );

  const handleSaveProfile = useCallback(
    (newName: string, avatarDataUrl: string, newPass: string) => {
      if (newName) {
        setDisplayName(newName);
        try {
          localStorage.setItem(DISPLAY_NAME_KEY, newName);
        } catch {
          // Ignore
        }
        if (firebaseUser?.emailVerified) {
          void updateUserProfileInFirestore({
            uid: firebaseUser.uid,
            nama: newName,
          });
        }
      }
      if (avatarDataUrl) {
        setAvatarUrl(avatarDataUrl);
        try {
          localStorage.setItem(AVATAR_KEY, avatarDataUrl);
        } catch {
          // Ignore
        }
      }
      if (newPass) {
        if (currentView === 'admin') {
          setAdminPassword(newPass);
          saveAdminPassword(newPass);
        } else {
          setCustomerPasswords((prev) => {
            const next = { ...prev, [activeCustomer.id]: newPass };
            saveCustomerPasswords(next);
            return next;
          });
        }
        if (firebaseUser) {
          void updateFirebasePassword(newPass).catch(() => undefined);
        }
      }
      setActiveModal(null);
      showToast(
        newPass
          ? 'Profil & password akun berhasil diperbarui!'
          : `Profil diperbarui! Nama resmi di kontrak & data Admin tetap ${activeCustomer.officialName}.`
      );
    },
    [activeCustomer.id, activeCustomer.officialName, currentView, firebaseUser, showToast]
  );

  return (
    <>
      {/* Swipe Edge Visual Indicator */}
      {swipeIndicator && (
        <div
          aria-hidden="true"
          className={`fixed top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg z-50 pointer-events-none ${
            swipeIndicator === 'left' ? 'left-3' : 'right-3'
          }`}
        >
          {swipeIndicator === 'left' ? '←' : '→'}
        </div>
      )}

      {/* Active View */}
      {currentView === 'guest' && (
        <GuestView
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenAuth={(mode) => setActiveModal({ type: 'auth', mode })}
        />
      )}

      {currentView === 'customer' && (
        <CustomerView
          customer={activeCustomer}
          activePage={custPage}
          onNavigate={(page) => {
            setCustPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          displayName={displayName}
          avatarUrl={avatarUrl}
          savingsBalance={activeCustomerSavings?.balance ?? 0}
          savingsFreq={activeCustomerSavings?.program ?? defaultSavingsFreq}
          onChangeSavingsFreq={handleChangeSavingsFreq}
          transactions={transactions}
          unreadNotifCount={unreadNotifCount}
          unreadChatCount={activeCustomerUnreadChatCount}
          bellUrgentKey={bellUrgentKey}
          onOpenNotifs={() => setActiveModal({ type: 'notifs' })}
          onOpenProfile={() => setActiveModal({ type: 'profile' })}
          onOpenDeposit={() => setActiveModal({ type: 'deposit' })}
          onSubmitPayProof={handleSubmitPayProof}
          chatMessages={chatsByCustomer[activeCustomer.id] ?? []}
          hasOlderMessages={hasOlderMessages}
          onLoadOlderMessages={() => void handleLoadOlderMessages()}
          onSendChat={handleSendChat}
          onSwitchToAdmin={() => handleSwitchRole('admin')}
          onRequestLogout={() => setActiveModal({ type: 'logout' })}
          onToast={showToast}
        />
      )}

      {currentView === 'admin' && (
        <AdminView
          activePage={adminPage}
          onNavigate={(page) => {
            setAdminPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          displayName={displayName}
          avatarUrl={avatarUrl}
          activeCustomerName={activeCustomer.officialName}
          customers={customers}
          transactions={transactions}
          savingsAccounts={savingsAccounts}
          savingsMutations={savingsMutations}
          monthlySavingsInflow={monthlySavingsInflow}
          pendingBills={pendingBills}
          chatsByCustomer={chatsByCustomer}
          unreadChatByCustomer={unreadChatByCustomer}
          totalUnreadChatCount={totalUnreadChatCount}
          hasOlderMessages={hasOlderMessages}
          onLoadOlderMessages={() => void handleLoadOlderMessages()}
          selectedChatCustId={selectedAdminChatCustId}
          onSelectChatCustomer={(custId) => setSelectedAdminChatCustId(custId)}
          onSendAdminChat={handleSendAdminChat}
          adminBellCount={adminBellCount}
          onClearAdminBell={() => setAdminBellCount(0)}
          onVerifyBill={handleVerifyBill}
          onOpenAdminPay={() => setActiveModal({ type: 'adminPay' })}
          onOpenAdminSavings={(custId, txType) =>
            setActiveModal({ type: 'adminSavings', custId, txType })
          }
          onAddCustomer={() => setActiveModal({ type: 'customerEditor', customer: null })}
          onEditCustomer={(cust) => setActiveModal({ type: 'customerEditor', customer: cust })}
          onDeleteCustomer={(cust) => setActiveModal({ type: 'confirmDelete', customer: cust })}
          onChangeCustomerPassword={(cust) =>
            setActiveModal({ type: 'changeCustPass', customer: cust })
          }
          onOpenLoanPay={(customer, loan) =>
            setActiveModal({ type: 'loanPay', customer, loan })
          }
          onConvertLoanToSavings={(custId, officialName, loan) =>
            setActiveModal({
              type: 'convertType',
              target: { mode: 'loanToSavings', custId, officialName, loan },
            })
          }
          onConvertSavingsToLoan={(account) =>
            setActiveModal({
              type: 'convertType',
              target: { mode: 'savingsToLoan', account },
            })
          }
          onDownloadCsv={handleDownloadCsv}
          onOpenProfile={() => setActiveModal({ type: 'profile' })}
          onSwitchToCustomer={() => handleSwitchRole('customer')}
          onRequestLogout={() => setActiveModal({ type: 'logout' })}
          onToast={showToast}
        />
      )}

      {/* Modals */}
      {activeModal?.type === 'notifs' && (
        <NotifCenterModal
          notifications={customerNotifications}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          pushPermission={pushStatus?.permission}
          onEnablePush={() => void handleEnablePush()}
          onTestChime={() => {
            playCategoryNotificationSound('TRANSACTION_ALERT', true);
            setBellUrgentKey((k) => k + 1);
            showToast('Nada pemberitahuan diputar.');
          }}
          onToast={showToast}
          onMarkAllRead={() => {
            setNotifications((prev) => {
              const next = prev.map((n) =>
                n.custId === activeCustomer.id ? { ...n, unread: false } : n
              );
              saveStoredNotifications(next);
              return next;
            });
            if (firebaseUser && firestoreNotifications.length > 0) {
              void markAllUserNotificationsRead(firestoreNotifications).catch(() => undefined);
            }
            showToast('Semua pemberitahuan ditandai sudah dibaca.');
          }}
          onMarkSingleRead={(id) => {
            setNotifications((prev) => {
              const next = prev.map((n) => (n.id === id ? { ...n, unread: false } : n));
              saveStoredNotifications(next);
              return next;
            });
            if (firebaseUser && firestoreNotifications.some((nf) => nf.notificationId === id)) {
              void markNotificationAsRead(id).catch(() => undefined);
            }
          }}
          onOpenTarget={(notif) => {
            setActiveModal(null);
            if (notif.conversationId) {
              if (currentView === 'admin') {
                setSelectedAdminChatCustId(notif.conversationId);
                setAdminPage('a-pesan');
              } else {
                setCustPage('c-pesan');
              }
            } else if (notif.transactionId) {
              setCustPage('c-beranda');
            }
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'profile' && (
        <ProfileModal
          currentView={currentView}
          isAdminSession={isAdminSession}
          activeUserId={currentView === 'admin' ? 'ADM-001' : activeCustomer.id}
          activeUserIdentifier={
            currentView === 'admin' ? ADMIN_EMAIL : activeCustomer.whatsapp
          }
          displayName={displayName}
          officialName={activeCustomer.officialName}
          firebaseEmail={firebaseUser?.email ?? null}
          firebaseConnected={firebaseConnected}
          pendingSyncCount={pendingSyncCount}
          onLinkFirebaseGoogle={handleLinkFirebaseGoogle}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          pushStatus={pushStatus}
          onEnablePush={handleEnablePush}
          onSwitchRole={handleSwitchRole}
          onPreviewGuest={() => setCurrentView('guest')}
          onSaveProfile={handleSaveProfile}
          onRequestLogout={() => setActiveModal({ type: 'logout' })}
          onClose={() => setActiveModal(null)}
          onToast={showToast}
        />
      )}

      {activeModal?.type === 'auth' && (
        <AuthModal
          mode={activeModal.mode}
          initialTab={activeModal.initialTab}
          customers={customers}
          customerPasswords={customerPasswords}
          adminPassword={adminPassword}
          onGoogleSignIn={handleGoogleSignIn}
          onRegisterCustomer={handleRegisterCustomer}
          onLogin={handleLogin}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'logout' && (
        <LogoutConfirmModal
          onConfirm={handleExecuteLogout}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'deposit' && (
        <DepositModal
          onSubmit={handleCustomerDeposit}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'adminPay' && (
        <AdminPayModal
          customers={customers}
          onSubmit={handleAdminPaySubmit}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'adminSavings' && (
        <AdminSavingsModal
          accounts={savingsAccounts}
          initialCustId={activeModal.custId}
          initialTxType={activeModal.txType}
          onSubmit={handleAdminSavingsSubmit}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'customerEditor' && (
        <CustomerEditorModal
          customer={activeModal.customer}
          existingCustomers={customers}
          onSave={handleSaveCustomer}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'confirmDelete' && (
        <ConfirmDeleteModal
          customer={activeModal.customer}
          onConfirm={() => handleDeleteCustomer(activeModal.customer.id)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'changeCustPass' && (
        <ChangeCustomerPasswordModal
          customer={activeModal.customer}
          currentPassword={
            customerPasswords[activeModal.customer.id] ?? activeModal.customer.whatsapp
          }
          onSave={handleAdminChangeCustomerPassword}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'loanPay' && (
        <LoanPayModal
          customer={activeModal.customer}
          loan={activeModal.loan}
          onConfirm={(cId, lId, payMode) => void handleConfirmLoanPayment(cId, lId, payMode)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'convertType' && (
        <ConvertTypeModal
          target={activeModal.target}
          onConfirmLoanToSavings={handleConvertLoanToSavings}
          onConfirmSavingsToLoan={handleConvertSavingsToLoan}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* PWA Smart Auto Install Banner */}
      <PWAInstallBanner
        deferredPrompt={deferredPrompt}
        isInstalled={isPwaInstalled}
        isIOS={isIOSDevice}
        onPromptConsumed={() => {
          const win = window as unknown as {
            __ozfDeferredPrompt?: BeforeInstallPromptEvent | null;
          };
          win.__ozfDeferredPrompt = null;
          setDeferredPrompt(null);
        }}
        onInstalled={() => {
          const win = window as unknown as {
            __ozfDeferredPrompt?: BeforeInstallPromptEvent | null;
            __ozfAppInstalled?: boolean;
          };
          win.__ozfDeferredPrompt = null;
          win.__ozfAppInstalled = true;
          setDeferredPrompt(null);
          setIsPwaInstalled(true);
          showToast('OZdigiFinance berhasil dipasang ke perangkat Anda!');
        }}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-xl text-center"
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
