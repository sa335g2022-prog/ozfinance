export type ThemeMode = 'light' | 'dark';
export type ViewRole = 'guest' | 'customer' | 'admin';
export type SavingsFrequency = 'Menabung Harian' | 'Menabung Mingguan' | 'Menabung Bulanan';

export type CustomerPageId =
  | 'c-beranda'
  | 'c-pinjaman'
  | 'c-tabungan'
  | 'c-tagihan'
  | 'c-pesan';

export type AdminPageId =
  | 'a-dashboard'
  | 'a-nasabah'
  | 'a-pinjaman'
  | 'a-tabungan'
  | 'a-tagihan'
  | 'a-pesan'
  | 'a-laporan';

export interface UserSession {
  tokenId: string;
  userId: string;
  officialName: string;
  whatsapp?: string;
  role: 'customer' | 'admin';
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export interface LoanCalculation {
  monthlyInstallment: number;
  netDisbursed: number;
  months: number;
  interestRate: number;
  adminFee: number;
}

export interface TransactionRecord {
  id: string;
  custId: string;
  officialName: string;
  description: string;
  date: string;
  amount: number;
  status: 'Terverifikasi' | 'Berhasil' | 'Menunggu Verifikasi' | 'Menunggu';
  scope: 'loan' | 'savings';
}

export interface SavingsAccount {
  id: string;
  officialName: string;
  whatsapp: string;
  program: SavingsFrequency;
  routine: string;
  balance: number;
  lastDate: string;
  status: 'Aktif' | 'Nonaktif';
}

export interface SavingsMutation {
  id: string;
  date: string;
  officialName: string;
  custId: string;
  type: 'Setoran' | 'Penarikan';
  program: SavingsFrequency;
  amount: number;
  note?: string;
}

export interface PendingBill {
  id: string;
  dayBadge: string;
  custId: string;
  officialName: string;
  whatsapp: string;
  billTitle: string;
  amount: number;
  subtitle: string;
  verified: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'admin';
  senderRole?: 'customer' | 'admin' | 'system';
  senderName: string;
  text: string;
  time: string;
  messageType?: 'text' | 'system_payment' | 'image';
  imageUrl?: string;
  transactionId?: string;
  status?: 'sent' | 'delivered' | 'read';
}

export interface CustomerNotification {
  id: string;
  custId: string;
  category: 'warn' | 'pay' | 'sav';
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  transactionId?: string;
  conversationId?: string;
}

export interface LoanScheduleRow {
  installmentNumber: number;
  date: string;
  amount: number;
  status: 'Lunas' | 'Jatuh Tempo' | 'Belum Lunas';
}

export interface LoanItem {
  id: string;
  productName: string;
  activeLoan: number;
  monthlyInstallment: number;
  paidInstallments: number;
  totalInstallments: number;
  loanTenor: string;
  remainingDebt: number;
  dueDateDay: string;
  schedule: LoanScheduleRow[];
}

export interface CustomerRegistryItem {
  id: string;
  officialName: string;
  whatsapp: string;
  productLabel: string;
  activeLoan: number;
  monthlyInstallment: number;
  paidInstallments: number;
  totalInstallments: number;
  loanTenor: string;
  remainingDebt: number;
  dueDateDay: string;
  status: 'Aktif' | 'Berjalan';
  schedule: LoanScheduleRow[];
  loans: LoanItem[];
}
