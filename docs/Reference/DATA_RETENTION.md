# Data Retention & Deletion Guide

**Purpose:** Rules for data retention, deletion, and cleanup to ensure compliance with global privacy laws (GDPR, HIPAA, DPDPA) and respect patient rights.

**Audience:** AI agents and developers implementing data handling features.

**Related:** [COMPLIANCE.md](./COMPLIANCE.md) | [SECURITY.md](./SECURITY.md) | [DB_SCHEMA.md](./DB_SCHEMA.md)

---

## 🗂️ Core Principles

### 1. Data Minimization

**MUST:** Collect and retain only data necessary for the service

- **Collect:** Patient name, phone, reason for visit, appointment date/time
- **Do not collect:** Unnecessary personal details, medical history (unless explicitly needed for appointment type)

### 2. Purpose Limitation

**MUST:** Use data only for stated purpose (appointment booking, payment processing)

- **Do not:** Use patient data for marketing without explicit consent
- **Do not:** Share data with third parties (except payment gateways for payment processing)

### 3. Retention Limits

**MUST:** Delete data when no longer needed

- **Active appointments:** Retain until appointment completed + retention period
- **Historical appointments:** Retain for doctor's records + compliance period
- **Patient requests:** Delete immediately on request (right to erasure)

---

## ⏱️ Retention Periods

### Appointments

| Status | Retention Period | Rationale |
|--------|------------------|-----------|
| **Pending** (unpaid) | 7 days after creation | Payment link expires; patient can rebook |
| **Confirmed** (upcoming) | Until appointment date + 30 days | Doctor may need to reference; patient may cancel |
| **Completed** | 1 year | Medical records requirement (varies by jurisdiction) |
| **Cancelled** | 30 days | Patient may rebook; track no-show patterns |

**After retention period:** Anonymize or delete (see "Anonymization vs Deletion" below)

### Payments

| Status | Retention Period | Rationale |
|--------|------------------|-----------|
| **Captured** | 7 years | Financial/tax records (longest global requirement) |
| **Pending** (unpaid) | 30 days | Reconciliation; patient may complete payment late |
| **Failed** | 30 days | Debugging; retry patterns |

**Note:** Payment records (gateway order ID, amount, status) are minimal and contain no PCI data.

### Conversations

| Type | Retention Period | Rationale |
|------|------------------|-----------|
| **Active** (conversation in progress) | 24 hours from last message | Patient may resume; context for multi-turn flow |
| **Completed** (appointment booked) | Linked to appointment retention | Context for appointment |
| **Abandoned** (no booking) | 7 days | Patient may return; track engagement patterns |

**Note:** Conversation messages may contain PHI (patient name, reason). Follow same retention as appointments.

### Audit Logs

| Type | Retention Period | Rationale |
|------|------------------|-----------|
| **Security events** (auth failures, signature failures) | 1 year | Compliance; incident investigation |
| **Audit events** (create/read/update appointment) | 1 year | Compliance; doctor accountability |
| **Access logs** (API requests) | 90 days | Debugging; performance monitoring |

---

## 🗑️ Deletion Methods

### Anonymization vs Deletion

**Anonymization:** Replace PHI with placeholders; retain statistical data

```sql
-- ✅ Anonymize (retain count for analytics)
UPDATE appointments
SET patient_name = '[REDACTED]',
    patient_phone = '[REDACTED]',
    notes = '[REDACTED]'
WHERE id = 'apt-123';
```

**Deletion:** Permanently remove record

```sql
-- ✅ Delete (complete removal)
DELETE FROM appointments WHERE id = 'apt-123';
```

**When to use:**
- **Anonymize:** When doctor needs appointment history for analytics (appointment count, revenue) but patient requests deletion
- **Delete:** When patient requests full deletion (GDPR "right to erasure"); when retention period expires and no legal hold

### Cascading Deletion

**MUST:** Delete related records when deleting primary record

```sql
-- ✅ Delete appointment and related data
DELETE FROM payments WHERE appointment_id = 'apt-123';
DELETE FROM appointments WHERE id = 'apt-123';
-- Conversations and consent records cascade via foreign key ON DELETE CASCADE
```

**Database:** Use `ON DELETE CASCADE` for foreign keys where appropriate (see [DB_SCHEMA.md](./DB_SCHEMA.md))

---

## 🔐 Patient Deletion Requests (Right to Erasure)

### GDPR / DPDPA / CCPA

**Patient right:** Request deletion of their data

**Process:**

1. **Verify identity:** Confirm patient owns the data (phone, email, or doctor confirms)
2. **Check legal holds:** Medical records may have minimum retention (e.g., 7 years in some jurisdictions); anonymize if cannot delete
3. **Delete data:**
   - Appointments (or anonymize)
   - Payments (retain for financial records; anonymize patient link)
   - Conversations
   - Consent records
4. **Confirm deletion:** Notify patient that data has been deleted (within 30 days of request)

**Implementation (future):**
```typescript
// Future API: DELETE /api/v1/patients/:phone
export async function deletePatientData(phone: string, doctorId: string) {
  // 1. Find all appointments for patient
  // 2. Anonymize or delete based on retention rules
  // 3. Delete conversations
  // 4. Delete consent records
  // 5. Log deletion audit event
}
```

---

## 🤖 Automated Cleanup Jobs

### Scheduled Cleanup (future)

**Implement cleanup jobs** to auto-delete expired data:

**1. Delete expired pending appointments** (unpaid after 7 days)
```typescript
// Cron job: daily at 2 AM
async function cleanupExpiredPendingAppointments() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await supabase
    .from('appointments')
    .delete()
    .eq('status', 'pending')
    .lt('created_at', sevenDaysAgo.toISOString());
}
```

**2. Anonymize old completed appointments** (>1 year)
```typescript
// Cron job: monthly
async function anonymizeOldAppointments() {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  await supabase
    .from('appointments')
    .update({ patient_name: '[REDACTED]', patient_phone: '[REDACTED]', notes: '[REDACTED]' })
    .eq('status', 'completed')
    .lt('appointment_date', oneYearAgo.toISOString());
}
```

**3. Delete old audit logs** (>1 year)
```typescript
// Cron job: monthly
async function cleanupOldAuditLogs() {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  await supabase
    .from('audit_log')
    .delete()
    .lt('created_at', oneYearAgo.toISOString());
}
```

**Scheduler:** Use cron job, cloud scheduler, or BullMQ repeat jobs

---

## 📊 Retention Policy Summary Table

| Data Type | Retention | Deletion Method | Notes |
|-----------|-----------|-----------------|-------|
| Pending appointments (unpaid) | 7 days | Delete | Auto-cleanup |
| Confirmed appointments (upcoming) | Until date + 30 days | Anonymize or delete | Patient may cancel |
| Completed appointments | 1 year | Anonymize | Retain stats; remove PHI |
| Cancelled appointments | 30 days | Delete | Track patterns |
| Payments (captured) | 7 years | Anonymize patient link | Financial/tax records |
| Payments (pending/failed) | 30 days | Delete | Reconciliation window |
| Conversations (active) | 24 hours | Delete | Short-lived context |
| Conversations (completed) | Linked to appointment | Anonymize with appointment | Context for appointment |
| Audit logs (security) | 1 year | Delete | Compliance |
| Audit logs (access) | 90 days | Delete | Debugging |

---

## 🌍 Jurisdiction-Specific Requirements

### GDPR (EU)
- **Right to erasure:** Must delete on request (within 30 days)
- **Data portability:** Must provide patient data in machine-readable format (JSON)
- **Retention limits:** Delete when no longer needed; justify retention periods

### HIPAA (US)
- **Minimum retention:** 6 years for medical records (some states require longer)
- **Patient access:** Patients can request copy of their data
- **Secure deletion:** Use secure deletion methods (overwrite, not just `DELETE`)

### DPDPA (India)
- **Purpose limitation:** Use data only for stated purpose
- **Retention limits:** Delete when purpose fulfilled
- **Data principal rights:** Right to correction, erasure, portability

**Compliance strategy:** Follow **strictest** rule (GDPR 30-day deletion, HIPAA 6-year retention) — anonymize after 1 year (balance compliance and utility).

---

## 🔗 Related Documentation

- [COMPLIANCE.md](./COMPLIANCE.md) — PHI, consent, audit, global compliance
- [SECURITY.md](./SECURITY.md) — Data protection, encryption
- [DB_SCHEMA.md](./DB_SCHEMA.md) — Database schema and foreign keys
- [PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md) — Minimize collection, anonymize (when created)

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
