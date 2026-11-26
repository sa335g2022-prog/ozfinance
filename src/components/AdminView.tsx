import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  ImagePlus,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Pencil,
  Phone,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Send,
  Smile,
  Sun,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminPageId,
  ChatMessage,
  CustomerRegistryItem,
  LoanItem,
  PendingBill,
  SavingsAccount,
  SavingsFrequency,
  SavingsMutation,
  ThemeMode,
  TransactionRecord,
} from '../types/app';
import { buildUpcomingDuesFromCustomers, formatRupiah, toWhatsAppHref } from '../utils/finance';
import { BrandLogo } from './BrandLogo';
import { StatusBadge } from './StatusBadge';

interface AdminViewProps {
  activePage: AdminPageId;
  onNavigate: (page: AdminPageId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  displayName: string;
  avatarUrl: string | null;
  activeCustomerName: string;
  customers: CustomerRegistryItem[];
  transactions: TransactionRecord[];
  savingsAccounts: SavingsAccount[];
  savingsMutations: SavingsMutation[];
  monthlySavingsInflow: number;
  pendingBills: PendingBill[];
  chatsByCustomer: Record<string, ChatMessage[]>;
  unreadChatByCustomer?: Record<string, number>;
  totalUnreadChatCount?: number;
  hasOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  selectedChatCustId: string;
  onSelectChatCustomer: (custId: string) => void;
  onSendAdminChat: (custId: string, text: string, imageFile?: File | null) => void;
  adminBellCount: number;
  onClearAdminBell: () => void;
  onVerifyBill: (billId: string) => void;
  onOpenAdminPay: () => void;
  onOpenLoanPay: (customer: CustomerRegistryItem, loan: LoanItem) => void;
  onOpenAdminSavings: (custId: string, txType: 'setor' | 'tarik') => void;
  onAddCustomer: () => void;
  onEditCustomer: (customer: CustomerRegistryItem) => void;
  onChangeCustomerPassword: (customer: CustomerRegistryItem) => void;
  onDeleteCustomer: (customer: CustomerRegistryItem) => void;
  onConvertLoanToSavings: (custId: string, officialName: string, loan: LoanItem) => void;
  onConvertSavingsToLoan: (account: SavingsAccount) => void;
  onDownloadCsv: () => void;
  onOpenProfile: () => void;
  onSwitchToCustomer: () => void;
  onRequestLogout: () => void;
  onToast: (msg: string) => void;
}

const ADMIN_NAV: { id: AdminPageId; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'a-dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: 'a-nasabah', label: 'Data Nasabah', shortLabel: 'Nasabah', icon: <Users className="w-[18px] h-[18px]" /> },
  { id: 'a-pinjaman', label: 'Pinjaman', shortLabel: 'Pinjaman', icon: <Landmark className="w-[18px] h-[18px]" /> },
  { id: 'a-tabungan', label: 'Tabungan', shortLabel: 'Tabungan', icon: <PiggyBank className="w-[18px] h-[18px]" /> },
  { id: 'a-tagihan', label: 'Tagihan & Pembayaran', shortLabel: 'Tagihan', icon: <Receipt className="w-[18px] h-[18px]" /> },
  { id: 'a-pesan', label: 'Pesan', shortLabel: 'Pesan', icon: <Mail className="w-[18px] h-[18px]" /> },
  { id: 'a-laporan', label: 'Laporan', shortLabel: 'Laporan', icon: <BarChart3 className="w-[18px] h-[18px]" /> },
];

const ADMIN_MOBILE_PRIMARY: AdminPageId[] = [
  'a-dashboard',
  'a-nasabah',
  'a-pinjaman',
  'a-tabungan',
  'a-laporan',
];

const PAGE_TITLES: Record<AdminPageId, string> = {
  'a-dashboard': 'Dashboard Operasional',
  'a-nasabah': 'Data Nasabah',
  'a-pinjaman': 'Manajemen Pinjaman',
  'a-tabungan': 'Rekap Tabungan',
  'a-tagihan': 'Tagihan & Pembayaran',
  'a-pesan': 'Pesan Nasabah',
  'a-laporan': 'Laporan Keuangan',
};

export const AdminView: React.FC<AdminViewProps> = ({
  activePage,
  onNavigate,
  theme,
  onToggleTheme,
  displayName,
  avatarUrl,
  activeCustomerName,
  customers,
  transactions,
  savingsAccounts,
  savingsMutations,
  monthlySavingsInflow,
  pendingBills,
  chatsByCustomer,
  unreadChatByCustomer = {},
  totalUnreadChatCount = 0,
  hasOlderMessages = false,
  onLoadOlderMessages,
  selectedChatCustId,
  onSelectChatCustomer,
  onSendAdminChat,
  adminBellCount,
  onClearAdminBell,
  onVerifyBill,
  onOpenAdminPay,
  onOpenLoanPay,
  onOpenAdminSavings,
  onAddCustomer,
  onEditCustomer,
  onChangeCustomerPassword,
  onDeleteCustomer,
  onConvertLoanToSavings,
  onConvertSavingsToLoan,
  onDownloadCsv,
  onOpenProfile,
  onSwitchToCustomer,
  onRequestLogout,
  onToast,
}) => {
  const [txSearch, setTxSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [selectedDetailCustId, setSelectedDetailCustId] = useState<string | null>(null);
  const [savProgramFilter, setSavProgramFilter] = useState<'all' | SavingsFrequency>('all');
  const [savSearch, setSavSearch] = useState('');
  const [adminChatDraft, setAdminChatDraft] = useState('');
  const [adminChatImageFile, setAdminChatImageFile] = useState<File | null>(null);
  const [showAdminEmojiPicker, setShowAdminEmojiPicker] = useState(false);
  const adminChatFileRef = useRef<HTMLInputElement | null>(null);
  const adminChatEndRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(() => {
    const clean = displayName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/);
    return (
      parts
        .map((p) => p[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'BD'
    );
  }, [displayName]);

  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.officialName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.whatsapp.toLowerCase().includes(q) ||
        c.productLabel.toLowerCase().includes(q) ||
        c.loans.some((l) => l.productName.toLowerCase().includes(q))
    );
  }, [customers, custSearch]);

  const selectedDetailCustomer = useMemo(
    () =>
      selectedDetailCustId
        ? customers.find((c) => c.id === selectedDetailCustId) ?? null
        : null,
    [customers, selectedDetailCustId]
  );

  const separatedLoans = useMemo(
    () =>
      customers.flatMap((customer) =>
        customer.loans.map((loan) => ({ customer, loan }))
      ),
    [customers]
  );

  const liveUpcomingDues = useMemo(
    () => buildUpcomingDuesFromCustomers(customers).slice(0, 6),
    [customers]
  );

  const filteredAdminTx = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.officialName.toLowerCase().includes(q) ||
        tx.custId.toLowerCase().includes(q) ||
        tx.id.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.date.toLowerCase().includes(q)
    );
  }, [transactions, txSearch]);

  const totalSavingsManaged = useMemo(
    () => savingsAccounts.reduce((acc, item) => acc + item.balance, 0),
    [savingsAccounts]
  );

  const filteredSavingsAccounts = useMemo(() => {
    const q = savSearch.trim().toLowerCase();
    return savingsAccounts.filter((item) => {
      const matchProg = savProgramFilter === 'all' || item.program === savProgramFilter;
      const matchQuery =
        !q ||
        item.officialName.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.whatsapp.toLowerCase().includes(q);
      return matchProg && matchQuery;
    });
  }, [savingsAccounts, savProgramFilter, savSearch]);

  const savingsBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of savingsAccounts) {
      map.set(acc.id, acc.balance);
    }
    return map;
  }, [savingsAccounts]);

  const selectedChatCustomer = useMemo(
    () => customers.find((c) => c.id === selectedChatCustId) ?? customers[0] ?? null,
    [customers, selectedChatCustId]
  );

  const selectedChatMessages = useMemo(() => {
    if (!selectedChatCustomer) return [];
    return chatsByCustomer[selectedChatCustomer.id] ?? [];
  }, [chatsByCustomer, selectedChatCustomer]);

  useEffect(() => {
    if (activePage === 'a-pesan') {
      adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activePage, selectedChatMessages.length, selectedChatCustomer?.id]);

  const handleSubmitAdminChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChatCustomer) return;
    const text = adminChatDraft.trim();
    if (!text && !adminChatImageFile) return;
    onSendAdminChat(selectedChatCustomer.id, text, adminChatImageFile);
    setAdminChatDraft('');
    setAdminChatImageFile(null);
    setShowAdminEmojiPicker(false);
    if (adminChatFileRef.current) adminChatFileRef.current.value = '';
  };

  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-4 py-5 flex-col z-20">
        <div className="px-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Panel Operasional Internal
          </p>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 px-3 pt-4 pb-1.5">
          Menu Admin
        </p>

        <nav aria-label="Menu admin" className="space-y-1 overflow-y-auto">
          {ADMIN_NAV.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full min-h-[42px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-[13px] font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'a-pesan' && totalUnreadChatCount > 0 && (
                  <span
                    data-testid="admin-chat-unread-badge"
                    className="ml-auto min-w-[20px] h-[18px] px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums"
                  >
                    {totalUnreadChatCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={onSwitchToCustomer}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Mode Nasabah ({activeCustomerName || 'Nasabah'})</span>
          </button>
          <button
            type="button"
            onClick={onRequestLogout}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout Akun</span>
          </button>
        </div>
      </aside>

      {/* Fixed Topbar */}
      <header className="fixed top-0 left-0 md:left-60 right-0 h-14 md:h-16 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="md:hidden shrink-0">
            <BrandLogo size="sm" />
          </div>
          <h1 className="hidden md:block text-sm font-bold text-slate-900 dark:text-white truncate">
            {PAGE_TITLES[activePage]}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="w-[18px] h-[18px]" />
            ) : (
              <Moon className="w-[18px] h-[18px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onClearAdminBell();
              onNavigate('a-tagihan');
              onToast(
                adminBellCount > 0
                  ? `${adminBellCount} notifikasi tagihan dibuka.`
                  : 'Tidak ada notifikasi baru di lonceng admin.'
              );
            }}
            aria-label="Pemberitahuan admin"
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-[19px] h-[19px]" />
            {adminBellCount > 0 && (
              <span
                data-testid="admin-bell-badge"
                className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums"
              >
                {adminBellCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Edit Data Profil & Pengaturan"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 font-extrabold text-sm overflow-hidden flex items-center justify-center shrink-0 hover:border-blue-500 transition-colors"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="md:ml-60 pt-18 md:pt-24 pb-22 md:pb-10 px-4 sm:px-7 max-w-6xl space-y-5">
        {/* Mobile Quick Sub-Bar so mobile Admin reaches all 7 menus */}
        <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1">
          {ADMIN_NAV.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'a-pesan' && totalUnreadChatCount > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold items-center justify-center tabular-nums">
                    {totalUnreadChatCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* DASHBOARD OPERASIONAL */}
        {activePage === 'a-dashboard' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Tagihan Pinjaman Mendatang
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Klik salah satu tagihan pinjaman untuk pelunasan bulanan
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {liveUpcomingDues.length > 0 ? (
                  liveUpcomingDues.map((due) => {
                    const matchedCust = customers.find((c) => c.id === due.custId);
                    const matchedLoan = matchedCust?.loans.find((l) => l.id === due.loanId);
                    return (
                      <div
                        key={due.id}
                        onClick={() => {
                          if (matchedCust && matchedLoan) {
                            onOpenLoanPay(matchedCust, matchedLoan);
                          }
                        }}
                        className="py-3 px-2 -mx-2 rounded-xl flex flex-wrap items-center gap-3 hover:bg-blue-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-extrabold text-xs flex items-center justify-center shrink-0 tabular-nums">
                          {due.day}
                        </div>
                        <div className="flex-1 min-w-0">
                          <strong className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                            {due.name}
                          </strong>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                            {due.meta}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <a
                            href={toWhatsAppHref(due.whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>WA</span>
                          </a>
                          <strong className="text-sm font-extrabold text-slate-900 dark:text-white font-mono-num">
                            {formatRupiah(due.amount)}
                          </strong>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    Semua angsuran pinjaman telah lunas.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Transaksi Terbaru
                </h2>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Cari nasabah..."
                      aria-label="Cari transaksi nasabah"
                      className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAdminPay}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                  >
                    + Catat Pembayaran
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Nasabah (Data Resmi)</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {filteredAdminTx.length > 0 ? (
                      filteredAdminTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3">
                            <strong className="font-bold text-slate-900 dark:text-white">
                              {tx.officialName}
                            </strong>{' '}
                            <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                              ({tx.custId})
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 dark:text-slate-200">
                            {tx.description}
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                            {tx.date}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num font-bold text-slate-900 dark:text-white">
                            {formatRupiah(tx.amount)}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={tx.status} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          Tidak ada transaksi ditemukan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DATA NASABAH (TABLE SHOWS ID RESMI, NAMA, NO WA — DETAILS REVEAL ON CLICK) */}
        {activePage === 'a-nasabah' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Database Resmi Nasabah ({customers.length} Nasabah)
                  </h2>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                    Klik salah satu nasabah untuk melihat Produk/Pinjaman, Sisa Tagihan, Saldo Tabungan, Status &amp; Aksi
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={custSearch}
                      onChange={(e) => setCustSearch(e.target.value)}
                      placeholder="Cari ID / Nama / No. WA..."
                      aria-label="Cari data nasabah"
                      className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="add-customer-btn"
                    onClick={onAddCustomer}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Nasabah</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table
                  data-testid="admin-customers-table"
                  className="w-full text-left border-collapse whitespace-nowrap"
                >
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">ID Resmi</th>
                      <th className="py-2.5 px-3">Nama Resmi</th>
                      <th className="py-2.5 px-3">No. WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((c) => {
                        const isSelected = selectedDetailCustomer?.id === c.id;
                        return (
                          <tr
                            key={c.id}
                            onClick={() =>
                              setSelectedDetailCustId((prev) => (prev === c.id ? null : c.id))
                            }
                            title={`Klik untuk melihat detail & aksi ${c.officialName}`}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50/90 dark:bg-blue-950/50'
                                : 'hover:bg-blue-50/40 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <td className="py-3 px-3 font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                              {c.id}
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                              {c.officialName}
                            </td>
                            <td className="py-3 px-3">
                              <a
                                href={toWhatsAppHref(c.whatsapp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 font-mono-num font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{c.whatsapp}</span>
                              </a>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          Tidak ada nasabah ditemukan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detail Panel revealed only when Admin clicks a customer */}
            {selectedDetailCustomer && (() => {
              const hasSavings = savingsBalanceMap.has(selectedDetailCustomer.id);
              const savBalance = savingsBalanceMap.get(selectedDetailCustomer.id) ?? 0;
              return (
                <div
                  data-testid="admin-customer-detail-panel"
                  className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        Detail Lengkap Nasabah Terpilih
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                        {selectedDetailCustomer.officialName} ({selectedDetailCustomer.id})
                      </h3>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-mono-num mt-0.5">
                        No. WhatsApp: {selectedDetailCustomer.whatsapp}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={selectedDetailCustomer.status} />
                      <button
                        type="button"
                        onClick={() => setSelectedDetailCustId(null)}
                        aria-label="Tutup detail nasabah"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 md:col-span-2">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                        Produk / Pinjaman ({selectedDetailCustomer.loans.length} Kontrak)
                      </span>
                      {selectedDetailCustomer.loans.length > 0 ? (
                        <div className="space-y-2">
                          {selectedDetailCustomer.loans.map((l) => (
                            <div
                              key={l.id}
                              className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                            >
                              <div>
                                <strong className="font-bold text-slate-900 dark:text-white">
                                  {l.productName}
                                </strong>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                  {l.paidInstallments}/{l.totalInstallments} Bln · {formatRupiah(l.monthlyInstallment)}/bln · {l.dueDateDay}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono-num font-bold text-blue-700 dark:text-blue-400">
                                  Sisa: {formatRupiah(l.remainingDebt)}
                                </span>
                                {l.remainingDebt > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenLoanPay(selectedDetailCustomer, l)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                                  >
                                    Lunasi
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {hasSavings ? 'Nasabah Tabungan Aktif' : 'Belum ada kontrak pinjaman'}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                          Total Sisa Tagihan
                        </span>
                        <strong className="text-base font-extrabold text-slate-900 dark:text-white font-mono-num">
                          {formatRupiah(selectedDetailCustomer.remainingDebt)}
                        </strong>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                          Saldo Tabungan
                        </span>
                        <strong className="text-base font-extrabold text-blue-700 dark:text-blue-400 font-mono-num">
                          {hasSavings ? formatRupiah(savBalance) : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Aksi Nasabah */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      data-testid="detail-chat-btn"
                      onClick={() => {
                        onSelectChatCustomer(selectedDetailCustomer.id);
                        onNavigate('a-pesan');
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat via Aplikasi</span>
                    </button>
                    <button
                      type="button"
                      data-testid="detail-edit-btn"
                      onClick={() => onEditCustomer(selectedDetailCustomer)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Data</span>
                    </button>
                    <button
                      type="button"
                      data-testid="detail-password-btn"
                      onClick={() => onChangeCustomerPassword(selectedDetailCustomer)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-600 hover:text-white text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Ubah Password</span>
                    </button>
                    <button
                      type="button"
                      data-testid="detail-delete-btn"
                      onClick={() => onDeleteCustomer(selectedDetailCustomer)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Nasabah</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* PINJAMAN */}
        {activePage === 'a-pinjaman' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Daftar Kontrak Pinjaman Terpisah ({separatedLoans.length} Kontrak)
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Klik salah satu pinjaman untuk melakukan pembayaran bulanan / pelunasan &amp; kirim notifikasi ke nasabah
                </span>
              </div>
              <button
                type="button"
                onClick={onAddCustomer}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Nasabah</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Nasabah &amp; No. WA</th>
                    <th className="py-2.5 px-3">Kontrak / Produk</th>
                    <th className="py-2.5 px-3 text-right">Cicilan / Bln</th>
                    <th className="py-2.5 px-3">Progres</th>
                    <th className="py-2.5 px-3 text-right">Sisa Piutang</th>
                    <th className="py-2.5 px-3">Jatuh Tempo</th>
                    <th className="py-2.5 px-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {separatedLoans.length > 0 ? (
                    separatedLoans.map(({ customer: c, loan }) => {
                      const isPaidOff =
                        loan.paidInstallments >= loan.totalInstallments || loan.remainingDebt <= 0;
                      return (
                        <tr
                          key={`${c.id}-${loan.id}`}
                          onClick={() => onOpenLoanPay(c, loan)}
                          title={`Klik untuk pembayaran / pelunasan ${loan.productName}`}
                          className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-3">
                            <strong className="font-bold text-slate-900 dark:text-white block">
                              {c.officialName} ({c.id})
                            </strong>
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono-num">
                              WA: {c.whatsapp}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-100">
                            {loan.productName}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                            {formatRupiah(loan.monthlyInstallment)}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300 tabular-nums">
                            {loan.paidInstallments} / {loan.totalInstallments} Bln
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num font-bold text-blue-700 dark:text-blue-400">
                            {formatRupiah(loan.remainingDebt)}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300 tabular-nums">
                            {loan.dueDateDay}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              {isPaidOff ? (
                                <span className="px-2.5 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                                  Lunas
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenLoanPay(c, loan);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Bayar / Lunasi</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConvertLoanToSavings(c.id, c.officialName, loan);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>Ubah ke Tabungan</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditCustomer(c);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-[11px] font-semibold"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        Belum ada kontrak pinjaman aktif.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TABUNGAN ADMIN */}
        {activePage === 'a-tabungan' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Dana Tabungan Kelolaan
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {savingsAccounts.length} Rekening
                  </span>
                </div>
                <strong
                  data-testid="admin-sav-total-kpi"
                  className="block text-xl font-extrabold text-slate-900 dark:text-white font-mono-num mt-2"
                >
                  {formatRupiah(totalSavingsManaged)}
                </strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  Akumulasi seluruh saldo aktif nasabah
                </span>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nasabah Tabungan Aktif
                  </span>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Harian · Mingguan · Bulanan
                  </span>
                </div>
                <strong className="block text-xl font-extrabold text-slate-900 dark:text-white mt-2">
                  {savingsAccounts.length} Nasabah Aktif
                </strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  {savingsAccounts.length === 0
                    ? 'Data nasabah tabungan dikosongkan sementara'
                    : 'Terdistribusi di 3 paket menabung'}
                </span>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Setoran Masuk Bulan Ini
                  </span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nov 2026
                  </span>
                </div>
                <strong className="block text-xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono-num mt-2">
                  {formatRupiah(monthlySavingsInflow)}
                </strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  Terverifikasi oleh sistem OZdigiFinance
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Rekening Tabungan Nasabah (Data Resmi)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Menampilkan nama resmi &amp; No. WA nasabah sesuai registrasi kontrak
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAdminSavings(savingsAccounts[0]?.id ?? customers[0]?.id ?? '', 'setor')
                  }
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
                >
                  + Catat Transaksi Tabungan
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  {(
                    [
                      { key: 'all', label: 'Semua' },
                      { key: 'Menabung Harian', label: 'Menabung Harian' },
                      { key: 'Menabung Mingguan', label: 'Menabung Mingguan' },
                      { key: 'Menabung Bulanan', label: 'Menabung Bulanan' },
                    ] as const
                  ).map((f) => {
                    const active = savProgramFilter === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setSavProgramFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={savSearch}
                    onChange={(e) => setSavSearch(e.target.value)}
                    placeholder="Cari nama / No. WA / ID..."
                    aria-label="Cari rekening tabungan"
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">ID &amp; Nama Resmi</th>
                      <th className="py-2.5 px-3">No. WhatsApp</th>
                      <th className="py-2.5 px-3">Pilihan Program</th>
                      <th className="py-2.5 px-3">Setoran Rutin</th>
                      <th className="py-2.5 px-3 text-right">Total Saldo Tabungan</th>
                      <th className="py-2.5 px-3">Terakhir Setor</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {filteredSavingsAccounts.length > 0 ? (
                      filteredSavingsAccounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3">
                            <strong className="font-bold text-slate-900 dark:text-white">
                              {acc.officialName}
                            </strong>{' '}
                            <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                              ({acc.id})
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono-num text-emerald-700 dark:text-emerald-400">
                            {acc.whatsapp}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                            {acc.program}
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                            {acc.routine}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num font-bold text-blue-700 dark:text-blue-400">
                            {formatRupiah(acc.balance)}
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                            {acc.lastDate}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={acc.status} />
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenAdminSavings(acc.id, 'setor')}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                              >
                                + Setor
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenAdminSavings(acc.id, 'tarik')}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors whitespace-nowrap"
                              >
                                - Tarik
                              </button>
                              <button
                                type="button"
                                onClick={() => onConvertSavingsToLoan(acc)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-600 hover:text-white text-amber-800 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>Ubah ke Pinjaman</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          {savingsAccounts.length === 0
                            ? 'Belum ada data nasabah tabungan (data saat ini fokus pada nasabah pinjaman).'
                            : 'Tidak ada rekening tabungan yang cocok dengan pencarian.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Log Mutasi Tabungan Terbaru
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Riwayat setoran &amp; penarikan terverifikasi
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Nama Resmi Nasabah</th>
                      <th className="py-2.5 px-3">Jenis Mutasi</th>
                      <th className="py-2.5 px-3">Program</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {savingsMutations.length > 0 ? (
                      savingsMutations.map((m) => {
                        const isDeposit = m.type === 'Setoran';
                        return (
                          <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                              {m.date}
                            </td>
                            <td className="py-3 px-3">
                              <strong className="font-bold text-slate-900 dark:text-white">
                                {m.officialName}
                              </strong>{' '}
                              <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                                ({m.custId})
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <StatusBadge status={m.type} />
                            </td>
                            <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                              {m.program}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono-num font-bold ${
                                isDeposit
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {isDeposit ? '+ ' : '- '}
                              {formatRupiah(m.amount)}
                            </td>
                            <td className="py-3 px-3">
                              <StatusBadge status="Terverifikasi Admin" />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          Belum ada mutasi tabungan tercatat.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAGIHAN & PEMBAYARAN */}
        {activePage === 'a-tagihan' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Verifikasi Tagihan &amp; Pembayaran
              </h2>
              <button
                type="button"
                onClick={onOpenAdminPay}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
              >
                + Catat Pembayaran
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingBills.map((bill) => (
                <div key={bill.id} className="py-3.5 flex flex-wrap items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-extrabold text-xs flex items-center justify-center shrink-0 tabular-nums">
                    {bill.dayBadge}
                  </div>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-sm font-bold text-slate-900 dark:text-white">
                      {bill.officialName} ({bill.custId})
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {bill.verified
                        ? `${bill.billTitle} · ${formatRupiah(bill.amount)} · Sudah diverifikasi`
                        : bill.subtitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={toWhatsAppHref(bill.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1 hover:border-emerald-500"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kirim WA</span>
                    </a>
                    {bill.verified ? (
                      <StatusBadge status="Terverifikasi" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onVerifyBill(bill.id)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
                      >
                        Verifikasi
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESAN ADMIN - IN-APP CHAT PER NASABAH */}
        {activePage === 'a-pesan' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Pilih Nasabah ({customers.length})
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Klik untuk chat
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto pr-1">
                {customers.map((c) => {
                  const init = c.officialName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'NS';
                  const unreadCount = unreadChatByCustomer[c.id] ?? 0;
                  const msgCount = (chatsByCustomer[c.id] ?? []).length;
                  const isSelected = selectedChatCustomer?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-testid={`admin-chat-customer-${c.id}`}
                      onClick={() => onSelectChatCustomer(c.id)}
                      className={`w-full py-2.5 px-2.5 rounded-xl flex items-center gap-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {init}
                      </div>
                      <div className="flex-1 min-w-0">
                        <strong className="block text-xs font-bold text-slate-900 dark:text-white truncate">
                          {c.officialName} ({c.id})
                        </strong>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num block truncate">
                          WA: {c.whatsapp}
                        </span>
                      </div>
                      {unreadCount > 0 ? (
                        <span
                          data-testid={`admin-cust-unread-${c.id}`}
                          className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold tabular-nums shrink-0"
                        >
                          {unreadCount}
                        </span>
                      ) : msgCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold tabular-nums shrink-0">
                          {msgCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 flex flex-col min-w-0 overflow-hidden">
              {selectedChatCustomer ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                      <h3
                        data-testid="admin-chat-active-name"
                        className="text-sm font-bold text-slate-900 dark:text-white truncate"
                      >
                        Chat Aplikasi: {selectedChatCustomer.officialName} ({selectedChatCustomer.id})
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num block truncate">
                        WA: {selectedChatCustomer.whatsapp} · {selectedChatCustomer.productLabel}
                      </span>
                    </div>
                    <a
                      href={toWhatsAppHref(selectedChatCustomer.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Chat WA</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>

                  <div className="flex-1 min-h-[260px] max-h-[360px] overflow-y-auto py-4 space-y-2.5 pr-1 flex flex-col">
                    {hasOlderMessages && onLoadOlderMessages && (
                      <button
                        type="button"
                        onClick={onLoadOlderMessages}
                        className="self-center px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-blue-700 dark:text-blue-400 inline-flex items-center gap-1 hover:border-blue-500"
                      >
                        <History className="w-3 h-3" aria-hidden="true" />
                        <span>Muat Pesan Sebelumnya</span>
                      </button>
                    )}

                    {selectedChatMessages.length > 0 ? (
                      selectedChatMessages.map((msg) => {
                        const isAdminMsg = msg.sender === 'admin';
                        const isSystemPay =
                          msg.messageType === 'system_payment' || msg.senderRole === 'system';
                        const safeImg =
                          msg.imageUrl && msg.imageUrl.startsWith('https://')
                            ? msg.imageUrl
                            : null;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] ${
                              isAdminMsg ? 'ml-auto items-end' : 'items-start'
                            }`}
                          >
                            <div
                              className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm ${
                                isSystemPay
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-slate-100 rounded-br-sm'
                                  : isAdminMsg
                                  ? 'bg-blue-600 text-white rounded-br-sm'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-sm'
                              }`}
                            >
                              {safeImg && (
                                <a
                                  href={safeImg}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block mb-2"
                                >
                                  <img
                                    src={safeImg}
                                    alt="Lampiran chat"
                                    className="max-h-44 rounded-xl object-cover border border-white/20"
                                  />
                                </a>
                              )}
                              <p className="whitespace-pre-line break-words">{msg.text}</p>
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 inline-flex items-center gap-1">
                              <span>
                                {msg.senderName} · {msg.time}
                              </span>
                              {isAdminMsg && (
                                <span
                                  aria-label={
                                    msg.status === 'read'
                                      ? 'Dibaca'
                                      : msg.status === 'delivered'
                                      ? 'Diterima'
                                      : 'Terkirim'
                                  }
                                  className="inline-flex items-center"
                                >
                                  {msg.status === 'read' ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                                  ) : msg.status === 'delivered' ? (
                                    <CheckCheck className="w-3.5 h-3.5" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4">
                        <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Belum ada percakapan di aplikasi dengan{' '}
                          <strong>{selectedChatCustomer.officialName}</strong>.
                        </p>
                      </div>
                    )}
                    <div ref={adminChatEndRef} />
                  </div>

                  {showAdminEmojiPicker && (
                    <div className="flex flex-wrap gap-1.5 mb-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {['👍', '😊', '✅', '🙏', '💰', '🧾', '📄', '🔔'].map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setAdminChatDraft((prev) => prev + em)}
                          className="w-8 h-8 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-base flex items-center justify-center"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  {adminChatImageFile && (
                    <div className="mb-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between gap-2">
                      <span className="truncate">Lampiran: {adminChatImageFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAdminChatImageFile(null);
                          if (adminChatFileRef.current) adminChatFileRef.current.value = '';
                        }}
                        className="font-bold text-rose-600 dark:text-rose-400"
                      >
                        Hapus
                      </button>
                    </div>
                  )}

                  <form
                    onSubmit={handleSubmitAdminChat}
                    className="flex gap-1.5 sm:gap-2 items-center pt-3 border-t border-slate-200 dark:border-slate-800 w-full min-w-0"
                  >
                    <input
                      ref={adminChatFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file && file.size > 2 * 1024 * 1024) {
                          onToast('Ukuran gambar maksimal 2 MB.');
                          return;
                        }
                        setAdminChatImageFile(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => adminChatFileRef.current?.click()}
                      aria-label="Lampirkan gambar"
                      className="w-9 h-[42px] sm:w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-blue-500 shrink-0"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdminEmojiPicker((v) => !v)}
                      aria-label="Pilih emoji"
                      className="w-9 h-[42px] sm:w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-blue-500 shrink-0"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      data-testid="admin-chat-input"
                      value={adminChatDraft}
                      onChange={(e) => setAdminChatDraft(e.target.value)}
                      placeholder={`Kirim pesan aplikasi ke ${selectedChatCustomer.officialName}...`}
                      aria-label="Kirim pesan ke nasabah"
                      className="flex-1 min-w-0 w-full min-h-[42px] px-3 sm:px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      data-testid="admin-chat-send-btn"
                      aria-label="Kirim pesan"
                      className="min-h-[42px] px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="hidden min-[380px]:inline">Kirim</span>
                    </button>
                  </form>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
                  Belum ada data nasabah untuk diajak chat.
                </p>
              )}
            </div>
          </div>
        )}

        {/* LAPORAN */}
        {activePage === 'a-laporan' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Ekspor Laporan Keuangan (CSV)
              </h2>
              <button
                type="button"
                onClick={onDownloadCsv}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>Unduh Laporan CSV</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Unduh rekap data transaksi resmi {customers.length} nasabah dalam format CSV untuk pembukuan.
            </p>
          </div>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Navigasi admin mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        {ADMIN_NAV.filter((item) => ADMIN_MOBILE_PRIMARY.includes(item.id)).map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
