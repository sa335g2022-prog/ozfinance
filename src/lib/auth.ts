import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  INITIAL_CHAT_THREADS,
  INITIAL_CUSTOMERS,
  INITIAL_SAVINGS_ACCOUNTS,
  INITIAL_TRANSACTIONS,
} from '../data/seed';
import type { CustomerRegistryItem, SavingsAccount } from '../types/app';
import { ADMIN_EMAIL, normalizePhoneDigits } from '../utils/finance';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';

export const OWNER_ADMIN_EMAIL = 'sa33.5g.2022@gmail.com';

export interface FirebaseUserDoc {
  uid: string;
  nama: string;
  email: string;
  whatsapp?: string;
  custId?: string;
  role: 'admin' | 'customer';
  status: 'Aktif' | 'Nonaktif';
  soundEnabled: boolean;
}

export function isTrustedAdminEmail(email?: string | null, emailVerified?: boolean | null): boolean {
  if (!email || !emailVerified) return false;
  const clean = email.trim().toLowerCase();
  return clean === OWNER_ADMIN_EMAIL || clean === ADMIN_EMAIL;
}

export function subscribeFirebaseAuthState(
  callback: (user: User | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithFirebaseGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureFirebaseUserProfile(cred.user);
  return cred.user;
}

export async function signInWithFirebaseCredentials(
  email: string,
  password: string
): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureFirebaseUserProfile(cred.user);
  return cred.user;
}

export async function registerFirebaseCredentials(params: {
  email: string;
  password: string;
  nama: string;
  whatsapp?: string;
  custId?: string;
}): Promise<User> {
  const cred = await createUserWithEmailAndPassword(
    auth,
    params.email.trim(),
    params.password
  );
  if (!cred.user.emailVerified) {
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // Ignore rate-limit or preview email restriction
    }
  }
  await ensureFirebaseUserProfile(cred.user, {
    nama: params.nama,
    whatsapp: params.whatsapp,
    custId: params.custId,
  });
  return cred.user;
}

export async function updateFirebasePassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) return;
  await updatePassword(auth.currentUser, newPassword);
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function ensureFirebaseUserProfile(
  user: User,
  hints?: { nama?: string; whatsapp?: string; custId?: string }
): Promise<FirebaseUserDoc> {
  const adminByEmail = isTrustedAdminEmail(user.email, user.emailVerified);
  let resolvedRole: 'admin' | 'customer' = adminByEmail ? 'admin' : 'customer';

  if (!adminByEmail && user.emailVerified) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      if (adminSnap.exists()) {
        resolvedRole = 'admin';
      }
    } catch {
      // Not admin
    }
  }

  if (adminByEmail && user.emailVerified) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid,
          email: user.email ?? ADMIN_EMAIL,
          role: 'admin',
          createdAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignore if rules block unverified
    }
  }

  const userRef = doc(db, 'users', user.uid);
  const existingSnap = await getDoc(userRef);

  if (existingSnap.exists()) {
    const data = existingSnap.data() as FirebaseUserDoc;
    return {
      ...data,
      role: resolvedRole,
    };
  }

  const profile: FirebaseUserDoc = {
    uid: user.uid,
    nama: hints?.nama || user.displayName || (resolvedRole === 'admin' ? 'Admin OZdigiFinance' : 'Nasabah OZdigiFinance'),
    email: user.email || '',
    whatsapp: hints?.whatsapp || '',
    custId: hints?.custId || (resolvedRole === 'admin' ? 'ADM-001' : ''),
    role: resolvedRole,
    status: 'Aktif',
    soundEnabled: true,
  };

  if (user.emailVerified) {
    try {
      await setDoc(userRef, {
        uid: profile.uid,
        nama: profile.nama,
        email: profile.email,
        whatsapp: profile.whatsapp ?? '',
        custId: profile.custId ?? '',
        role: profile.role,
        status: profile.status,
        soundEnabled: profile.soundEnabled,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
    }
  }

  return profile;
}

export async function updateUserSoundPreferenceInFirestore(
  uid: string,
  soundEnabled: boolean
): Promise<void> {
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await setDoc(
      ref,
      {
        soundEnabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserProfileInFirestore(params: {
  uid: string;
  nama?: string;
  whatsapp?: string;
}): Promise<void> {
  try {
    const ref = doc(db, 'users', params.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await setDoc(
      ref,
      {
        ...(params.nama ? { nama: params.nama.slice(0, 120) } : {}),
        ...(params.whatsapp ? { whatsapp: params.whatsapp.slice(0, 32) } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // Non-blocking if profile update is restricted
  }
}

/**
 * Seeds initial customers, conversations, and transactions into Firestore ONLY once
 * when `/customers` is empty so existing records are preserved forever.
 */
export async function seedFirestoreIfEmpty(adminUid: string): Promise<boolean> {
  try {
    const existing = await getDocs(query(collection(db, 'customers'), limit(1)));
    if (!existing.empty) return false;

    const batch = writeBatch(db);

    for (const c of INITIAL_CUSTOMERS) {
      batch.set(doc(db, 'customers', c.id), {
        id: c.id,
        ownerUid: '',
        officialName: c.officialName,
        whatsapp: c.whatsapp,
        productLabel: c.productLabel,
        activeLoan: c.activeLoan,
        monthlyInstallment: c.monthlyInstallment,
        paidInstallments: c.paidInstallments,
        totalInstallments: c.totalInstallments,
        loanTenor: c.loanTenor,
        remainingDebt: c.remainingDebt,
        dueDateDay: c.dueDateDay,
        status: c.status,
        loans: c.loans,
        updatedAt: serverTimestamp(),
      });

      const initialMessages = INITIAL_CHAT_THREADS[c.id] || [];
      const lastMsg = initialMessages[initialMessages.length - 1];
      batch.set(doc(db, 'conversations', c.id), {
        conversationId: c.id,
        adminId: adminUid,
        customerId: c.id,
        customerUid: '',
        customerName: c.officialName,
        customerWhatsapp: c.whatsapp,
        lastMessage: lastMsg?.text.slice(0, 1000) || `Ruang chat ${c.officialName}`,
        lastMessageAt: serverTimestamp(),
        unreadAdmin: 0,
        unreadCustomer: 0,
      });

      for (const m of initialMessages) {
        batch.set(doc(db, 'conversations', c.id, 'messages', m.id), {
          messageId: m.id,
          conversationId: c.id,
          customerUid: '',
          senderId: m.sender === 'admin' ? adminUid : c.id,
          senderRole: m.sender,
          senderName: m.senderName,
          message: m.text,
          messageType: 'text',
          createdAt: serverTimestamp(),
          deliveredAt: serverTimestamp(),
          readAt: serverTimestamp(),
          status: 'read',
        });
      }
    }

    for (const acc of INITIAL_SAVINGS_ACCOUNTS) {
      batch.set(doc(db, 'savingsAccounts', acc.id), {
        id: acc.id,
        ownerUid: '',
        officialName: acc.officialName,
        whatsapp: acc.whatsapp,
        program: acc.program,
        routine: acc.routine,
        balance: acc.balance,
        lastDate: acc.lastDate,
        status: acc.status,
        updatedAt: serverTimestamp(),
      });
    }

    for (const tx of INITIAL_TRANSACTIONS) {
      const cust = INITIAL_CUSTOMERS.find((c) => c.id === tx.custId);
      batch.set(doc(db, 'transactions', tx.id), {
        transactionId: tx.id,
        customerId: tx.custId,
        customerUid: '',
        officialName: tx.officialName,
        adminId: adminUid,
        loanId: '',
        description: tx.description,
        nominal: tx.amount,
        tanggal: tx.date,
        jenisTransaksi: tx.scope,
        sisaTagihan: cust?.remainingDebt ?? 0,
        status: tx.status,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'customers');
  }
}

export function subscribeFirestoreCustomers(
  params: { role: 'admin' | 'customer'; uid: string },
  onData: (customers: (CustomerRegistryItem & { ownerUid?: string })[]) => void
): Unsubscribe {
  const colRef = collection(db, 'customers');
  const q =
    params.role === 'admin'
      ? query(colRef, limit(200))
      : query(colRef, where('ownerUid', '==', params.uid), limit(5));

  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty && params.role === 'admin') {
        return;
      }
      const list = snap.docs
        .map((d) => d.data() as CustomerRegistryItem & { ownerUid?: string })
        .sort((a, b) => a.id.localeCompare(b.id));
      if (list.length > 0) {
        onData(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'customers');
    }
  );
}

export async function saveCustomerToFirestore(
  customer: CustomerRegistryItem,
  ownerUid: string = ''
): Promise<void> {
  const path = `customers/${customer.id}`;
  try {
    let existingOwner = '';
    if (!ownerUid) {
      try {
        const existing = await getDoc(doc(db, 'customers', customer.id));
        if (existing.exists()) {
          existingOwner = (existing.data().ownerUid as string) || '';
        }
      } catch {
        existingOwner = '';
      }
    }
    const resolvedOwner = ownerUid || existingOwner;

    await setDoc(doc(db, 'customers', customer.id), {
      id: customer.id,
      ownerUid: resolvedOwner,
      officialName: customer.officialName.slice(0, 120),
      whatsapp: customer.whatsapp.slice(0, 32),
      productLabel: customer.productLabel.slice(0, 200),
      activeLoan: customer.activeLoan,
      monthlyInstallment: customer.monthlyInstallment,
      paidInstallments: customer.paidInstallments,
      totalInstallments: customer.totalInstallments,
      loanTenor: customer.loanTenor.slice(0, 64),
      remainingDebt: customer.remainingDebt,
      dueDateDay: customer.dueDateDay.slice(0, 32),
      status: customer.status,
      loans: customer.loans.slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCustomerFromFirestore(custId: string): Promise<void> {
  const path = `customers/${custId}`;
  try {
    await deleteDoc(doc(db, 'customers', custId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function linkCustomerUidByWhatsapp(
  customers: CustomerRegistryItem[],
  whatsapp: string,
  uid: string
): Promise<string | null> {
  const targetWa = normalizePhoneDigits(whatsapp);
  const match = customers.find((c) => normalizePhoneDigits(c.whatsapp) === targetWa);
  if (!match) return null;

  try {
    await setDoc(
      doc(db, 'customers', match.id),
      { ownerUid: uid, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await setDoc(
      doc(db, 'conversations', match.id),
      { customerUid: uid, lastMessageAt: serverTimestamp() },
      { merge: true }
    );
    await setDoc(
      doc(db, 'savingsAccounts', match.id),
      { ownerUid: uid, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // Only Admin or linked owner can update
  }
  return match.id;
}

export function subscribeFirestoreSavings(
  params: { role: 'admin' | 'customer'; uid: string },
  onData: (accounts: SavingsAccount[]) => void
): Unsubscribe {
  const colRef = collection(db, 'savingsAccounts');
  const q =
    params.role === 'admin'
      ? query(colRef, limit(200))
      : query(colRef, where('ownerUid', '==', params.uid), limit(5));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as SavingsAccount);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'savingsAccounts');
    }
  );
}

export async function saveSavingsToFirestore(
  account: SavingsAccount,
  ownerUid: string = ''
): Promise<void> {
  const path = `savingsAccounts/${account.id}`;
  try {
    let existingOwner = '';
    if (!ownerUid) {
      try {
        const existing = await getDoc(doc(db, 'savingsAccounts', account.id));
        if (existing.exists()) {
          existingOwner = (existing.data().ownerUid as string) || '';
        }
      } catch {
        existingOwner = '';
      }
    }
    await setDoc(doc(db, 'savingsAccounts', account.id), {
      id: account.id,
      ownerUid: ownerUid || existingOwner,
      officialName: account.officialName.slice(0, 120),
      whatsapp: account.whatsapp.slice(0, 32),
      program: account.program,
      routine: account.routine.slice(0, 120),
      balance: Math.max(0, account.balance),
      lastDate: account.lastDate.slice(0, 32),
      status: account.status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSavingsFromFirestore(custId: string): Promise<void> {
  const path = `savingsAccounts/${custId}`;
  try {
    await deleteDoc(doc(db, 'savingsAccounts', custId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
