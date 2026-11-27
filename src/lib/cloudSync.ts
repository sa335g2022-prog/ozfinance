import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { CustomerRegistryItem, SavingsAccount, TransactionRecord } from '../types/app';
import {
  deleteCustomerFromFirestore,
  deleteSavingsFromFirestore,
  saveCustomerToFirestore,
  saveSavingsToFirestore,
} from './auth';
import { db } from './firebase';

const CLOUD_SYNC_QUEUE_KEY = 'ozf_cloud_sync_queue_v1';

export type CloudSyncTask =
  | { kind: 'upsertCustomer'; customer: CustomerRegistryItem; ownerUid?: string }
  | { kind: 'deleteCustomer'; custId: string }
  | { kind: 'upsertSavings'; account: SavingsAccount; ownerUid?: string }
  | { kind: 'deleteSavings'; custId: string }
  | {
      kind: 'upsertTransaction';
      tx: TransactionRecord;
      customerUid: string;
      adminId: string;
      sisaTagihan: number;
      jenisTransaksi: 'loan' | 'savings' | 'payment_proof';
    }
  | {
      kind: 'ensureConversation';
      customerId: string;
      customerUid: string;
      customerName: string;
      customerWhatsapp: string;
      adminId: string;
    };

function taskKey(task: CloudSyncTask): string {
  switch (task.kind) {
    case 'upsertCustomer':
    case 'deleteCustomer':
      return `cust:${task.kind === 'upsertCustomer' ? task.customer.id : task.custId}`;
    case 'upsertSavings':
    case 'deleteSavings':
      return `sav:${task.kind === 'upsertSavings' ? task.account.id : task.custId}`;
    case 'upsertTransaction':
      return `tx:${task.tx.id}`;
    case 'ensureConversation':
      return `conv:${task.customerId}`;
  }
}

export function loadCloudSyncQueue(): CloudSyncTask[] {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CloudSyncTask[]) : [];
  } catch {
    return [];
  }
}

function saveCloudSyncQueue(tasks: CloudSyncTask[]): void {
  try {
    if (tasks.length === 0) {
      localStorage.removeItem(CLOUD_SYNC_QUEUE_KEY);
    } else {
      localStorage.setItem(CLOUD_SYNC_QUEUE_KEY, JSON.stringify(tasks));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueCloudSyncTask(task: CloudSyncTask): number {
  const existing = loadCloudSyncQueue();
  const key = taskKey(task);
  const filtered = existing.filter((t) => taskKey(t) !== key);
  const next = [...filtered, task];
  saveCloudSyncQueue(next);
  return next.length;
}

export async function saveTransactionDocToFirestore(params: {
  tx: TransactionRecord;
  customerUid: string;
  adminId: string;
  sisaTagihan: number;
  jenisTransaksi: 'loan' | 'savings' | 'payment_proof';
}): Promise<void> {
  const ref = doc(db, 'transactions', params.tx.id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    transactionId: params.tx.id,
    customerId: params.tx.custId,
    customerUid: params.customerUid,
    officialName: params.tx.officialName.slice(0, 120),
    adminId: params.adminId,
    loanId: '',
    description: params.tx.description.slice(0, 300),
    nominal: Math.max(0, params.tx.amount),
    tanggal: params.tx.date.slice(0, 32),
    jenisTransaksi: params.jenisTransaksi,
    sisaTagihan: Math.max(0, params.sisaTagihan),
    status: params.tx.status,
    createdAt: serverTimestamp(),
  });
}

export async function ensureConversationDocInFirestore(params: {
  customerId: string;
  customerUid: string;
  customerName: string;
  customerWhatsapp: string;
  adminId: string;
}): Promise<void> {
  const convRef = doc(db, 'conversations', params.customerId);
  const snap = await getDoc(convRef);
  if (snap.exists()) {
    const data = snap.data() as { customerUid?: string };
    if (!data.customerUid && params.customerUid) {
      await setDoc(
        convRef,
        { customerUid: params.customerUid, lastMessageAt: serverTimestamp() },
        { merge: true }
      );
    }
    return;
  }
  await setDoc(convRef, {
    conversationId: params.customerId,
    adminId: params.adminId || 'ADMIN',
    customerId: params.customerId,
    customerUid: params.customerUid,
    customerName: params.customerName.slice(0, 120),
    customerWhatsapp: params.customerWhatsapp.slice(0, 32),
    lastMessage: `Ruang chat ${params.customerName}`.slice(0, 1000),
    lastMessageAt: serverTimestamp(),
    unreadAdmin: 0,
    unreadCustomer: 0,
  });
}

export async function flushCloudSyncQueue(params: {
  role: 'admin' | 'customer';
  uid: string;
}): Promise<{ synced: number; remaining: number }> {
  const queue = loadCloudSyncQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const remaining: CloudSyncTask[] = [];
  let synced = 0;

  for (const task of queue) {
    try {
      if (params.role === 'customer') {
        // Customers can only sync their own owned records
        if (task.kind === 'upsertCustomer') {
          if (task.customer.loans.length === 0) {
            await saveCustomerToFirestore(task.customer, params.uid);
            synced++;
          } else {
            remaining.push(task);
          }
          continue;
        }
        if (task.kind === 'upsertSavings') {
          await saveSavingsToFirestore(task.account, params.uid);
          synced++;
          continue;
        }
        if (
          task.kind === 'upsertTransaction' &&
          (task.jenisTransaksi === 'payment_proof' || task.jenisTransaksi === 'savings')
        ) {
          await saveTransactionDocToFirestore({
            tx: task.tx,
            customerUid: params.uid,
            adminId: task.adminId || 'ADMIN',
            sisaTagihan: task.sisaTagihan,
            jenisTransaksi: task.jenisTransaksi,
          });
          synced++;
          continue;
        }
        if (task.kind === 'ensureConversation') {
          await ensureConversationDocInFirestore({
            ...task,
            customerUid: params.uid,
          });
          synced++;
          continue;
        }
        remaining.push(task);
        continue;
      }

      // Admin flushes all queued domain records
      switch (task.kind) {
        case 'upsertCustomer':
          await saveCustomerToFirestore(task.customer, task.ownerUid || '');
          break;
        case 'deleteCustomer':
          await deleteCustomerFromFirestore(task.custId);
          break;
        case 'upsertSavings':
          await saveSavingsToFirestore(task.account, task.ownerUid || '');
          break;
        case 'deleteSavings':
          await deleteSavingsFromFirestore(task.custId);
          break;
        case 'upsertTransaction':
          await saveTransactionDocToFirestore({
            tx: task.tx,
            customerUid: task.customerUid,
            adminId: params.uid,
            sisaTagihan: task.sisaTagihan,
            jenisTransaksi: task.jenisTransaksi,
          });
          break;
        case 'ensureConversation':
          await ensureConversationDocInFirestore({
            ...task,
            adminId: params.uid,
          });
          break;
      }
      synced++;
    } catch {
      remaining.push(task);
    }
  }

  saveCloudSyncQueue(remaining);
  return { synced, remaining: remaining.length };
}
