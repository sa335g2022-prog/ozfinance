import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_EMAIL,
  applyLoanPayment,
  buildDeterministicLoanTxId,
  buildLoanItem,
  buildTransactionsCsv,
  computeLoan,
  computeSessionSignature,
  DEFAULT_ADMIN_PASSWORD,
  formatPaymentSystemMessage,
  formatRupiah,
  formatShortNominal,
  generateNextCustomerId,
  isValidSessionPayload,
  normalizePhoneDigits,
  summarizeCustomerFromLoans,
  toWhatsAppHref,
  verifyAdminLogin,
  verifyCustomerLogin,
} from './finance';

test('toWhatsAppHref normalizes Indonesian 08xx numbers to wa.me/628xx', () => {
  assert.equal(toWhatsAppHref('087736661267'), 'https://wa.me/6287736661267');
  assert.equal(toWhatsAppHref('6281316379737'), 'https://wa.me/6281316379737');
});

test('computeLoan applies tiered interest rates and admin fees accurately', () => {
  const oneMonth = computeLoan(1_000_000, 1);
  assert.equal(oneMonth.interestRate, 0.15);
  assert.equal(oneMonth.adminFee, 20_000);
  assert.equal(oneMonth.netDisbursed, 980_000);
  assert.equal(oneMonth.monthlyInstallment, 1_150_000);

  const twoMonths = computeLoan(2_000_000, 2);
  assert.equal(twoMonths.interestRate, 0.09);
  assert.equal(twoMonths.adminFee, 20_000);
  assert.equal(twoMonths.netDisbursed, 1_980_000);
  assert.equal(twoMonths.monthlyInstallment, 1_180_000);

  const sixMonths = computeLoan(3_000_000, 6);
  assert.equal(sixMonths.interestRate, 0.05);
  assert.equal(sixMonths.adminFee, 50_000);
  assert.equal(sixMonths.netDisbursed, 2_950_000);
  assert.equal(sixMonths.monthlyInstallment, 650_000);
});

test('computeLoan supports arbitrary manual amounts and clamps negative inputs', () => {
  const manual = computeLoan(1_750_000, 3);
  assert.equal(manual.interestRate, 0.05);
  assert.equal(manual.adminFee, 20_000);
  assert.equal(manual.netDisbursed, 1_730_000);
  assert.equal(Math.round(manual.monthlyInstallment), 670_833);

  const clamped = computeLoan(-500_000, 24);
  assert.equal(clamped.months, 12);
  assert.equal(clamped.netDisbursed, 0);
  assert.equal(clamped.monthlyInstallment, 0);
});

test('buildLoanItem and summarizeCustomerFromLoans aggregate multiple separated loans accurately', () => {
  const l1 = buildLoanItem({
    id: 'LN-1',
    productName: 'Paylater HP',
    monthlyInstallment: 751_581,
    paidInstallments: 8,
    totalInstallments: 12,
    dueDateDay: 'Tgl 25',
  });
  const l2 = buildLoanItem({
    id: 'LN-2',
    productName: 'Spinjam',
    monthlyInstallment: 193_176,
    paidInstallments: 0,
    totalInstallments: 3,
    dueDateDay: 'Tgl 3',
  });
  const summary = summarizeCustomerFromLoans({
    id: 'OZF-00001',
    officialName: "B'DONK",
    whatsapp: '087736661267',
    status: 'Aktif',
    loans: [l1, l2],
  });

  assert.equal(summary.loans.length, 2);
  assert.equal(summary.productLabel, 'Paylater HP · Spinjam');
  assert.equal(summary.remainingDebt, 751_581 * 4 + 193_176 * 3);
  assert.equal(summary.paidInstallments, 8);
  assert.equal(summary.totalInstallments, 15);
  assert.equal(generateNextCustomerId([{ id: 'OZF-00001' }, { id: 'OZF-00010' }]), 'OZF-00011');
});

test('verifyCustomerLogin authenticates WA + default WA password and respects changed password', () => {
  const l1 = buildLoanItem({
    id: 'LN-1',
    productName: 'Paylater HP',
    monthlyInstallment: 751_581,
    paidInstallments: 8,
    totalInstallments: 12,
    dueDateDay: 'Tgl 25',
  });
  const cust = summarizeCustomerFromLoans({
    id: 'OZF-00001',
    officialName: "B'DONK",
    whatsapp: '087736661267',
    status: 'Aktif',
    loans: [l1],
  });

  assert.equal(normalizePhoneDigits('+62 877-3666-1267'), '087736661267');

  const okDefault = verifyCustomerLogin([cust], {}, '087736661267', '087736661267');
  assert.equal(okDefault.ok, true);

  const failWrong = verifyCustomerLogin([cust], {}, '087736661267', 'salah');
  assert.equal(failWrong.ok, false);

  const customMap = { 'OZF-00001': 'rahasia99' };
  assert.equal(verifyCustomerLogin([cust], customMap, '087736661267', '087736661267').ok, false);
  assert.equal(verifyCustomerLogin([cust], customMap, '6287736661267', 'rahasia99').ok, true);
});

test('verifyAdminLogin checks email alfauzy80@gmail.com and password 0000', () => {
  assert.equal(verifyAdminLogin(ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD).ok, true);
  assert.equal(verifyAdminLogin('ALFAUZY80@GMAIL.COM', '0000').ok, true);
  assert.equal(verifyAdminLogin('other@gmail.com', '0000').ok, false);
  assert.equal(verifyAdminLogin(ADMIN_EMAIL, '9999').ok, false);
});

test('applyLoanPayment updates monthly installment and full payoff accurately', () => {
  const l1 = buildLoanItem({
    id: 'LN-1',
    productName: 'Spinjam',
    monthlyInstallment: 200_000,
    paidInstallments: 1,
    totalInstallments: 4,
    dueDateDay: 'Tgl 10',
  });
  const cust = summarizeCustomerFromLoans({
    id: 'OZF-00099',
    officialName: 'TES',
    whatsapp: '08123456789',
    status: 'Aktif',
    loans: [l1],
  });

  const monthlyRes = applyLoanPayment(cust, 'LN-1', 'monthly');
  assert.ok(monthlyRes);
  assert.equal(monthlyRes.paidAmount, 200_000);
  assert.equal(monthlyRes.installmentNumber, 2);
  assert.equal(monthlyRes.isFullyPaid, false);
  assert.equal(monthlyRes.updatedCustomer.paidInstallments, 2);
  assert.equal(monthlyRes.updatedCustomer.remainingDebt, 400_000);

  const fullRes = applyLoanPayment(monthlyRes.updatedCustomer, 'LN-1', 'full');
  assert.ok(fullRes);
  assert.equal(fullRes.paidAmount, 400_000);
  assert.equal(fullRes.isFullyPaid, true);
  assert.equal(fullRes.updatedCustomer.remainingDebt, 0);
});

test('formatRupiah and formatShortNominal produce Indonesian formatting', () => {
  assert.equal(formatRupiah(1200000), 'Rp 1.200.000');
  assert.equal(formatShortNominal(500000), 'Rp 500 rb');
  assert.equal(formatShortNominal(15000000), 'Rp 15 jt');
});

test('isValidSessionPayload verifies FNV-1a signature and expiration', () => {
  const issuedAt = 1_700_000_000_000;
  const payload = {
    tokenId: 'tok_abc123',
    userId: 'OZF-00001',
    officialName: "B'DONK",
    role: 'customer' as const,
    issuedAt,
    expiresAt: issuedAt + 10_000,
    signature: computeSessionSignature({
      tokenId: 'tok_abc123',
      userId: 'OZF-00001',
      role: 'customer',
      issuedAt,
    }),
  };

  assert.equal(isValidSessionPayload(payload, issuedAt + 5_000), true);
  assert.equal(isValidSessionPayload(payload, issuedAt + 20_000), false);
  assert.equal(
    isValidSessionPayload({ ...payload, role: 'admin' }, issuedAt + 5_000),
    false
  );
});

test('buildTransactionsCsv escapes commas and formats header cleanly', () => {
  const csv = buildTransactionsCsv([
    {
      id: 'TRX-001',
      custId: 'OZF-00001',
      officialName: "B'DONK",
      description: 'Angsuran ke-4, Lunas',
      date: '25 Nov 2026',
      amount: 751581,
      status: 'Terverifikasi',
      scope: 'loan',
    },
  ]);

  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^ID Nasabah,Nama Resmi,/);
  assert.match(lines[1], /"Angsuran ke-4, Lunas"/);
});

test('buildDeterministicLoanTxId produces stable idempotent IDs matching Firestore rule charset', () => {
  const tx1 = buildDeterministicLoanTxId({
    custId: 'OZF-00001',
    loanId: 'LN-1',
    mode: 'monthly',
    paidInstallmentsBefore: 8,
  });
  const tx2 = buildDeterministicLoanTxId({
    custId: 'OZF-00001',
    loanId: 'LN-1',
    mode: 'monthly',
    paidInstallmentsBefore: 8,
  });
  const txNext = buildDeterministicLoanTxId({
    custId: 'OZF-00001',
    loanId: 'LN-1',
    mode: 'monthly',
    paidInstallmentsBefore: 9,
  });

  assert.equal(tx1, tx2);
  assert.equal(tx1, 'TXN-OZF-00001-LN-1-ANG-9');
  assert.notEqual(tx1, txNext);
  assert.match(tx1, /^[a-zA-Z0-9_\-]+$/);
});

test('formatPaymentSystemMessage generates exact required automated notification format', () => {
  const msg = formatPaymentSystemMessage({
    customerName: "B'DONK",
    nominal: 751581,
    tanggal: '26 Nov 2026',
    sisaTagihan: 2254743,
  });

  assert.ok(msg.startsWith('PEMBAYARAN BERHASIL DICATAT\n\nHalo B\'DONK.'));
  assert.ok(msg.includes('Nominal pembayaran: Rp 751.581'));
  assert.ok(msg.includes('Tanggal pembayaran: 26 Nov 2026'));
  assert.ok(msg.includes('Sisa tagihan: Rp 2.254.743'));
  assert.ok(msg.includes('Status: BERHASIL DICATAT'));
  assert.ok(msg.endsWith('Terima kasih telah melakukan pembayaran.'));
});

