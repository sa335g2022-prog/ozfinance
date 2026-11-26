import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { ChatMessage } from '../types/app';
import { db, handleFirestoreError, OperationType, storage } from './firebase';
import { createNotificationDoc } from './notifications';

export interface FirestoreConversation {
  conversationId: string;
  adminId: string;
  customerId: string;
  customerUid: string;
  customerName: string;
  customerWhatsapp?: string;
  lastMessage: string;
  lastMessageAt?: Timestamp | null;
  unreadAdmin: number;
  unreadCustomer: number;
}

export interface FirestoreChatMessage {
  messageId: string;
  conversationId: string;
  customerUid: string;
  senderId: string;
  senderRole: 'admin' | 'customer' | 'system';
  senderName: string;
  message: string;
  messageType: 'text' | 'system_payment' | 'image';
  imageUrl?: string;
  transactionId?: string;
  createdAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  readAt?: Timestamp | null;
  status: 'sent' | 'delivered' | 'read';
}

export function formatFirestoreTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Baru saja';
  try {
    return ts.toDate().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Baru saja';
  }
}

export function toUiChatMessage(msg: FirestoreChatMessage): ChatMessage {
  return {
    id: msg.messageId,
    sender: msg.senderRole === 'customer' ? 'customer' : 'admin',
    senderRole: msg.senderRole,
    senderName: msg.senderName,
    text: msg.message,
    time: formatFirestoreTimestamp(msg.createdAt),
    messageType: msg.messageType,
    imageUrl: msg.imageUrl,
    transactionId: msg.transactionId,
    status: msg.status,
  };
}

export function subscribeConversations(
  params: { role: 'admin' | 'customer'; uid: string },
  onUpdate: (conversations: FirestoreConversation[]) => void
): Unsubscribe {
  const colRef = collection(db, 'conversations');
  const q =
    params.role === 'admin'
      ? query(colRef, orderBy('lastMessageAt', 'desc'), limit(200))
      : query(
          colRef,
          where('customerUid', '==', params.uid),
          orderBy('lastMessageAt', 'desc'),
          limit(10)
        );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as FirestoreConversation);
      onUpdate(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'conversations');
    }
  );
}

export function subscribeConversationMessages(
  conversationId: string,
  pageSize: number,
  onUpdate: (
    messages: FirestoreChatMessage[],
    oldestCursor: QueryDocumentSnapshot | null
  ) => void
): Unsubscribe {
  const path = `conversations/${conversationId}/messages`;
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs;
      const oldest = docs.length > 0 ? docs[docs.length - 1] : null;
      const chronological = docs
        .map((d) => d.data() as FirestoreChatMessage)
        .reverse();
      onUpdate(chronological, oldest);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function loadOlderConversationMessages(
  conversationId: string,
  cursor: QueryDocumentSnapshot,
  pageSize: number = 25
): Promise<{
  messages: FirestoreChatMessage[];
  nextCursor: QueryDocumentSnapshot | null;
}> {
  const path = `conversations/${conversationId}/messages`;
  try {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(cursor),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    const docs = snap.docs;
    return {
      messages: docs.map((d) => d.data() as FirestoreChatMessage).reverse(),
      nextCursor: docs.length > 0 ? docs[docs.length - 1] : null,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function uploadChatImageAttachment(
  conversationId: string,
  messageId: string,
  file: File
): Promise<string> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Format gambar harus JPG, PNG, WEBP, atau GIF.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Ukuran lampiran maksimal 2 MB.');
  }
  const safeExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'png';
  const fileRef = storageRef(
    storage,
    `chat-attachments/${conversationId}/${messageId}.${safeExt}`
  );
  await uploadBytes(fileRef, file, { contentType: file.type });
  return await getDownloadURL(fileRef);
}

export async function sendFirestoreChatMessage(params: {
  conversationId: string;
  customerId: string;
  customerUid: string;
  customerName: string;
  customerWhatsapp: string;
  senderUid: string;
  senderRole: 'admin' | 'customer';
  senderName: string;
  text: string;
  imageFile?: File | null;
}): Promise<void> {
  const cleanText = params.text.trim().slice(0, 4000);
  if (!cleanText && !params.imageFile) return;

  const messageId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let imageUrl = '';
  let messageType: 'text' | 'image' = 'text';

  if (params.imageFile) {
    imageUrl = await uploadChatImageAttachment(
      params.conversationId,
      messageId,
      params.imageFile
    );
    messageType = 'image';
  }

  const convRef = doc(db, 'conversations', params.conversationId);
  const msgRef = doc(db, 'conversations', params.conversationId, 'messages', messageId);

  try {
    const convSnap = await getDoc(convRef);
    const preview = (
      cleanText || (imageUrl ? 'Mengirim lampiran gambar' : '')
    ).slice(0, 1000);

    const batch = writeBatch(db);
    if (!convSnap.exists()) {
      batch.set(convRef, {
        conversationId: params.conversationId,
        adminId: params.senderRole === 'admin' ? params.senderUid : 'ADMIN',
        customerId: params.customerId,
        customerUid: params.customerUid,
        customerName: params.customerName.slice(0, 120),
        customerWhatsapp: params.customerWhatsapp.slice(0, 32),
        lastMessage: preview,
        lastMessageAt: serverTimestamp(),
        unreadAdmin: params.senderRole === 'customer' ? 1 : 0,
        unreadCustomer: params.senderRole === 'admin' ? 1 : 0,
      });
    } else {
      batch.update(convRef, {
        lastMessage: preview,
        lastMessageAt: serverTimestamp(),
        ...(params.senderRole === 'customer'
          ? { unreadAdmin: increment(1) }
          : { unreadCustomer: increment(1) }),
      });
    }

    batch.set(msgRef, {
      messageId,
      conversationId: params.conversationId,
      customerUid: params.customerUid,
      senderId: params.senderUid,
      senderRole: params.senderRole,
      senderName: params.senderName.slice(0, 120),
      message: cleanText || 'Lampiran gambar',
      messageType,
      ...(imageUrl ? { imageUrl } : {}),
      createdAt: serverTimestamp(),
      deliveredAt: null,
      readAt: null,
      status: 'sent',
    });

    await batch.commit();

    // Two-way notification creation
    const notifId = `NTF-${messageId}`;
    if (params.senderRole === 'customer') {
      await createNotificationDoc({
        notificationId: notifId,
        recipientId: 'ADMIN',
        recipientUid: 'ADMIN',
        senderId: params.senderUid,
        title: `Pesan Baru dari ${params.customerName}`,
        body: preview,
        type: 'CHAT_MESSAGE',
        conversationId: params.conversationId,
      });
    } else if (params.customerUid) {
      await createNotificationDoc({
        notificationId: notifId,
        recipientId: params.customerId,
        recipientUid: params.customerUid,
        senderId: params.senderUid,
        title: `Pesan Baru dari Admin OZdigiFinance`,
        body: preview,
        type: 'CHAT_MESSAGE',
        conversationId: params.conversationId,
      });
    }
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `conversations/${params.conversationId}/messages/${messageId}`
    );
  }
}

export async function markConversationMessagesRead(params: {
  conversationId: string;
  readerRole: 'admin' | 'customer';
  messages: FirestoreChatMessage[];
}): Promise<void> {
  const convRef = doc(db, 'conversations', params.conversationId);
  try {
    const convSnap = await getDoc(convRef);
    const batch = writeBatch(db);
    let hasWrites = false;

    if (convSnap.exists()) {
      const data = convSnap.data() as FirestoreConversation;
      const currentUnread =
        params.readerRole === 'admin' ? data.unreadAdmin : data.unreadCustomer;
      if (currentUnread > 0) {
        batch.update(convRef, {
          lastMessageAt: serverTimestamp(),
          ...(params.readerRole === 'admin'
            ? { unreadAdmin: 0 }
            : { unreadCustomer: 0 }),
        });
        hasWrites = true;
      }
    }

    const toMark = params.messages.filter((m) => {
      if (m.status === 'read') return false;
      return params.readerRole === 'admin'
        ? m.senderRole === 'customer'
        : m.senderRole === 'admin' || m.senderRole === 'system';
    });

    toMark.slice(0, 100).forEach((m) => {
      const ref = doc(
        db,
        'conversations',
        params.conversationId,
        'messages',
        m.messageId
      );
      batch.update(ref, {
        status: 'read',
        deliveredAt: m.deliveredAt ?? serverTimestamp(),
        readAt: serverTimestamp(),
      });
      hasWrites = true;
    });

    if (hasWrites) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `conversations/${params.conversationId}`
    );
  }
}
