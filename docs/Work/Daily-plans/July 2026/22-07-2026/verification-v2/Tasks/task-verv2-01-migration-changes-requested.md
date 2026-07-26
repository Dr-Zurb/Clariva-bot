# VERV2-01 — Migration: add `changes_requested` status

> **Weight: Opus** (schema change on `doctor_verification`, the go-live-gating table). **Status: ✅ DONE** (apply SQL in Supabase before dogfood)
> Read [`../plan-verification-v2-batch.md`](../plan-verification-v2-batch.md) → decision locks **VERV2-D1, D2**.

## Goal

Widen the `doctor_verification.status` CHECK constraint to include a new non-terminal state `changes_requested`. **No new column** — `reject_reason` is reused as the reviewer note (VERV2-D2).

## Do

- New file `backend/migrations/185_doctor_verification_changes_requested.sql`:
  - Drop + re-add the status CHECK constraint to the widened set:
    `('unverified','pending_review','verified','rejected','changes_requested')`.
    Use the actual constraint name (inspect `183` / the DB — an inline `CHECK` gets an auto-generated name like `doctor_verification_status_check`; target it with `ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name>` then `ADD CONSTRAINT <name> CHECK (...)`).
  - Update the table `COMMENT` / header lifecycle note to document the new branch:
    `pending_review → changes_requested → (resubmit) → pending_review`.
  - **Idempotent** (`DROP CONSTRAINT IF EXISTS` before `ADD`); safe to re-run.
  - Document the **reverse migration** at the file foot (re-add the narrow constraint — only safe if no rows are `changes_requested`).
- Follow the house migration style in `183_doctor_verification.sql` (header block, safety notes, reverse-migration footer).

## Tests

- `backend/tests/unit/migrations/185-doctor-verification-changes-requested-migration.test.ts`, mirroring `183-doctor-verification-migration.test.ts`:
  - asserts the file exists, drops + re-adds the constraint, the widened set contains `changes_requested`, and that it's idempotent / has a reverse-migration note.

## Scope guard

- **Only** the CHECK constraint + comment. Do NOT add columns, indexes, RLS policies, or touch the storage bucket.

## Done when

- Migration applies cleanly on a DB already at `183`/`184`, is idempotent, and the migration unit test passes. (App code that writes the new value lands in VERV2-02+.)
