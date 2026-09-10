# Task lang-02: Migration 190 — `conversations.language`

> **Links:** batch [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md) · exec [`./EXECUTION-ORDER-p1-language-resolver.md`](./EXECUTION-ORDER-p1-language-resolver.md)

---

## 📋 Task Overview

Add a nullable `language` column to `conversations` so a thread remembers what language it is being conducted in. `NULL` means "not yet decided" and resolves to English on the next turn (LANG1-D6) — no backfill.

**Program / Phase:** bot-language-policy · p1 · Wave 2
**Estimated Time:** ~1–2 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Migration (additive, nullable, no RLS change)
**Model:** **Opus** (agent-contract: new migration) — executed on founder request
**Depends on:** nothing (can run parallel to `lang-01`)

---

## ✅ Task Breakdown

### 1. Migration
- [x] 1.1 Create `backend/migrations/190_conversation_language.sql`. Confirm 190 is free first.
- [x] 1.2 `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS language TEXT;`
- [x] 1.3 `CHECK` constraint on the LANG-D7 set: `language IS NULL OR language IN ('en','hi','hi-Latn','pa','pa-Latn','other')`.
  - Add via `ALTER TABLE … ADD CONSTRAINT … ` guarded so re-running is safe (match the idempotent style of `187_doctor_facebook.sql`).
- [x] 1.4 `COMMENT ON COLUMN conversations.language IS 'Resolved reply language for this thread (lang-02). NULL = undecided → English. Locale code, not PHI.'`
- [x] 1.5 **No** `NOT NULL`, **no** `DEFAULT`. `NULL` is a meaningful state and a default would hide whether resolution ever ran.
- [x] 1.6 **No index.** Not queried by language in v1; add later if analytics needs it.
- [x] 1.7 **No RLS change.** Existing `conversations` policies from `001`/`002` already cover the row; a new non-PHI column inherits them.
- [x] 1.8 Header comment block matching the house style (purpose, why, what it mirrors) — see `187_doctor_facebook.sql:1-15`.

### 2. Types
- [x] 2.1 Add `language: ConversationLanguage | null` to the `Conversation` row type in `backend/src/types/database.ts`.
- [x] 2.2 Add to the insert/update types if they are declared separately in that file.
  - `InsertConversation` makes `language` optional so existing creates need not pass it.
  - `UpdateConversation` inherits via `Partial<…>`.
- [x] 2.3 Import the union from `utils/conversation-language.ts` (`lang-01`) rather than redeclaring the string literals.

### 3. Tests
- [x] 3.1 Migration shape test mirroring `backend/tests/unit/migrations/187-doctor-facebook-migration.test.ts`: column added, nullable, CHECK present, comment present, no RLS statements, idempotent (`IF NOT EXISTS`).
- [x] 3.2 Assert the CHECK list matches the LANG-D7 set exactly — a drifting enum between SQL and TS is the classic failure here.

---

## 📁 Files

```
CREATE: backend/migrations/190_conversation_language.sql
CREATE: backend/tests/unit/migrations/190-conversation-language-migration.test.ts
UPDATE: backend/src/types/database.ts
DO NOT TOUCH: any RLS policy
DO NOT TOUCH: conversations.metadata (LANG-D5 — dedicated column, not JSONB)
DO NOT TOUCH: service or worker code (that is lang-03)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Additive and nullable only. No `NOT NULL`, no `DEFAULT`, no backfill `UPDATE`.
- No RLS / `auth.uid()` changes. If you believe one is needed, **STOP and surface it** — that is an escalation per the agent contract.
- Do not add `preferred_language` to `patients` or `doctors`. Per-doctor default is LANG-D8, out of scope.
- Do not write any code that reads the column yet.

---

## ✅ Acceptance Criteria

- [x] Migration runs clean on a fresh DB and is safe to re-run.
- [x] CHECK constraint rejects an unknown code (e.g. `'fr'`).
- [x] `NULL` insert succeeds (undecided is legal).
- [x] TS `Conversation` type includes `language`; backend typecheck green.
- [x] No RLS diff.

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
