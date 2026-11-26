# Security Specification — OZdigiFinance Firebase Backend (Phase 0)

## 1. Data Invariants
1. **Admin Authority Isolation**: Only verified identities registered in `/admins/{uid}` or verified runtime admin emails (`sa33.5g.2022@gmail.com`, `alfauzy80@gmail.com`) with `email_verified == true` may perform administrative mutations on `/customers`, `/savingsAccounts`, `/transactions`, and `/admins`.
2. **No Self-Role Escalation**: Authenticated users creating or updating `/users/{uid}` may never assign themselves `role: 'admin'` or alter `uid` / `createdAt`.
3. **Immutable Official Ledger**: `/transactions/{transactionId}` can only be created or updated by verified Admins using deterministic `transactionId` keys for atomic idempotency. Customers cannot create, edit, or delete official payment transactions.
4. **Private Customer Isolation**: Customers can only read their own `/customers/{custId}`, `/savingsAccounts/{custId}`, `/conversations/{custId}`, `/conversations/{custId}/messages/*`, `/transactions/*`, `/notifications/*`, and `/deviceTokens/*` where `ownerUid` / `customerUid` / `recipientUid` / `userId` matches `request.auth.uid`.
5. **Strict Schema & Size Bounds**: Every string field enforces `.size()`, every document enforces `.keys().hasAll(...)` and `.keys().hasOnly(...)` on create, and updates enforce `affectedKeys().hasOnly(...)` + immutable `createdAt`/`id` checks.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, and `lastMessageAt` timestamps must equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: Write to `/customers/OZF-00001` with `email: 'alfauzy80@gmail.com'` and `email_verified: false`.
2. **Self-Role Escalation**: Customer writes `/users/{uid}` with `{ role: 'admin', status: 'Aktif' }`.
3. **Ghost Field Shadow Update**: User updates `/users/{uid}` adding extra field `isSuperAdmin: true`.
4. **Cross-Customer Read**: Customer A queries `/transactions` or `/conversations/OZF-00002` belonging to Customer B.
5. **Customer Ledger Tampering**: Customer attempts `update` or `delete` on `/transactions/TXN-OZF-00001-LN-00001-2-ANG-3` to alter `nominal` or `sisaTagihan`.
6. **System Message Forgery**: Customer creates `/conversations/OZF-00001/messages/MSG-FAKE` with `senderRole: 'system'` and `messageType: 'system_payment'`.
7. **Timestamp Backdating**: Write `/conversations/OZF-00001/messages/M1` with client-forged `createdAt` instead of `request.time`.
8. **ID Poisoning / DoS**: Write `/customers/` with 1,500-char document ID or invalid characters (`../evil`).
9. **String Overflow**: Send chat message with 10,000-character body (`message.size() > 4000`).
10. **Admin Registry Tampering**: Customer creates `/admins/{uid}` to grant themselves admin role.
11. **Device Token Hijack**: Customer A writes `/deviceTokens/TOK-1` with `userId` set to Customer B's UID or `role: 'admin'`.
12. **Terminal State / Immutable Field Bypass**: Update `/transactions/{id}` changing `createdAt` or `transactionId`.
