# Consultation Verification Strategy — Full Reference

**Purpose:** Definitive reference for video consultation payout eligibility rules.

---

## 1. Scope

| In Scope | Out of Scope |
|----------|---------------|
| Video consultations only | In-clinic appointments |

---

## 2. Core Principle

- **Doctor** is the exploitation risk (patient has already paid).
- **Patient** is not a risk for payout abuse.
- Doctor gets paid when they did their role; patient no-show or early leave does not block payout.

---

## 3. Verification Rules

| Rule | Description |
|------|-------------|
| **Doctor joined** | `doctor_joined_at` must be set |
| **Room ended** | `consultation_ended_at` must be set |
| **Patient no-show** | If `patient_joined_at` is null → pay doctor ✅ |
| **Patient left first** | If patient disconnected before doctor → pay doctor ✅ |
| **Doctor left first** | If doctor disconnected first → pay only if overlap ≥ 60 seconds |

---

## 4. Scenario Matrix

| # | Doctor | Patient | Doctor Left | Patient Left | Result |
|---|--------|---------|-------------|--------------|--------|
| 1 | Joins, stays | Joins, stays | After patient | After doctor | ✅ Pay |
| 2 | Joins, waits | Never joins | — | — | ✅ Pay (no-show) |
| 3 | Joins, stays | Joins, leaves 30s | After patient | T+30s | ✅ Pay |
| 4 | Joins, leaves 20s | Joins | T+20s | After | ❌ Reject |
| 5 | Joins, stays 2min | Joins, leaves 45s | After patient | T+45s | ✅ Pay |
| 6 | Joins, stays 2min | Joins, stays | T+2min | T+2min | ✅ Pay |
| 7 | Joins, leaves 1min | Joins | T+60s | After | ✅ Pay |
| 8 | Joins, leaves 45s | Joins | T+45s | After | ❌ Reject |
| 9 | Joins, waits 10min | Never joins | T+10min | — | ✅ Pay (no-show) |
| 10 | Never joins | Joins | — | — | ❌ Reject |

---

## 5. Verification Logic (Pseudocode)

```
isEligibleForPayout():
  IF NOT doctor_joined_at OR NOT consultation_ended_at → false

  IF NOT patient_joined_at → true  (no-show)

  overlap_start = max(doctor_joined_at, patient_joined_at)

  IF patient left first (patient_left_at < doctor_left_at) → true

  IF doctor left first:
    overlap_sec = doctor_left_at - overlap_start
    RETURN overlap_sec >= 60

  FALLBACK: consultation_duration_seconds >= 60 → true
  RETURN false
```

---

## 6. Data Model

**New columns:** `doctor_left_at`, `patient_left_at` (TIMESTAMPTZ)

**Twilio event:** `participant-disconnected` with `ParticipantIdentity`, `Timestamp`

---

## 7. Config

`MIN_VERIFIED_CONSULTATION_SECONDS` = 60

---

**Last Updated:** 2026-03-23
