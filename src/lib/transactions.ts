import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { CustomerRegistryItem, TransactionRecord } from '../types/app';
import {
  applyLoanPayment,
  buildDeterministicLoanTxId,
  formatPaymentSystemMessage,
  formatRupiah,
} from '../utils/finance';
import { db, handleFirestoreError, OperationType } from './firebase';

export { buildDeterministicLoanTxId, formatPaymentSystemMessage };

export interface FirestoreTransactionDoc {
  transactionId: string;
  customerId: string;
  customerUid: string;
  officialName: string;
  adminId: string;
  loanId?: string;
  description: string;
  nominal: number;
  tanggal: string;
  jenisTransaksi: 'loan' | 'savings' | 'payment_proof';
  sisaTagihan: number;
  status: 'Terverifikasi' | 'Berhasil' | 'Menunggu Verifikasi' | 'Menunggu';
  createdAt?: Timestamp | null;
}

export function toUiTransaction(docItem: FirestoreTransactionDoc): TransactionRecord {
  return {
    id: docItem.transactionId,
    custId: docItem.customerId,
    officialName: docItem.officialName,
    description: docItem.description,
    date: docItem.tanggal,
    amount: docItem.nominal,
    status: docItem.status,
    scope: docItem.jenisTransaksi === 'savings' ? 'savings' : 'loan',
  };
}

export function subscribeFirestoreTransactions(
  params: { role: 'admin' | 'customer'; uid: string },
  onUpdate: (records: TransactionRecord[]) => void
): Unsubscribe {
  const colRef = collection(db, 'transactions');
  const q =
    params.role === 'admin'
      ? query(colRef, orderBy('createdAt', 'desc'), limit(200))
      : query(
          colRef,
          where('customerUid', '==', params.uid),
          orderBy('createdAt', 'desc'),
          limit(100)
        );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        toUiTransaction(d.data() as FirestoreTransactionDoc)
      );
      if (list.length > 0 || params.role === 'customer') {
        onUpdate(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'transactions');
    }
  );
}

export interface AtomicLoanPaymentResult {
  duplicate: boolean;
  transactionId: string;
  updatedCustomer: CustomerRegistryItem;
  paidAmount: number;
  installmentNumber: number;
  productName: string;
  isFullyPaid: boolean;
  systemMessageText: string;
}

/**
 * Atomic Firestore Transaction for Admin Loan Payment:
 * 1. Idempotency guard via deterministic `transactionId`
 * 2. Official `/transactions/{transactionId}` ledger write
 * 3. Customer loan balance & schedule update in `/customers/{custId}`
 * 4. Automated SYSTEM chat message in `/conversations/{custId}/messages/MSG-{transactionId}`
 * 5. Unread badge increment on `/conversations/{custId}`
 * 6. Notification document in `/notifications/NTF-{transactionId}`
 */
export async function recordAdminLoanPaymentAtomic(params: {
  adminUid: string;
  customer: CustomerRegistryItem;
  loanId: string;
  mode: 'monthly' | 'full';
  tanggal?: string;
}): Promise<AtomicLoanPaymentResult | null> {
  const targetLoan = params.customer.loans.find((l) => l.id === params.loanId);
  if (!targetLoan) return null;

  const transactionId = buildDeterministicLoanTxId({
    custId: params.customer.id,
    loanId: params.loanId,
    mode: params.mode,
    paidInstallmentsBefore: targetLoan.paidInstallments,
  });

  const tanggal =
    params.tanggal ||
    new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const txRef = doc(db, 'transactions', transactionId);
  const custRef = doc(db, 'customers', params.customer.id);
  const convRef = doc(db, 'conversations', params.customer.id);
  const msgId = `MSG-${transactionId}`.slice(0, 128);
  const msgRef = doc(db, 'conversations', params.customer.id, 'messages', msgId);
  const notifId = `NTF-${transactionId}`.slice(0, 128);
  const notifRef = doc(db, 'notifications', notifId);

  try {
    return await runTransaction(db, async (tx) => {
      const existingTxSnap = await tx.get(txRef);
      const custSnap = await tx.get(custRef);
      const convSnap = await tx.get(convRef);

      const liveCustomer: CustomerRegistryItem = custSnap.exists()
        ? (custSnap.data() as CustomerRegistryItem)
        : params.customer;
      const customerUid = custSnap.exists()
        ? ((custSnap.data().ownerUid as string) || '')
        : '';

      if (existingTxSnap.exists()) {
        const prevTx = existingTxSnap.data() as FirestoreTransactionDoc;
        return {
          duplicate: true,
          transactionId,
          updatedCustomer: liveCustomer,
          paidAmount: prevTx.nominal,
          installmentNumber: targetLoan.paidInstallments,
          productName: targetLoan.productName,
          isFullyPaid: liveCustomer.remainingDebt === 0,
          systemMessageText: formatPaymentSystemMessage({
            customerName: liveCustomer.officialName,
            nominal: prevTx.nominal,
            tanggal: prevTx.tanggal,
            sisaTagihan: prevTx.sisaTagihan,
          }),
        };
      }

      const applied = applyLoanPayment(liveCustomer, params.loanId, params.mode);
      if (!applied) {
        return null;
      }

      const systemMessageText = formatPaymentSystemMessage({
        customerName: liveCustomer.officialName,
        nominal: applied.paidAmount,
        tanggal,
        sisaTagihan: applied.updatedCustomer.remainingDebt,
      });

      const description = applied.isFullyPaid
        ? `Pelunasan Penuh ${applied.productName}`
        : `Pembayaran Bulanan ${applied.productName} (Ke-${applied.installmentNumber})`;

      tx.set(txRef, {
        transactionId,
        customerId: liveCustomer.id,
        customerUid,
        officialName: liveCustomer.officialName.slice(0, 120),
        adminId: params.adminUid,
        loanId: params.loanId,
        description: description.slice(0, 300),
        nominal: applied.paidAmount,
        tanggal,
        jenisTransaksi: 'loan',
        sisaTagihan: applied.updatedCustomer.remainingDebt,
        status: 'Terverifikasi',
        createdAt: serverTimestamp(),
      });

      tx.set(
        custRef,
        {
          id: applied.updatedCustomer.id,
          ownerUid: customerUid,
          officialName: applied.updatedCustomer.officialName,
          whatsapp: applied.updatedCustomer.whatsapp,
          productLabel: applied.updatedCustomer.productLabel,
          activeLoan: applied.updatedCustomer.activeLoan,
          monthlyInstallment: applied.updatedCustomer.monthlyInstallment,
          paidInstallments: applied.updatedCustomer.paidInstallments,
          totalInstallments: applied.updatedCustomer.totalInstallments,
          loanTenor: applied.updatedCustomer.loanTenor,
          remainingDebt: applied.updatedCustomer.remainingDebt,
          dueDateDay: applied.updatedCustomer.dueDateDay,
          status: applied.updatedCustomer.status,
          loans: applied.updatedCustomer.loans,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (!convSnap.exists()) {
        tx.set(convRef, {
          conversationId: liveCustomer.id,
          adminId: params.adminUid,
          customerId: liveCustomer.id,
          customerUid,
          customerName: liveCustomer.officialName,
          customerWhatsapp: liveCustomer.whatsapp,
          lastMessage: 'PEMBAYARAN BERHASIL DICATAT · ' + formatRupiah(applied.paidAmount),
          lastMessageAt: serverTimestamp(),
          unreadAdmin: 0,
          unreadCustomer: 1,
        });
      } else {
        tx.update(convRef, {
          lastMessage: 'PEMBAYARAN BERHASIL DICATAT · ' + formatRupiah(applied.paidAmount),
          lastMessageAt: serverTimestamp(),
          unreadCustomer: increment(1),
        });
      }

      tx.set(msgRef, {
        messageId: msgId,
        conversationId: liveCustomer.id,
        customerUid,
        senderId: params.adminUid,
        senderRole: 'system',
        senderName: 'SISTEM',
        message: systemMessageText,
        messageType: 'system_payment',
        transactionId,
        createdAt: serverTimestamp(),
        deliveredAt: null,
        readAt: null,
        status: 'sent',
      });

      tx.set(notifRef, {
        notificationId: notifId,
        recipientId: liveCustomer.id,
        recipientUid: customerUid,
        senderId: params.adminUid,
        title: applied.isFullyPaid
          ? `Pelunasan Pinjaman Lunas — ${applied.productName}`
          : `Pembayaran Bulan Ini Lunas — ${applied.productName}`,
        body: `Pembayaran ${applied.productName} sebesar ${formatRupiah(
          applied.paidAmount
        )} pada ${tanggal} telah BERHASIL DICATAT. Sisa tagihan: ${formatRupiah(
          applied.updatedCustomer.remainingDebt
        )}.`,
        type: 'TRANSACTION_ALERT',
        transactionId,
        conversationId: liveCustomer.id,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      return {
        duplicate: false,
        transactionId,
        updatedCustomer: applied.updatedCustomer,
        paidAmount: applied.paidAmount,
        installmentNumber: applied.installmentNumber,
        productName: applied.productName,
        isFullyPaid: applied.isFullyPaid,
        systemMessageText,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `transactions/${transactionId}`);
  }
}
