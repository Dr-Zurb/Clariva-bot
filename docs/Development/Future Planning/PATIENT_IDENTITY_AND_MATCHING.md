# Patient Identity & Matching

**Status:** Planning  
**Created:** 2026-03-27  
**Related:** Patients tab, appointment booking, deduplication

---

## Problem Statement

- **Phone alone** is not a reliable unique identifier (family members share phones).
- **Email** cannot be mandatory (elderly, children often don't have their own).
- **Strict matching** (phone + name + age + gender) fails on human error (typos, age change).
- **Patient ID** is ideal but people forget or lose it.

We need a practical approach that:
1. Does not rely on patients remembering an ID
2. Handles typos and minor variations
3. Avoids wrong merges (never auto-merge without confirmation)
4. Lets doctors fix duplicates when they recognize them

---

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Suggest, don't auto-merge** | User or doctor confirms before merging. Prevents wrong merges. |
| **Phone mandatory, email optional** | Phone is required for contact. Email optional for receipts. |
| **Fuzzy matching** | Tolerate typos (name), age ±2, phone last-10-digits. |
| **Patient ID as shortcut** | Assign MRN; useful for those who save it, not required. |
| **Doctor can merge** | Dashboard "Possible duplicates" + merge action for manual correction. |

---

## Approach Summary

### 1. Primary Path: Phone Search + Confirm (no ID needed)

- When collecting details for "booking for someone else", before creating a new patient:
  - Search for possible matches by phone (last 10 digits) + fuzzy name.
  - If matches found: bot asks "We found a record for Ramesh Masih. Same person? [Yes] [No]"
  - User confirms. If Yes → use existing patient. If No → create new.

### 2. Patient ID (MRN) — Optional Shortcut

- Each patient gets a human-readable ID (e.g. `P-00001`).
- Shown in confirmation: "Your patient ID: P-00001. Save for future bookings."
- If user provides ID at next booking → exact match, no search needed.
- Not required; phone search remains primary.

### 3. Dashboard: Possible Duplicates + Merge

- Patients tab shows "Possible duplicates" (same phone, similar name).
- Doctor can merge: select patient A + B, merge into one. All appointments move to surviving record.

### 4. Self-Booking

- Already handled: platform identity (Instagram PSID) = one patient per chat user.
- No change needed for self-booking flow.

---

## Matching Logic (Fuzzy)

| Field | Match Rule |
|-------|------------|
| **Phone** | Last 10 digits exact (ignore country code). |
| **Name** | Levenshtein distance or similar; allow minor typos. |
| **Age** | ±2 years tolerance (birthday passed, rounding). |
| **Gender** | Exact (male/female). |

**Confidence:** Combine signals. High confidence = phone + very similar name. Medium = phone + somewhat similar name. Low = phone only. Only suggest when confidence above threshold.

---

## Data Flow

```
Booking for someone else:
  User provides: name, phone, age, gender, reason
       ↓
  findPossiblePatientMatches(phone, name, age?, gender?) 
       ↓
  If matches: [Ask "Same person?"] → User confirms
       ↓
  If Yes: use existing patient_id
  If No: createPatientForBooking() → new patient
       ↓
  Book appointment
```

---

## Task Dependencies

| Task | Depends On |
|------|------------|
| e-task-1: Add patient_id (MRN) column | — |
| e-task-2: Patient matching service | — |
| e-task-3: List patients API | — |
| e-task-4: Patients tab UI | e-task-3 |
| e-task-5: Booking flow — match confirmation | e-task-2 |
| e-task-6: Merge patients (dashboard) | e-task-3, e-task-4 |
| e-task-7: Patient ID in confirmation | e-task-1 |

---

## Reference

- [TASK_TEMPLATE.md](../../task-management/TASK_TEMPLATE.md)
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) — No PHI in logs

---

**Last Updated:** 2026-03-27
