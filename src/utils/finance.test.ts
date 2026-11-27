import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_WHATSAPP,
  applyLoanPayment,
  buildDeterministicLoanTxId,
  buildLoanItem,
  buildTransactionsCsv,
  computeAvatarDrawLayout,
  computeLoan,
  computeSessionSignature,
  createSavingsAccountAssignment,
  DEFAULT_ADMIN_PASSWORD,
  ensureCustomerDefaultPassword,
  formatPaymentSystemMessage,
  formatRupiah,
  formatShortNominal,
  generateNextCustomerId,
  isValidSessionPayload,
  normalizePhoneDigits,
  registerNewCustomerAccount,
  summarizeCustomerFromLoans,
  toWhatsAppHref,
  verifyAdminLogin,
  verifyCustomerLogin,
} from './finance';
import { detectIOSBrowser, shouldShowInstallBanner } from './pwa';

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

test('verifyAdminLogin checks WhatsApp 08568080847 and password 0000', () => {
  assert.equal(verifyAdminLogin(ADMIN_WHATSAPP, DEFAULT_ADMIN_PASSWORD).ok, true);
  assert.equal(verifyAdminLogin('+62 856-8080-847', '0000').ok, true);
  assert.equal(verifyAdminLogin('081234567890', '0000').ok, false);
  assert.equal(verifyAdminLogin(ADMIN_WHATSAPP, '9999').ok, false);
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

test('registerNewCustomerAccount creates customer ID, normalizes WA, prevents duplicates, and enables instant login', () => {
  const existing = summarizeCustomerFromLoans({
    id: 'OZF-00001',
    officialName: "B'DONK",
    whatsapp: '087736661267',
    status: 'Aktif',
    loans: [],
  });

  const duplicateRes = registerNewCustomerAccount({
    existingCustomers: [existing],
    officialName: 'Duplikat',
    whatsapp: '+62 877-3666-1267',
    password: 'pass123',
  });
  assert.equal(duplicateRes.ok, false);

  const shortPassRes = registerNewCustomerAccount({
    existingCustomers: [existing],
    officialName: 'Siti Aminah',
    whatsapp: '081299887766',
    password: '12',
  });
  assert.equal(shortPassRes.ok, false);

  const okRes = registerNewCustomerAccount({
    existingCustomers: [existing],
    officialName: 'Siti Aminah',
    whatsapp: '+62 812-9988-7766',
    password: 'mypassword',
  });
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.equal(okRes.customer.id, 'OZF-00002');
    assert.equal(okRes.customer.whatsapp, '081299887766');
    assert.equal(okRes.customer.loans.length, 0);
    assert.equal(okRes.password, 'mypassword');
    const loginCheck = verifyCustomerLogin(
      [existing, okRes.customer],
      { [okRes.customer.id]: okRes.password },
      '081299887766',
      'mypassword'
    );
    assert.equal(loginCheck.ok, true);
  }
});

test('ensureCustomerDefaultPassword enables immediate login for admin-added customers without overwriting custom passwords', () => {
  const adminAdded = summarizeCustomerFromLoans({
    id: 'OZF-00015',
    officialName: 'Nasabah Baru Admin',
    whatsapp: '081355443322',
    status: 'Aktif',
    loans: [],
  });

  const passMap = ensureCustomerDefaultPassword(adminAdded, {});
  assert.equal(passMap['OZF-00015'], '081355443322');
  assert.equal(
    verifyCustomerLogin([adminAdded], passMap, '+6281355443322', '081355443322').ok,
    true
  );

  const preservedMap = ensureCustomerDefaultPassword(adminAdded, {
    'OZF-00015': 'custom999',
  });
  assert.equal(preservedMap['OZF-00015'], 'custom999');
});

test('PWA helpers enforce standalone suppression, cooldown reminder, and iOS UA detection', () => {
  assert.equal(
    shouldShowInstallBanner({ isInstalled: true, dismissedUntilMs: null, nowMs: 1000 }),
    false
  );
  assert.equal(
    shouldShowInstallBanner({ isInstalled: false, dismissedUntilMs: 5000, nowMs: 1000 }),
    false
  );
  assert.equal(
    shouldShowInstallBanner({ isInstalled: false, dismissedUntilMs: 500, nowMs: 1000 }),
    true
  );
  assert.equal(
    shouldShowInstallBanner({ isInstalled: false, dismissedUntilMs: null, nowMs: 1000 }),
    true
  );

  assert.equal(
    detectIOSBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),
    true
  );
  assert.equal(
    detectIOSBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'),
    false
  );
});

test('createSavingsAccountAssignment creates savings for existing loan customers and new customers cleanly', () => {
  const loanCust = summarizeCustomerFromLoans({
    id: 'OZF-00001',
    officialName: "B'DONK",
    whatsapp: '087736661267',
    status: 'Aktif',
    loans: [
      buildLoanItem({
        id: 'LN-1',
        productName: 'Paylater HP',
        monthlyInstallment: 751_581,
        paidInstallments: 8,
        totalInstallments: 12,
        dueDateDay: 'Tgl 25',
      }),
    ],
  });

  const loanSavRes = createSavingsAccountAssignment({
    mode: 'existing',
    existingCustomers: [loanCust],
    existingSavings: [],
    selectedCustomerId: 'OZF-00001',
    program: 'Menabung Mingguan',
    initialDeposit: 150_000,
  });
  assert.equal(loanSavRes.ok, true);
  if (loanSavRes.ok) {
    assert.equal(loanSavRes.account.id, 'OZF-00001');
    assert.equal(loanSavRes.account.balance, 150_000);
    assert.equal(loanSavRes.newCustomer, undefined);
  }

  const dupExisting = createSavingsAccountAssignment({
    mode: 'existing',
    existingCustomers: [loanCust],
    existingSavings: loanSavRes.ok ? [loanSavRes.account] : [],
    selectedCustomerId: 'OZF-00001',
    program: 'Menabung Harian',
  });
  assert.equal(dupExisting.ok, false);

  const newSavRes = createSavingsAccountAssignment({
    mode: 'new',
    existingCustomers: [loanCust],
    existingSavings: [],
    officialName: 'SITI AMINAH',
    whatsapp: '+62 812-3456-0000',
    program: 'Menabung Harian',
    initialDeposit: 50_000,
  });
  assert.equal(newSavRes.ok, true);
  if (newSavRes.ok && newSavRes.newCustomer) {
    assert.equal(newSavRes.newCustomer.id, 'OZF-00002');
    assert.equal(newSavRes.newCustomer.loans.length, 0);
    assert.equal(newSavRes.account.id, 'OZF-00002');
    assert.equal(newSavRes.account.balance, 50_000);
    assert.equal(newSavRes.defaultPassword, '081234560000');
  }
});

test('computeAvatarDrawLayout preserves full uncropped bounds in contain mode and fills circle in cover mode', () => {
  const wideContain = computeAvatarDrawLayout({
    canvasWidth: 320,
    canvasHeight: 320,
    imgWidth: 1600,
    imgHeight: 800,
    fitMode: 'contain',
  });
  assert.equal(wideContain.isNonSquare, true);
  assert.equal(wideContain.dw, 320);
  assert.equal(wideContain.dh, 160);
  assert.equal(wideContain.coverDw, 640);
  assert.equal(wideContain.coverDh, 320);

  const portraitContain = computeAvatarDrawLayout({
    canvasWidth: 320,
    canvasHeight: 320,
    imgWidth: 900,
    imgHeight: 1800,
    fitMode: 'contain',
  });
  assert.equal(portraitContain.dw, 160);
  assert.equal(portraitContain.dh, 320);

  const squareLogo = computeAvatarDrawLayout({
    canvasWidth: 320,
    canvasHeight: 320,
    imgWidth: 192,
    imgHeight: 192,
    fitMode: 'contain',
  });
  assert.equal(squareLogo.isNonSquare, false);
  assert.equal(squareLogo.dw, 320);
  assert.equal(squareLogo.dh, 320);
});


