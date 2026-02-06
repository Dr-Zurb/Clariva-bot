# Privacy by Design Guide

**Purpose:** Build privacy into every feature from the start. Minimize data collection, anonymize where possible, and respect patient rights.

**Audience:** AI agents and developers implementing features.

**Related:** [COMPLIANCE.md](./COMPLIANCE.md) | [SECURITY.md](./SECURITY.md) | [DATA_RETENTION.md](./DATA_RETENTION.md)

---

## 🔐 Core Principles

### 1. Data Minimization

**MUST:** Collect only data necessary for the service

**DO:**
- Collect patient name, phone for appointment booking
- Collect reason for visit (brief description)
- Collect preferred date/time

**DO NOT:**
- Collect full medical history unless absolutely required
- Collect sensitive attributes (religion, race, sexual orientation) unless medically relevant
- Collect unnecessary contact details (address if not needed for service)

**Example:**
```typescript
// ✅ GOOD - Minimal patient data
interface PatientInfo {
  name: string;
  phone: string;
  reasonForVisit: string;
}

// ❌ BAD - Excessive data collection
interface PatientInfo {
  name: string;
  phone: string;
  email: string; // Not needed for Instagram-based booking
  address: string; // Not needed
  age: number; // Not needed
  medicalHistory: string; // Too sensitive
}
```

---

### 2. Purpose Limitation

**MUST:** Use data only for stated purpose; obtain consent for new uses

**Stated purpose:** Appointment booking, payment processing, appointment reminders

**DO:**
- Use patient phone for booking confirmation
- Use patient name in appointment record
- Use reason for visit in doctor's appointment notes

**DO NOT:**
- Use patient phone for marketing (unless explicit consent)
- Share patient data with third parties (except payment gateways for payment processing; disclose in privacy policy)
- Use data for analytics beyond aggregate counts (anonymize first)

---

### 3. Anonymization

**MUST:** Anonymize data when PHI is not needed

**When to anonymize:**
- Aggregate analytics (appointment count, revenue)
- Retention past compliance period (replace PHI with `[REDACTED]`)
- Debugging/testing (use fake placeholders: `PATIENT_TEST`, `+10000000000`)

**Example:**
```typescript
// ✅ GOOD - Anonymized analytics
const stats = await supabase
  .from('appointments')
  .select('status, count(*)', { count: 'exact' })
  .eq('doctor_id', doctorId);
// Returns { status: 'confirmed', count: 42 } — no PHI

// ❌ BAD - PHI in analytics
const stats = await supabase
  .from('appointments')
  .select('patient_name, patient_phone, status')
  .eq('doctor_id', doctorId);
// Returns PHI unnecessarily
```

---

### 4. Access Control

**MUST:** Enforce least privilege (users access only their own data)

**Methods:**
- RLS policies (doctors see only their appointments)
- Manual ownership checks (when using service role)
- JWT authentication (for API endpoints)

**See:** [RLS_POLICIES.md](./RLS_POLICIES.md) | [SECURITY.md](./SECURITY.md)

---

### 5. Transparency

**MUST:** Be transparent about data collection and use

**How:**
- Privacy policy (disclose what data is collected, why, how long retained, who has access)
- Consent flow (patient consents before data collection)
- Data access requests (patient can request copy of their data)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) for consent requirements

---

## 🛡️ Privacy Checklist (Per Feature)

Use this when implementing any feature that handles patient data:

- [ ] **Minimize:** Collect only data necessary for the feature
- [ ] **Purpose:** Use data only for stated purpose; obtain consent for new uses
- [ ] **Anonymize:** Anonymize or pseudonymize when PHI is not needed (analytics, debugging)
- [ ] **Access control:** Enforce RLS or manual ownership checks
- [ ] **Logs:** No PHI in logs (redact patient names, phones, DOBs)
- [ ] **Retention:** Delete or anonymize data when no longer needed (see [DATA_RETENTION.md](./DATA_RETENTION.md))
- [ ] **Encryption:** Encrypt PHI at rest (Supabase handles this) and in transit (HTTPS)
- [ ] **Consent:** Track patient consent for data collection and use
- [ ] **Transparency:** Document in privacy policy what data is collected and why

---

## 📝 Privacy Patterns

### Pattern 1: Pseudonymization

**Use when:** Need to link records without exposing PHI

**Example:** Use patient ID (UUID) instead of phone number in appointment record

```typescript
// ✅ GOOD - Use patient ID (UUID) for linking
interface Appointment {
  id: string;
  patient_id: string; // UUID, not phone
  doctor_id: string;
  appointment_date: string;
  status: string;
}

// Separate patient table with RLS
interface Patient {
  id: string; // UUID
  name: string;
  phone: string;
  // PHI protected by RLS
}
```

### Pattern 2: Aggregate-Only Analytics

**Use when:** Need stats without individual records

```typescript
// ✅ GOOD - Aggregate only (no PHI)
const stats = await supabase
  .from('appointments')
  .select('status, count(*)')
  .eq('doctor_id', doctorId)
  .group('status');
// Returns: [{ status: 'confirmed', count: 42 }, { status: 'cancelled', count: 5 }]

// ❌ BAD - Individual records with PHI
const appointments = await supabase
  .from('appointments')
  .select('patient_name, status')
  .eq('doctor_id', doctorId);
```

### Pattern 3: Redaction in Logs

**Use when:** Logging events that might reference patients

```typescript
// ✅ GOOD - Log metadata only (no PHI)
logger.info({
  appointmentId: 'apt-123',
  status: 'confirmed',
  doctorId,
  correlationId,
}, 'Appointment confirmed');

// ❌ BAD - Log PHI
logger.info({
  patientName: 'John Doe', // PHI
  patientPhone: '+1234567890', // PHI
  status: 'confirmed',
}, 'Appointment confirmed');
```

### Pattern 4: Data Export (Right to Portability)

**Use when:** Patient requests their data (GDPR, DPDPA)

```typescript
// ✅ GOOD - Export only patient's own data (verify ownership)
export async function exportPatientData(phone: string, doctorId: string) {
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('patient_phone', phone)
    .eq('doctor_id', doctorId);

  return {
    phone,
    appointments: appointments.map(apt => ({
      date: apt.appointment_date,
      status: apt.status,
      notes: apt.notes,
    })),
  };
}
```

---

## 🌍 Global Privacy Compliance

### GDPR (EU)

- **Principle:** Data minimization, purpose limitation, right to erasure, right to portability
- **Implementation:** Collect minimal data; delete on request; provide data export

### HIPAA (US)

- **Principle:** Minimum necessary; access control; audit logs
- **Implementation:** RLS for access control; audit log for PHI access; no PHI in non-essential logs

### DPDPA (India)

- **Principle:** Purpose limitation; data minimization; consent
- **Implementation:** Clear consent flow; use data only for booking; delete when no longer needed

**Strategy:** Follow **strictest** rule (GDPR + HIPAA + DPDPA) to ensure global compliance.

---

## 🔗 Related Documentation

- [COMPLIANCE.md](./COMPLIANCE.md) — PHI, consent, audit, global compliance
- [DATA_RETENTION.md](./DATA_RETENTION.md) — Retention periods, deletion
- [SECURITY.md](./SECURITY.md) — Data protection, encryption
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Logging (no PHI)

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
