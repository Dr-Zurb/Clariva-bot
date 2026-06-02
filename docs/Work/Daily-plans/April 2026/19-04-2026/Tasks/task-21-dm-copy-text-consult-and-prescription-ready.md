# Task 21: DM copy builders — `buildConsultationReadyDm` text variant + `buildPrescriptionReadyDm`

## 19 April 2026 — Plan [Text consultation modality](../Plans/plan-04-text-consultation-supabase.md) — Phase C

---

## Task overview

Plan 01 Task 16 already shipped `buildConsultationReadyDm` with the **video** branch live and the **text + voice** branches explicitly throwing (`backend/src/utils/dm-copy.ts:639-676`). The throw was deliberate: until Plan 04 ships the text adapter and Plan 05 ships the voice adapter, no caller should be able to invoke this helper with `modality: 'text' | 'voice'`. Task 21 lights up the **text** branch.

Task 16 also shipped `buildPrescriptionReadyPingDm` — the **urgent fan-out ping** with an optional view URL. That helper is for the non-blocking "your prescription is ready" SMS / IG-DM tap-to-open notification. This task ships a **separate** `buildPrescriptionReadyDm` builder with **richer copy** for the **inline-in-chat** delivery path: when a text consult ends, the prescription is posted as a `consultation_messages` row inside the chat itself (Plan 04 lifecycle wiring step 5). That message body is what `buildPrescriptionReadyDm` produces — full doctor name, prescription ID, PDF link, brief next-step instructions.

Two builders, two surfaces:

| Builder | Surface | Brevity | Source |
|---|---|---|---|
| `buildPrescriptionReadyPingDm` (Task 16, exists) | Urgent IG/SMS/email ping outside the chat | Short — fits an SMS | `buildPrescriptionReadyPingDm` already in `dm-copy.ts` |
| `buildPrescriptionReadyDm` (this task, new) | Inline message inside `<TextConsultRoom>` | Rich — multi-line, with instructions | New |

Both can fire on the same prescription event; they're complementary, not redundant.

This is the smallest task in Plan 04 but it's a copy-quality task — get the wording wrong and 100% of text consults send awkward messages. Snapshot tests pin the strings.

**Estimated time:** ~1 hour

**Status:** Implementation complete (2026-04-19); pending PR.

**Depends on:** Nothing hard. Tasks 18 + 19 will call these builders, so this task can ship in parallel with Task 17 (migration) and ahead of Tasks 18 + 19.

**Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md)

---

## Acceptance criteria

- [x] **`buildConsultationReadyDm` text branch lit up** in `backend/src/utils/dm-copy.ts:639-695` (helper now spans video + text branches; voice still throws). Body mirrors the video branch's three-paragraph structure exactly:
  ```
  Your text consult with **{practice}** is starting.

  Open the chat:
  {url}

  Reply in this thread if anything looks wrong.
  ```
  Wording deliberately diverges from the video branch only at:
  - `"video consult"` → `"text consult"`
  - `"Join here:"` → `"Open the chat:"` (text consult IS the chat — "join" implies leaving somewhere, which it isn't)
  - The `practiceName` fallback (`'your doctor'`) and `joinUrl`-empty throw are reused unchanged from the existing video branch.
  - **Helper signature unchanged.** `ConsultationReadyDmInput` was not modified; the only diff is the body of `case 'text'` and the JSDoc that previously said "text + voice ship in Plans 04/05" now says "voice ships in Plan 05".
  - **Scope adjustment vs original task spec:** the task originally proposed a third paragraph `"This link is active for {expiresInMinutes} minutes."` That would have required adding a new `expiresInMinutes` field to `ConsultationReadyDmInput`, which would force a breaking change at the only existing caller (`notification-service.ts:1213`, which passes `{ modality, practiceName, joinUrl }` — no expiry math is computed there). The video branch shipped without an expiry line either, so dropping the line keeps the two branches symmetric and avoids a churn-ful schema change. Captured under **Notes** below.
- [x] **`buildPrescriptionReadyDm` + `PrescriptionReadyDmInput` exported** from `backend/src/utils/dm-copy.ts:737-825`. Final signature:
  ```ts
  export interface PrescriptionReadyDmInput {
    readonly doctorName?:    string; // empty/undefined → 'your doctor'
    readonly prescriptionId: string; // required, throws if empty
    readonly pdfUrl:         string; // required, throws if empty
  }
  export function buildPrescriptionReadyDm(input: PrescriptionReadyDmInput): string;
  ```
  Rendered body:
  ```
  Prescription from **{doctor}**

  Your prescription is ready. View or download the PDF here:
  {pdfUrl}

  Reference ID: {prescriptionId}

  Next steps:
  • Save the PDF for your pharmacy.
  • Reply here in the chat if you have any questions about your prescription.
  ```
  - Empty `pdfUrl` throws `buildPrescriptionReadyDm: pdfUrl is required …` with the upstream-wiring breadcrumb.
  - Empty `prescriptionId` throws with the parallel message.
  - `doctorName` empty/undefined falls back to `'your doctor'`.
  - **Scope adjustment vs original task spec:** dropped the optional `practiceName` field — `doctorName` is sufficient for the in-chat surface where the doctor's name is the only relevant signal, and the second field would have created an unclear precedence rule (`practiceName` vs `doctorName` — which wins?). Additive — Plan 06 or beyond can add `practiceName` if it ever becomes useful.
- [x] **Snapshot tests** in `backend/tests/unit/utils/dm-copy-text-modality.test.ts` (NEW, 13 tests):
  - `buildConsultationReadyDm` text variant — happy-path snapshot with practice name set.
  - `buildConsultationReadyDm` text variant — practice-name-fallback snapshot (whitespace-only).
  - `buildConsultationReadyDm` text variant — practice-name-fallback snapshot (undefined).
  - `buildConsultationReadyDm` text variant — empty `joinUrl` throws (parity with video branch).
  - `buildConsultationReadyDm` text variant — load-bearing `"Open the chat:"` (and NOT `"Join here:"`) assertion.
  - `buildPrescriptionReadyDm` happy-path snapshot.
  - `buildPrescriptionReadyDm` doctor-name-fallback (whitespace) snapshot.
  - `buildPrescriptionReadyDm` doctor-name-fallback (undefined) snapshot.
  - `buildPrescriptionReadyDm` empty `pdfUrl` throws.
  - `buildPrescriptionReadyDm` undefined-`pdfUrl` (cast through type system) throws — defensive guard against upstream wiring bugs that route around TS.
  - `buildPrescriptionReadyDm` empty `prescriptionId` throws.
  - `buildPrescriptionReadyDm` reference-ID verbatim assertion (no truncation / masking — patients use it for support).
  - The "voice still throws" assertion stays in the existing `dm-copy-consultation-ready.test.ts` (Task 16 contract test) where it was already proven; the head comment of that file was updated to call out that the test now also serves as the Task 21 voice-still-throws guarantee.
- [x] **No caller wiring in this task.** Task 18 (text adapter) will call `buildConsultationReadyDm` via the existing Task 16 `sendConsultationReadyToPatient` fan-out helper — already modality-aware, no edits needed there. Plan 04's chat-end flow (Task 18 or follow-up) is the first caller of `buildPrescriptionReadyDm`.
- [x] **Type-check + lint clean** on touched files. Verified:
  - `npx jest tests/unit/utils/ tests/unit/services/notification-service-fanout.test.ts` → **29 suites, 477 tests, 61 snapshots, all passing.**
  - `npx tsc --noEmit` → clean.
  - `npx eslint src/utils/dm-copy.ts` → clean.
  - The existing `dm-copy.snap.test.ts` and `dm-copy-consultation-ready.test.ts` regression suites pass — video branch byte-identical to its previous behavior, voice branch still throws with the exact original Plan-05 breadcrumb message.

---

## Out of scope

- The fan-out helper that calls `buildConsultationReadyDm`. Task 16 already shipped `sendConsultationReadyToPatient`; this task just makes its `modality: 'text'` call path work end-to-end instead of throwing.
- The voice branch of `buildConsultationReadyDm`. Plan 05 owns it. Document explicitly in the throw message that Plan 05 is where it ships (the existing throw already does this — keep that wording).
- Wiring `buildPrescriptionReadyDm` into Plan 04's chat-end flow. That's Task 18's adapter or a small follow-up — this task only ships the builder.
- Internationalization. v1 is English-only. Translation surface is a Plan 10+ concern.
- Rich-text formatting (markdown, links rendered as clickable). The chat surface (Task 19) decides whether to render the body verbatim or apply linkification client-side. Builder output is plain text.
- Variants per consult outcome (e.g. "your prescription was changed since last visit"). Single happy-path copy in v1.
- Branding tokens / dynamic logo. Plain-text DMs only.

---

## Files expected to touch

**Backend:**

- `backend/src/utils/dm-copy.ts` — light up the `case 'text'` branch in `buildConsultationReadyDm`; add `buildPrescriptionReadyDm` + `PrescriptionReadyDmInput` type

**Tests:**

- `backend/tests/unit/utils/dm-copy-text-modality.test.ts` — new

**No source code beyond `dm-copy.ts`. No frontend touched.**

---

## Notes / open decisions

1. **Why a separate `buildPrescriptionReadyDm` instead of extending `buildPrescriptionReadyPingDm`?** Audience and surface differ. The ping is a notification (short, glanceable, must fit SMS). The in-chat delivery is a message inside an established conversation (longer is fine, can include reference ID and instructions). Conflating them would force one of the two surfaces into a sub-optimal shape. Two builders, one source-of-truth file.
2. **Reference ID inclusion** is intentional — patients quoting `prescriptionId` in support queries lets the support team route fast. The pattern matches what e-commerce order-confirmation emails do.
3. **"Reply here in the chat"** language assumes Decision 5 LOCKED (live-only sync) — the patient can't reply once the session ends. **This is a known UX wart.** Plan 07 ships the post-consult read-only chat; the prescription message will land *just before* the session ends. If there's a race where the patient replies after end, the RLS INSERT policy rejects the message and the client must show "this consult has ended". Acceptable v1 trade-off; document in the chat UI (Task 19).
4. **`expiresInMinutes` line dropped** (was in the original task spec). Adding it would have required a new `expiresInMinutes` field on `ConsultationReadyDmInput`, forcing a breaking change at the only existing caller (`notification-service.ts:1213-1217`, which passes `{ modality, practiceName, joinUrl }`). The video branch shipped without an expiry line either, so dropping the line keeps the two branches symmetric and avoids unnecessary churn. **Follow-up:** if patient analytics later show high "link expired" complaint rates, revisit by computing the expiry from the join token's TTL inside `sendConsultationReadyToPatient` and threading it through both branches together (so video and text get the line at the same time, not just text).
5. **Snapshot test fixtures** pin specific strings (`'Acme Clinic'`, `'Dr. Sharma'`, `'rx_2026_0419_abc123'`) so the snapshots are stable and human-reviewable. No `Date.now()`-derived values appear in any of the snapshotted bodies.
6. **The voice branch continues to throw with the EXACT original message** — the existing throw at `dm-copy.ts:684-687` references "Plan 05" and that breadcrumb is preserved verbatim. Verified by the existing `dm-copy-consultation-ready.test.ts` regression test, which was kept (head comment updated to call out that it now doubles as Task 21's voice-still-throws guarantee).
7. **Bullet character is `•` (U+2022).** Renders fine in IG DM, SMS (UTF-8 encoded), and email. If a future delivery channel mangles UTF-8 bullets, the chat-side delivery (Task 19's `<TextConsultRoom>`) is unaffected because Supabase Realtime stores/transports the body verbatim. Cross-channel rendering for `buildPrescriptionReadyDm` is non-applicable in v1 — this builder is **only** used for the in-chat post; the urgent ping uses `buildPrescriptionReadyPingDm` which is plain ASCII.

---

## References

- **Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md) — DM copy section.
- **Existing builder (text branch throws today):** `backend/src/utils/dm-copy.ts:639-676` — `buildConsultationReadyDm`
- **Existing complementary builder (urgent ping):** `backend/src/utils/dm-copy.ts` — `buildPrescriptionReadyPingDm` (added in Task 16)
- **Existing snapshot test patterns:** `backend/tests/unit/utils/dm-copy.snap.test.ts`, `backend/tests/unit/utils/dm-copy-consultation-ready.test.ts`
- **Plan 01 Task 16 — fan-out helper that calls `buildConsultationReadyDm`:** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Implementation complete (2026-04-19); pending PR.
