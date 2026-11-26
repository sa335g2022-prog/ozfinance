import type {
  CustomerRegistryItem,
  LoanCalculation,
  LoanItem,
  LoanScheduleRow,
  TransactionRecord,
  UserSession,
} from '../types/app';

export const NOMINAL_PRESETS = [
  500_000,
  1_000_000,
  2_000_000,
  3_000_000,
  5_000_000,
  10_000_000,
  15_000_000,
  20_000_000,
] as const;

export const TENOR_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function formatRupiah(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return 'Rp ' + safe.toLocaleString('id-ID');
}

export function formatShortNominal(value: number): string {
  if (value >= 1_000_000) {
    const jt = value / 1_000_000;
    return `Rp ${Number.isInteger(jt) ? jt : jt.toFixed(1)} jt`;
  }
  return `Rp ${Math.round(value / 1_000)} rb`;
}

export function toWhatsAppHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('0')
    ? '62' + digits.slice(1)
    : digits.startsWith('62')
    ? digits
    : '62' + digits;
  return `https://wa.me/${normalized}`;
}

/**
 * Pure loan installment & disbursement calculator matching OZdigiFinance business rules:
 * - Tenor 1 month: 15% flat monthly rate
 * - Tenor 2 months: 9% flat monthly rate
 * - Tenor 3-12 months: 5% flat monthly rate
 * - Admin fee: Rp 20.000 for <= 5 months, Rp 50.000 for >= 6 months
 */
export function computeLoan(amount: number, months: number): LoanCalculation {
  const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const safeMonths = Math.min(12, Math.max(1, Math.round(Number.isFinite(months) ? months : 1)));

  let interestRate = 0.05;
  if (safeMonths === 1) interestRate = 0.15;
  else if (safeMonths === 2) interestRate = 0.09;

  const adminFee = safeMonths <= 5 ? 20_000 : 50_000;
  const monthlyInstallment = safeAmount / safeMonths + safeAmount * interestRate;
  const netDisbursed = Math.max(0, safeAmount - adminFee);

  return {
    monthlyInstallment,
    netDisbursed,
    months: safeMonths,
    interestRate,
    adminFee,
  };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function buildLoanItem(params: {
  id: string;
  productName: string;
  monthlyInstallment: number;
  paidInstallments: number;
  totalInstallments: number;
  dueDateDay: string;
  existingSchedule?: LoanScheduleRow[];
}): LoanItem {
  const safeTotal = Math.max(1, Math.round(params.totalInstallments || 1));
  const safePaid = Math.min(safeTotal, Math.max(0, Math.round(params.paidInstallments || 0)));
  const safeMonthly = Math.max(0, Math.round(params.monthlyInstallment || 0));
  const dueNum = Number(params.dueDateDay.replace(/\D/g, '')) || 25;
  const paddedDue = String(Math.min(31, Math.max(1, dueNum))).padStart(2, '0');

  let schedule: LoanScheduleRow[];
  if (params.existingSchedule && params.existingSchedule.length === safeTotal) {
    schedule = params.existingSchedule;
  } else {
    schedule = Array.from({ length: safeTotal }, (_, idx) => {
      const n = idx + 1;
      const monthIndex = (10 + idx) % 12;
      const year = 2026 + Math.floor((10 + idx) / 12);
      const status: LoanScheduleRow['status'] =
        n <= safePaid ? 'Lunas' : n === safePaid + 1 ? 'Jatuh Tempo' : 'Belum Lunas';
      return {
        installmentNumber: n,
        date: `${paddedDue} ${MONTH_ABBR[monthIndex]} ${year}`,
        amount: safeMonthly,
        status,
      };
    });
  }

  const activeLoan = safeMonthly * safeTotal;
  const remainingDebt = Math.max(0, safeMonthly * (safeTotal - safePaid));

  return {
    id: params.id,
    productName: params.productName.trim() || 'Pinjaman Reguler',
    activeLoan,
    monthlyInstallment: safeMonthly,
    paidInstallments: safePaid,
    totalInstallments: safeTotal,
    loanTenor: `${safeTotal} Bulan`,
    remainingDebt,
    dueDateDay: params.dueDateDay.trim() || `Tgl ${dueNum}`,
    schedule,
  };
}

export function summarizeCustomerFromLoans(base: {
  id: string;
  officialName: string;
  whatsapp: string;
  status: 'Aktif' | 'Berjalan';
  loans: LoanItem[];
}): CustomerRegistryItem {
  const loans = base.loans;
  if (loans.length === 0) {
    return {
      ...base,
      productLabel: 'Belum Ada Pinjaman Aktif',
      activeLoan: 0,
      monthlyInstallment: 0,
      paidInstallments: 0,
      totalInstallments: 0,
      loanTenor: '0 Bulan',
      remainingDebt: 0,
      dueDateDay: '-',
      schedule: [],
      loans: [],
    };
  }

  const primary = loans[0];
  const activeLoan = loans.reduce((sum, l) => sum + l.activeLoan, 0);
  const monthlyInstallment = loans.reduce((sum, l) => sum + l.monthlyInstallment, 0);
  const paidInstallments = loans.reduce((sum, l) => sum + l.paidInstallments, 0);
  const totalInstallments = loans.reduce((sum, l) => sum + l.totalInstallments, 0);
  const remainingDebt = loans.reduce((sum, l) => sum + l.remainingDebt, 0);
  const productLabel = loans.map((l) => l.productName).join(' · ');
  const uniqueTenors = Array.from(new Set(loans.map((l) => l.totalInstallments)));
  const loanTenor =
    uniqueTenors.length === 1
      ? `${uniqueTenors[0]} Bulan`
      : `${uniqueTenors.join(' & ')} Bulan`;
  const uniqueDues = Array.from(
    new Set(loans.map((l) => l.dueDateDay.replace(/^Tgl\s*/i, '').trim()))
  );
  const dueDateDay =
    uniqueDues.length === 1 ? `Tgl ${uniqueDues[0]}` : `Tgl ${uniqueDues.join(' / ')}`;

  return {
    ...base,
    productLabel,
    activeLoan,
    monthlyInstallment,
    paidInstallments,
    totalInstallments,
    loanTenor,
    remainingDebt,
    dueDateDay,
    schedule: primary.schedule,
    loans,
  };
}

export function generateNextCustomerId(customers: Pick<CustomerRegistryItem, 'id'>[]): string {
  let maxNum = 0;
  for (const c of customers) {
    const m = /^OZF-(\d+)$/i.exec(c.id.trim());
    if (m) {
      const val = Number(m[1]);
      if (val > maxNum) maxNum = val;
    }
  }
  return `OZF-${String(maxNum + 1).padStart(5, '0')}`;
}

export function computeSessionSignature(payload: {
  tokenId: string;
  userId: string;
  role: string;
  issuedAt: number;
}): string {
  const raw = `${payload.tokenId}|${payload.userId}|${payload.role}|${payload.issuedAt}|OZF_GUARD_2026`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function isValidSessionPayload(
  candidate: unknown,
  nowMs: number = Date.now()
): candidate is UserSession {
  if (!candidate || typeof candidate !== 'object') return false;
  const s = candidate as Partial<UserSession>;
  if (!s.tokenId || !s.userId || !s.role || !s.signature || typeof s.issuedAt !== 'number') {
    return false;
  }
  if (s.role !== 'customer' && s.role !== 'admin') return false;
  if (typeof s.expiresAt !== 'number' || nowMs > s.expiresAt) return false;
  const expected = computeSessionSignature({
    tokenId: s.tokenId,
    userId: s.userId,
    role: s.role,
    issuedAt: s.issuedAt,
  });
  return s.signature === expected;
}

export const ADMIN_EMAIL = 'alfauzy80@gmail.com';
export const DEFAULT_ADMIN_PASSWORD = '0000';

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return '0' + digits.slice(2);
  if (digits.startsWith('8')) return '0' + digits;
  return digits;
}

export function verifyCustomerLogin(
  customers: CustomerRegistryItem[],
  customerPasswords: Record<string, string>,
  whatsappInput: string,
  passwordInput: string
): { ok: true; customer: CustomerRegistryItem } | { ok: false; error: string } {
  const normalizedInputWa = normalizePhoneDigits(whatsappInput);
  if (!normalizedInputWa) {
    return { ok: false, error: 'Masukkan nomor WhatsApp yang terdaftar.' };
  }

  const matched = customers.find(
    (c) => normalizePhoneDigits(c.whatsapp) === normalizedInputWa
  );
  if (!matched) {
    return { ok: false, error: 'Nomor WhatsApp tidak ditemukan dalam data nasabah.' };
  }

  const customPassword = customerPasswords[matched.id];
  const expectedPassword = customPassword ?? matched.whatsapp;
  const trimmedPass = passwordInput.trim();
  const matchesDefault =
    customPassword === undefined &&
    normalizePhoneDigits(trimmedPass) === normalizePhoneDigits(matched.whatsapp);

  if (passwordInput === expectedPassword || trimmedPass === expectedPassword || matchesDefault) {
    return { ok: true, customer: matched };
  }

  return { ok: false, error: 'Password salah. Gunakan password Anda atau hubungi Admin.' };
}

export function verifyAdminLogin(
  emailInput: string,
  passwordInput: string,
  adminPassword: string = DEFAULT_ADMIN_PASSWORD
): { ok: true } | { ok: false; error: string } {
  const cleanEmail = emailInput.trim().toLowerCase();
  if (cleanEmail !== ADMIN_EMAIL) {
    return { ok: false, error: 'Email Admin tidak terdaftar.' };
  }
  if (passwordInput !== adminPassword) {
    return { ok: false, error: 'Password Admin salah.' };
  }
  return { ok: true };
}

export function applyLoanPayment(
  customer: CustomerRegistryItem,
  loanId: string,
  mode: 'monthly' | 'full'
): {
  updatedCustomer: CustomerRegistryItem;
  paidAmount: number;
  installmentNumber: number;
  productName: string;
  isFullyPaid: boolean;
} | null {
  const targetLoan = customer.loans.find((l) => l.id === loanId);
  if (!targetLoan) return null;

  const remainingMonths = Math.max(0, targetLoan.totalInstallments - targetLoan.paidInstallments);
  if (remainingMonths === 0) {
    return {
      updatedCustomer: customer,
      paidAmount: 0,
      installmentNumber: targetLoan.totalInstallments,
      productName: targetLoan.productName,
      isFullyPaid: true,
    };
  }

  const newPaidCount =
    mode === 'full'
      ? targetLoan.totalInstallments
      : Math.min(targetLoan.totalInstallments, targetLoan.paidInstallments + 1);

  const installmentNumber = targetLoan.paidInstallments + 1;
  const paidAmount =
    mode === 'full' ? targetLoan.remainingDebt : targetLoan.monthlyInstallment;

  const updatedSchedule: LoanScheduleRow[] = targetLoan.schedule.map((row) => {
    if (row.installmentNumber <= newPaidCount) {
      return { ...row, status: 'Lunas' };
    }
    if (row.installmentNumber === newPaidCount + 1) {
      return { ...row, status: 'Jatuh Tempo' };
    }
    return { ...row, status: 'Belum Lunas' };
  });

  const updatedLoan = buildLoanItem({
    id: targetLoan.id,
    productName: targetLoan.productName,
    monthlyInstallment: targetLoan.monthlyInstallment,
    paidInstallments: newPaidCount,
    totalInstallments: targetLoan.totalInstallments,
    dueDateDay: targetLoan.dueDateDay,
    existingSchedule: updatedSchedule,
  });

  const updatedCustomer = summarizeCustomerFromLoans({
    id: customer.id,
    officialName: customer.officialName,
    whatsapp: customer.whatsapp,
    status: customer.status,
    loans: customer.loans.map((l) => (l.id === loanId ? updatedLoan : l)),
  });

  return {
    updatedCustomer,
    paidAmount,
    installmentNumber,
    productName: targetLoan.productName,
    isFullyPaid: newPaidCount >= targetLoan.totalInstallments,
  };
}

export interface LiveUpcomingDueItem {
  id: string;
  custId: string;
  loanId: string;
  dayNum: number;
  day: string;
  name: string;
  whatsapp: string;
  productName: string;
  meta: string;
  amount: number;
  installmentNumber: number;
}

export function buildUpcomingDuesFromCustomers(
  customers: CustomerRegistryItem[]
): LiveUpcomingDueItem[] {
  const items: LiveUpcomingDueItem[] = [];
  for (const cust of customers) {
    for (const loan of cust.loans) {
      if (loan.remainingDebt <= 0 || loan.paidInstallments >= loan.totalInstallments) {
        continue;
      }
      const dayNum = Number(loan.dueDateDay.replace(/\D/g, '')) || 25;
      const day = String(dayNum).padStart(2, '0');
      const nextNum = loan.paidInstallments + 1;
      items.push({
        id: `${cust.id}-${loan.id}`,
        custId: cust.id,
        loanId: loan.id,
        dayNum,
        day,
        name: cust.officialName,
        whatsapp: cust.whatsapp,
        productName: loan.productName,
        meta: `${cust.id} · ${loan.productName} (Angsuran ke-${nextNum}/${loan.totalInstallments}) · WA: ${cust.whatsapp}`,
        amount: loan.monthlyInstallment,
        installmentNumber: nextNum,
      });
    }
  }
  return items.sort((a, b) => a.dayNum - b.dayNum);
}

export function buildTransactionsCsv(transactions: TransactionRecord[]): string {
  const header = ['ID Nasabah', 'Nama Resmi', 'ID Transaksi', 'Keterangan', 'Tanggal', 'Nominal', 'Status'];
  const escapeCsv = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = transactions.map((tx) =>
    [
      tx.custId,
      tx.officialName,
      tx.id,
      tx.description,
      tx.date,
      tx.amount,
      tx.status,
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function buildDeterministicLoanTxId(params: {
  custId: string;
  loanId: string;
  mode: 'monthly' | 'full';
  paidInstallmentsBefore: number;
}): string {
  const nextSeq = params.paidInstallmentsBefore + 1;
  const suffix =
    params.mode === 'full' ? `FULL-${params.paidInstallmentsBefore}` : `ANG-${nextSeq}`;
  return `TXN-${params.custId}-${params.loanId}-${suffix}`.replace(/[^a-zA-Z0-9_\-]/g, '-');
}

export function formatPaymentSystemMessage(params: {
  customerName: string;
  nominal: number;
  tanggal: string;
  sisaTagihan: number;
}): string {
  return [
    'PEMBAYARAN BERHASIL DICATAT',
    '',
    `Halo ${params.customerName}.`,
    '',
    'Pembayaran angsuran Anda telah berhasil dicatat oleh admin.',
    '',
    `Nominal pembayaran: ${formatRupiah(params.nominal)}`,
    `Tanggal pembayaran: ${params.tanggal}`,
    `Sisa tagihan: ${formatRupiah(params.sisaTagihan)}`,
    'Status: BERHASIL DICATAT',
    '',
    'Terima kasih telah melakukan pembayaran.',
  ].join('\n');
}

