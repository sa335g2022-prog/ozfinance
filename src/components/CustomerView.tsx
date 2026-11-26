import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Calculator,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCheck,
  CreditCard,
  History,
  Home,
  ImagePlus,
  Landmark,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  PiggyBank,
  Receipt,
  Search,
  Send,
  Shield,
  Smile,
  Sun,
  Wallet,
} from 'lucide-react';
import type {
  ChatMessage,
  CustomerPageId,
  CustomerRegistryItem,
  SavingsFrequency,
  ThemeMode,
  TransactionRecord,
} from '../types/app';
import { formatRupiah, toWhatsAppHref } from '../utils/finance';
import { BrandLogo } from './BrandLogo';
import { LoanSimulator } from './LoanSimulator';
import { StatusBadge } from './StatusBadge';

interface CustomerViewProps {
  customer: CustomerRegistryItem;
  activePage: CustomerPageId;
  onNavigate: (page: CustomerPageId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  displayName: string;
  avatarUrl: string | null;
  savingsBalance: number;
  savingsFreq: SavingsFrequency;
  onChangeSavingsFreq: (freq: SavingsFrequency) => void;
  transactions: TransactionRecord[];
  unreadNotifCount: number;
  unreadChatCount: number;
  bellUrgentKey: number;
  onOpenNotifs: () => void;
  onOpenProfile: () => void;
  onOpenDeposit: () => void;
  onSubmitPayProof: (billLabel: string, amount: number) => void;
  chatMessages: ChatMessage[];
  hasOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  onSendChat: (text: string, imageFile?: File | null) => void;
  onSwitchToAdmin: () => void;
  onRequestLogout: () => void;
  onToast: (msg: string) => void;
}

const CUSTOMER_NAV: { id: CustomerPageId; label: string; icon: React.ReactNode }[] = [
  { id: 'c-beranda', label: 'Beranda', icon: <Home className="w-[18px] h-[18px]" /> },
  { id: 'c-pinjaman', label: 'Pinjaman', icon: <Landmark className="w-[18px] h-[18px]" /> },
  { id: 'c-tabungan', label: 'Tabungan', icon: <PiggyBank className="w-[18px] h-[18px]" /> },
  { id: 'c-tagihan', label: 'Tagihan', icon: <Receipt className="w-[18px] h-[18px]" /> },
  { id: 'c-pesan', label: 'Pesan', icon: <Mail className="w-[18px] h-[18px]" /> },
];

const PAGE_TITLES: Record<CustomerPageId, string> = {
  'c-beranda': 'Beranda Nasabah',
  'c-pinjaman': 'Pinjaman & Simulasi',
  'c-tabungan': 'Tabungan Digital',
  'c-tagihan': 'Tagihan & Pembayaran',
  'c-pesan': 'Pesan & Live Chat',
};

export const CustomerView: React.FC<CustomerViewProps> = ({
  customer,
  activePage,
  onNavigate,
  theme,
  onToggleTheme,
  displayName,
  avatarUrl,
  savingsBalance,
  savingsFreq,
  onChangeSavingsFreq,
  transactions,
  unreadNotifCount,
  unreadChatCount,
  bellUrgentKey,
  onOpenNotifs,
  onOpenProfile,
  onOpenDeposit,
  onSubmitPayProof,
  chatMessages,
  hasOlderMessages = false,
  onLoadOlderMessages,
  onSendChat,
  onSwitchToAdmin,
  onRequestLogout,
  onToast,
}) => {
  const loanBillOptions = useMemo(() => {
    const list: { value: string; label: string; amount: number }[] = [];
    for (const loan of customer.loans) {
      const next =
        loan.schedule.find((s) => s.status !== 'Lunas') ?? {
          installmentNumber: Math.min(loan.totalInstallments, loan.paidInstallments + 1),
          date: loan.dueDateDay,
          amount: loan.monthlyInstallment,
          status: 'Jatuh Tempo' as const,
        };
      list.push({
        value: `${loan.productName} · Angsuran ke-${next.installmentNumber} (${formatRupiah(
          next.amount
        )})`,
        label: `${loan.productName} · Angsuran ke-${next.installmentNumber} · ${formatRupiah(
          next.amount
        )} (${next.date})`,
        amount: next.amount,
      });
    }
    if (customer.remainingDebt > 0) {
      list.push({
        value: `${customer.productLabel} · Pelunasan Sisa (${formatRupiah(customer.remainingDebt)})`,
        label: `Pelunasan Seluruh Sisa Tagihan · ${formatRupiah(customer.remainingDebt)}`,
        amount: customer.remainingDebt,
      });
    }
    return list;
  }, [customer]);

  const nextInstallment = useMemo(() => {
    const primaryLoan = customer.loans[0];
    if (!primaryLoan) {
      return {
        productName: customer.productLabel,
        installmentNumber: 1,
        date: customer.dueDateDay,
        amount: 0,
      };
    }
    const row =
      primaryLoan.schedule.find((s) => s.status !== 'Lunas') ?? {
        installmentNumber: primaryLoan.paidInstallments + 1,
        date: primaryLoan.dueDateDay,
        amount: primaryLoan.monthlyInstallment,
      };
    return {
      productName: primaryLoan.productName,
      installmentNumber: row.installmentNumber,
      date: row.date,
      amount: row.amount,
    };
  }, [customer]);

  const [txSearch, setTxSearch] = useState('');
  const [billSelect, setBillSelect] = useState(loanBillOptions[0]?.value ?? '');
  const [billAmount, setBillAmount] = useState(String(loanBillOptions[0]?.amount ?? 0));
  const [chatDraft, setChatDraft] = useState('');
  const [chatImageFile, setChatImageFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBillSelect(loanBillOptions[0]?.value ?? '');
    setBillAmount(String(loanBillOptions[0]?.amount ?? 0));
  }, [customer.id, loanBillOptions]);

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

  const customerTransactions = useMemo(() => {
    const mine = transactions.filter((tx) => tx.custId === customer.id);
    const q = txSearch.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter(
      (tx) =>
        tx.id.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.date.toLowerCase().includes(q) ||
        tx.status.toLowerCase().includes(q)
    );
  }, [customer.id, transactions, txSearch]);

  const progressPct = useMemo(() => {
    if (customer.totalInstallments <= 0) return 0;
    return Math.min(100, Math.round((customer.paidInstallments / customer.totalInstallments) * 100));
  }, [customer.paidInstallments, customer.totalInstallments]);

  useEffect(() => {
    if (activePage === 'c-pesan') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activePage, chatMessages.length]);

  const handlePayProofSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(billAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onToast('Masukkan nominal transfer yang valid.');
      return;
    }
    onSubmitPayProof(billSelect, numeric);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed && !chatImageFile) return;
    onSendChat(trimmed, chatImageFile);
    setChatDraft('');
    setChatImageFile(null);
    setShowEmojiPicker(false);
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-4 py-5 flex-col z-20">
        <div className="px-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Solusi Finansial Digital Anda
          </p>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 px-3 pt-4 pb-1.5">
          Menu Nasabah
        </p>

        <nav aria-label="Menu nasabah" className="space-y-1">
          {CUSTOMER_NAV.map((item) => {
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
                {item.id === 'c-pesan' && unreadChatCount > 0 && (
                  <span
                    data-testid="cust-chat-unread-badge"
                    className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums"
                  >
                    {unreadChatCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Beralih ke Mode Admin</span>
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
            onClick={onOpenNotifs}
            aria-label={`Pemberitahuan Nasabah${unreadNotifCount > 0 ? `, ${unreadNotifCount} belum dibaca` : ''}`}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell
              key={bellUrgentKey}
              className={`w-[19px] h-[19px] ${bellUrgentKey > 0 ? 'bell-urgent text-blue-600 dark:text-blue-400' : ''}`}
            />
            {unreadNotifCount > 0 && (
              <span
                data-testid="cust-bell-badge"
                className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums"
              >
                {unreadNotifCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Edit Data Profil & Akun"
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

      {/* Main Viewport */}
      <main className="md:ml-60 pt-20 md:pt-24 pb-22 md:pb-10 px-4 sm:px-7 max-w-6xl">
        {/* BERANDA NASABAH */}
        {activePage === 'c-beranda' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Halo, <span data-testid="cust-greeting-name">{displayName}</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Kelola tagihan paylater, pinjaman aktif, dan tabungan digital Anda dalam satu tempat.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono-num">
                <span>
                  ID: <strong className="text-blue-700 dark:text-blue-400">{customer.id}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <a
                  href={toWhatsAppHref(customer.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>WA: {customer.whatsapp}</span>
                </a>
              </div>
            </div>

            {/* Due Reminder Banner */}
            {customer.loans.length > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-blue-50 via-white to-amber-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/30 border border-blue-200/80 dark:border-blue-900/50 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Tagihan Jatuh Tempo Terdekat ({nextInstallment.productName})
                  </p>
                  <strong className="block text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    Angsuran ke-{nextInstallment.installmentNumber} · {formatRupiah(nextInstallment.amount)}
                  </strong>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {customer.loans.length} kontrak pinjaman aktif · Jatuh tempo: {nextInstallment.date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('c-tagihan')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-sm"
                >
                  Bayar Sekarang
                </button>
              </div>
            )}

            {/* 2 Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Tagihan &amp; Pinjaman Aktif {customer.officialName}
                    </h3>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {customer.loans.length} Kontrak Terpisah
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Sisa Kewajiban Keseluruhan
                  </p>
                  <strong className="block text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight mt-0.5">
                    {formatRupiah(customer.remainingDebt)}
                  </strong>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {customer.loans.length > 0
                      ? `Dari total tagihan kontrak ${formatRupiah(customer.activeLoan)}`
                      : 'Belum ada kontrak pinjaman aktif'}
                  </p>

                  {customer.loans.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                      {customer.loans.map((loan) => (
                        <div
                          key={loan.id}
                          className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2"
                        >
                          <div className="min-w-0">
                            <strong className="font-bold text-slate-900 dark:text-white block truncate">
                              {loan.productName}
                            </strong>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {loan.paidInstallments}/{loan.totalInstallments} Lunas · {loan.dueDateDay}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <strong className="block font-mono-num font-bold text-slate-900 dark:text-white">
                              {formatRupiah(loan.remainingDebt)}
                            </strong>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                              {formatRupiah(loan.monthlyInstallment)}/bln
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-600"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {customer.paidInstallments} / {customer.totalInstallments} Angsuran Lunas
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                      {formatRupiah(customer.monthlyInstallment)}/bln
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Tabungan Digital {customer.officialName}
                    </h3>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {savingsFreq}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Saldo Tabungan Tersedia
                  </p>
                  <strong
                    data-testid="cust-savings-balance"
                    className="block text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight mt-0.5"
                  >
                    {formatRupiah(savingsBalance)}
                  </strong>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Setoran rutin terjadwal sesuai pilihan paket Anda
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenDeposit}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    + Setor Tabungan
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('c-tabungan')}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Ubah Opsi
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => onNavigate('c-tagihan')}
                className="min-h-[84px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <CreditCard className="w-[18px] h-[18px]" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Bayar Angsuran
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenDeposit}
                className="min-h-[84px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-[18px] h-[18px]" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Setor Tabungan
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('c-pinjaman')}
                className="min-h-[84px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calculator className="w-[18px] h-[18px]" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Ajukan Pinjaman
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('c-pesan')}
                className="min-h-[84px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <MessageSquare className="w-[18px] h-[18px]" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Chat Admin
                </span>
              </button>
            </div>

            {/* Transaction History Table */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Riwayat Transaksi Pribadi {customer.officialName}
                </h3>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    placeholder="Cari transaksi / ID..."
                    aria-label="Cari transaksi pribadi"
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">ID Transaksi</th>
                      <th className="py-2.5 px-3">Jenis Transaksi</th>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {customerTransactions.length > 0 ? (
                      customerTransactions.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 font-mono-num font-medium text-slate-600 dark:text-slate-300">
                            {tx.id}
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
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
                          {txSearch ? (
                            <>
                              Tidak ada transaksi yang cocok dengan &ldquo;{txSearch}&rdquo;.{' '}
                              <button
                                type="button"
                                onClick={() => setTxSearch('')}
                                className="text-blue-600 dark:text-blue-400 font-semibold underline ml-1"
                              >
                                Reset
                              </button>
                            </>
                          ) : (
                            'Belum ada riwayat transaksi tercatat.'
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PINJAMAN NASABAH */}
        {activePage === 'c-pinjaman' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Ringkasan Pinjaman · {customer.loans.length} Kontrak Terpisah
                </h2>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Nasabah: {customer.officialName} · WA: {customer.whatsapp}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    Total Kontrak Tagihan
                  </span>
                  <strong className="text-base font-extrabold text-slate-900 dark:text-white font-mono-num">
                    {formatRupiah(customer.activeLoan)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    Total Angsuran Terbayar
                  </span>
                  <strong className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {customer.paidInstallments} dari {customer.totalInstallments} Angsuran
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    Total Sisa Kewajiban
                  </span>
                  <strong className="text-base font-extrabold text-blue-700 dark:text-blue-400 font-mono-num">
                    {formatRupiah(customer.remainingDebt)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Simulasi Pengajuan Pinjaman Baru
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Pilih nominal, ketik manual, &amp; tenor 1–12 bulan
                </span>
              </div>

              <LoanSimulator
                idPrefix="cust"
                ctaLabel="Ajukan Pinjaman Ini"
                onSubmitCta={(amt, mos) =>
                  onToast(
                    `Pengajuan simulasi ${formatRupiah(amt)} (${mos} bulan) untuk ${customer.officialName} terkirim ke tim verifikasi!`
                  )
                }
              />
            </div>

            {customer.loans.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Nasabah ini belum memiliki kontrak pinjaman aktif.
              </div>
            ) : (
              customer.loans.map((loan, idx) => (
                <div
                  key={loan.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                        Kontrak Pinjaman #{idx + 1}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {loan.productName}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono-num">
                        Jatuh Tempo: {loan.dueDateDay} · Tenor {loan.loanTenor}
                      </span>
                      <strong className="text-sm font-extrabold text-blue-700 dark:text-blue-400 font-mono-num">
                        Sisa: {formatRupiah(loan.remainingDebt)} ({loan.paidInstallments}/
                        {loan.totalInstallments} Lunas)
                      </strong>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3">Angsuran</th>
                          <th className="py-2.5 px-3">Tanggal Bayar / Jatuh Tempo</th>
                          <th className="py-2.5 px-3 text-right">Tagihan / Bln</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                        {loan.schedule.map((row) => (
                          <tr
                            key={`${loan.id}-${row.installmentNumber}`}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                              Angsuran ke-{row.installmentNumber}
                            </td>
                            <td className="py-3 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                              {row.date}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                              {formatRupiah(row.amount)}
                            </td>
                            <td className="py-3 px-3">
                              <StatusBadge status={row.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TABUNGAN NASABAH */}
        {activePage === 'c-tabungan' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Saldo Tabungan Digital Anda
                </p>
                <strong className="block text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight mt-1">
                  {formatRupiah(savingsBalance)}
                </strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pemilik rekening resmi:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {customer.officialName}
                  </strong>{' '}
                  ({customer.id} · WA: {customer.whatsapp})
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDeposit}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-sm"
              >
                + Setor Tabungan Sekarang
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Pilih Opsi Menabung Anda
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Klik kartu untuk memilih frekuensi menabung
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(
                  [
                    {
                      freq: 'Menabung Harian' as SavingsFrequency,
                      desc: 'Setoran ringan setiap hari secara fleksibel.',
                      icon: <Sun className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
                    },
                    {
                      freq: 'Menabung Mingguan' as SavingsFrequency,
                      desc: 'Setoran rutin setiap minggu lebih teratur.',
                      icon: <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
                    },
                    {
                      freq: 'Menabung Bulanan' as SavingsFrequency,
                      desc: 'Setoran terencana setiap bulan setelah gajian.',
                      icon: (
                        <CalendarRange className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ),
                    },
                  ] as const
                ).map((opt) => {
                  const active = savingsFreq === opt.freq;
                  return (
                    <button
                      key={opt.freq}
                      type="button"
                      onClick={() => onChangeSavingsFreq(opt.freq)}
                      aria-pressed={active}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-600/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                      }`}
                    >
                      <div className="mb-2.5">{opt.icon}</div>
                      <strong className="block text-sm font-bold text-slate-900 dark:text-white mb-1">
                        {opt.freq}
                      </strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAGIHAN NASABAH */}
        {activePage === 'c-tagihan' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Konfirmasi &amp; Upload Bukti Pembayaran
              </h2>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-mono-num">
                Angsuran ke-{nextInstallment.installmentNumber}: {formatRupiah(nextInstallment.amount)}
              </span>
            </div>

            <form onSubmit={handlePayProofSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="cust-official-locked"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Nama Resmi &amp; No. WA Nasabah (Terkunci Sesuai Data)
                </label>
                <input
                  id="cust-official-locked"
                  value={`${customer.officialName} (${customer.id} · WA: ${customer.whatsapp})`}
                  readOnly
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-sm text-slate-700 dark:text-slate-300"
                />
              </div>

              <div>
                <label
                  htmlFor="bill-select"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Pilih Tagihan
                </label>
                <select
                  id="bill-select"
                  value={billSelect}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBillSelect(val);
                    const matched = loanBillOptions.find((o) => o.value === val);
                    if (matched) setBillAmount(String(matched.amount));
                  }}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
                >
                  {loanBillOptions.length === 0 ? (
                    <option value="">Tidak ada tagihan pinjaman aktif</option>
                  ) : (
                    loanBillOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="bill-amount"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Nominal Transfer (Rp)
                </label>
                <input
                  id="bill-amount"
                  type="number"
                  min={10000}
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono-num text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="bill-file"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Upload Bukti Transfer (JPG/PNG/PDF)
                </label>
                <input
                  id="bill-file"
                  type="file"
                  accept="image/*,.pdf"
                  required
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 dark:file:bg-blue-950 file:text-blue-700 dark:file:text-blue-300 file:font-semibold"
                />
              </div>

              <button
                type="submit"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-sm"
              >
                Kirim Bukti Pembayaran
              </button>
            </form>
          </div>
        )}

        {/* PESAN NASABAH */}
        {activePage === 'c-pesan' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-5 w-full max-w-3xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <div className="min-w-0">
                <h2 className="text-[15px] sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                  Live Chat dengan Admin OZdigiFinance
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                  Terhubung dengan akun {customer.officialName} (WA: {customer.whatsapp})
                </p>
              </div>
              <StatusBadge status="Online" />
            </div>

            <div className="h-[calc(100dvh-21rem)] min-h-[240px] max-h-[380px] sm:h-80 overflow-y-auto p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col gap-3 mb-3">
              {hasOlderMessages && onLoadOlderMessages && (
                <button
                  type="button"
                  onClick={onLoadOlderMessages}
                  className="self-center px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-blue-700 dark:text-blue-400 inline-flex items-center gap-1 hover:border-blue-500"
                >
                  <History className="w-3 h-3" aria-hidden="true" />
                  <span>Muat Pesan Sebelumnya</span>
                </button>
              )}

              {chatMessages.map((msg) => {
                const isCustomer = msg.sender === 'customer';
                const isSystemPay = msg.messageType === 'system_payment' || msg.senderRole === 'system';
                const safeImg =
                  msg.imageUrl && msg.imageUrl.startsWith('https://') ? msg.imageUrl : null;
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed break-words ${
                      isCustomer
                        ? 'self-end bg-blue-600 text-white'
                        : isSystemPay
                        ? 'self-start bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-slate-100'
                        : 'self-start bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
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
                    <div
                      className={`flex items-center justify-end gap-1.5 text-[10px] mt-1 ${
                        isCustomer
                          ? 'text-blue-100'
                          : isSystemPay
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      <span>
                        {msg.senderName} · {msg.time}
                      </span>
                      {isCustomer && (
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
                            <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                          ) : msg.status === 'delivered' ? (
                            <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                          ) : (
                            <Check className="w-3.5 h-3.5 opacity-80" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {showEmojiPicker && (
              <div className="flex flex-wrap gap-1.5 mb-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {['👍', '😊', '✅', '🙏', '💰', '🧾', '📄', '🔔'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setChatDraft((prev) => prev + em)}
                    className="w-8 h-8 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-base flex items-center justify-center"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {chatImageFile && (
              <div className="mb-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between gap-2">
                <span className="truncate">Lampiran: {chatImageFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setChatImageFile(null);
                    if (chatFileInputRef.current) chatFileInputRef.current.value = '';
                  }}
                  className="font-bold text-rose-600 dark:text-rose-400"
                >
                  Hapus
                </button>
              </div>
            )}

            <form onSubmit={handleChatSubmit} className="flex gap-1.5 sm:gap-2 items-center w-full min-w-0">
              <input
                ref={chatFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && file.size > 2 * 1024 * 1024) {
                    onToast('Ukuran gambar maksimal 2 MB.');
                    return;
                  }
                  setChatImageFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                aria-label="Lampirkan gambar"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-blue-500 shrink-0"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                aria-label="Pilih emoji"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-blue-500 shrink-0"
              >
                <Smile className="w-4 h-4" />
              </button>
              <input
                type="text"
                data-testid="cust-chat-input"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Tulis pesan ke Admin..."
                aria-label="Tulis pesan ke Admin"
                className="flex-1 min-w-0 w-full min-h-[42px] sm:min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                data-testid="cust-chat-send-btn"
                aria-label="Kirim pesan"
                className="min-h-[42px] sm:min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="hidden min-[380px]:inline">Kirim</span>
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Navigasi nasabah mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        {CUSTOMER_NAV.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'c-pesan' && unreadChatCount > 0 && (
                <span className="absolute top-0.5 right-3 min-w-[14px] h-3.5 px-1 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                  {unreadChatCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
