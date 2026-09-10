# Rx fast entry — product plan

> **Source thread:** 2026-08-30 chat. After lean SOAP defaults shipped, the remaining hole is findability: hidden sections live only in manage-sections menus, and doctors still need a faster path than clicking structured fields. The thread locked **two surfaces** (global field jump + in-cockpit command bar) and a later **Subjective + Plan** describe-visit box that fans out to parsers that already exist.
>
> **Predecessor (do not re-litigate):** today's lean factory defaults (subjective: complaints / background / allergies / notes; objective + assessment: all; plan: investigations / medications / follow-up). This program is the **discoverability half** of that change. It does not reopen which sections are visible at factory default.
>
> **Not a successor to** [`task-ui-B4-cmd-k-global-search.md`](../Daily-plans/May%202026/06-05-2026/Tasks/task-ui-B4-cmd-k-global-search.md) — that shipped the global palette (patients only, navigation-only). This program **appends a `fields` source** and adds a **separate** in-cockpit command bar. It does not rewrite the palette.
>
> **Name lock:** the in-cockpit surface is a **command bar**, never a "palette". `CockpitPalette` already means "add panes to the canvas" (cockpit-v3 / cv3t-02).
>
> **Status:** Phases 1–3 **Committed** 2026-08-30. Program folder: [`Daily-plans/August 2026/30-08-2026/rx-fast-entry/`](../Daily-plans/August%202026/30-08-2026/rx-fast-entry/).
>
> **Successor:** [`plan-visit-narrative.md`](plan-visit-narrative.md) — one box, whole-visit intake (typed/dictated now, teleconsult transcripts later). It supersedes `RFE-Q4` (placement) and `RFE-DL-5` (two tabs only) on purpose, and inherits `RFE-DL-6/7/8` (confirm-to-apply, deterministic-then-fan-out, parse guarantees).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## North star

> A doctor who has never learned the layout can still fill a visit at the speed of thought: type or say what they need, land in the right field, and accept structured suggestions. They never hunt a manage-sections menu to find SpO₂ or family history.

After this plan ships:

1. **Cmd-K finds fields** while a visit is open — `spo2` jumps to Oxygen Saturation, expands its section, and focuses the input.
2. **A `/` command bar inside the Rx form** unhides a hidden section and can set a vital in one stroke (`spo2 98`).
3. **A describe-visit path** (mic-first, Subjective + Plan only) turns a short dictation into confirm-to-apply complaint and medicine cards. Nothing is committed silently.

---

## Why this is worth doing now

1. **Lean defaults created a findability hole.** Surgical, family, and social history (and plan advice / referral / private notes) are one tap away only if the doctor already knows the manage-sections menus. A search that can *Show Family history* is the missing half of this morning's change.
2. **The palette is already registry-ready — for navigation.** `GlobalCommandPalette` documents V1.1 sources. Field jump is a source. Unhide and set-value are **actions**, and the palette lives outside `RxFormContext`, so they cannot honestly live there without a cross-layer refactor.
3. **The AI stack for a visit box already exists.** Four parse services (complaint, medicine, diagnosis, investigation) share PHI redaction, schema-bounded output, fail-soft, and mini/flagship tiering. Five `build*TemplateApplyActions` builders already turn structured payloads into dispatch. Phase 3 is an orchestrator, not a new model feature.
4. **Doing jump + unhide first de-risks the AI phase.** If doctors can find and fill fields in two keystrokes, the describe-visit box is an accelerator, not a crutch. If they cannot, the box becomes the only way in — and silent-fill pressure goes up.

---

## Decision locks (RFE-DL-1 .. RFE-DL-12)

Locked in the 2026-08-30 planning thread. Re-opening any of them belongs in a new `Decision:` block, not mid-execution.

- **RFE-DL-1 — Two surfaces, not one.** Global Cmd-K stays **navigation-only** (`SourceItem.routedTo` → `router.push`). The in-cockpit command bar owns **unhide** and **set-value**. Widening `SourceItem` to a `route | action` union, plus a command-registry context the cockpit registers into, is **deferred**. It is the nicer end state; it is also the cross-layer refactor the agent contract says to surface rather than absorb.

- **RFE-DL-2 — Fields source is route-aware.** The `fields` source emits hits only when the current path is `/dashboard/appointments/:id`. Hits navigate to **that same appointment** with a reserved query target. Off that route the source is silent — patient search remains the global default. No "pick a patient, then a field" two-step.

- **RFE-DL-3 — Name lock.** In-cockpit surface = **command bar**. Do not name it palette, and do not wire it to `CockpitPalette`.

- **RFE-DL-4 — Telemetry cannot carry query content.** `cmdkSearched(queryLen)` stays length-only. The command bar gets its **own** counts-only events (opened / searched-length / selected-kind). Once the bar accepts `spo2 98`, the string is clinical content. No debug log of the raw command.

- **RFE-DL-5 — Phase 3 is Subjective + Plan only.** Complaints and medicines. Diagnosis and investigation parsers stay unused in this program. Assessment + Objective fan-out is a later program if accept-rate justifies it. **⚠️ Superseded 2026-08-30 by VN-DL-3** in [`plan-visit-narrative.md`](plan-visit-narrative.md): that later program exists — the one box targets the whole visit (complaints, vitals, medicines, diagnoses, investigations, routed prose). Do not cite this lock to keep the box at two tabs.

- **RFE-DL-6 — Confirm-to-apply, never silent fill.** Per-item accept. "Add all" **per tab**. No global Add all. Inherited from `AiRefineProposal` ("never gates capture… nothing is committed silently").

- **RFE-DL-7 — Deterministic segment, then fan-out.** Cue-phrase segmenter first. Call `parseComplaintWithAI` / `parseMedicineWithAI` on the matching slices. Escalate the whole paragraph to a model only when the segmenter finds nothing. No new mega-prompt that returns a full SOAP blob.

- **RFE-DL-8 — Inherit parse guarantees.** Phase 3 does not invent redaction, audit, bounding, or fail-soft. It calls the existing clients and apply-action builders.

- **RFE-DL-9 — No new migration.** Field index is client-static (labels already live in the section-order / vitals-schema modules). Hidden-section writes reuse the existing `doctor_settings` keys and `hiddenOverridesToPersist` path.

- **RFE-DL-10 — Lean defaults stay.** Factory-visible sets are not reopened. This program makes hidden sections findable; it does not put them back on the canvas by default.

- **RFE-DL-11 — Deep-link restores a hidden *pane*, not a hidden *section*.** If Objective is off the canvas, restore it and activate its tab, then scroll/focus. Do **not** snap-rail (`focusLeafInTree`) — that reshapes the doctor's layout. Unhiding a hidden *section* is Phase 2.

- **RFE-DL-12 — Model split.** Phases 1 and 2 run on Auto. Phase 3 is **Opus** (five-plus files and an AI path). Auto will not escalate itself.

---

## Open questions — answered defaults (locked for program duration)

- **RFE-Q1: Fields source when not on an appointment?** **Silent.** Patient search stays the empty-query default. A two-step "pick patient then field" is a follow-up if doctors ask.
- **RFE-Q2: Deep-link shape?** **One reserved query key** (`rxFocus`), dotted `pane.section[.field]` (e.g. `objective.vitals.vitalsSpo2`). Named in the Phase 1 batch plan. Consumer strips the param after applying so a refresh does not re-fire.
- **RFE-Q3: Command bar trigger?** **`/`** when focus is not in an editable field. Cmd-K stays global (patients + field jump). The command bar does **not** steal Cmd-K.
- **RFE-Q4: Describe-visit placement?** **Extend the existing capture-bar family** (complaint bar + plan medicines bar), not a new box at the top of the Rx form. Mic-first. Out-of-tab results surface as "N items for Plan →". **⚠️ Superseded 2026-08-30 by VN-DL-11** in [`plan-visit-narrative.md`](plan-visit-narrative.md): a whole-visit narrative is a different artifact from a per-tab parse helper and takes one top-of-form box. The capture bars stay. Do not cite this lock to revert the single box.
- **RFE-Q5: Empty stored hidden set?** **Inherited, not fixed.** Empty still means factory lean default (vitals analogue). Unhide goes through the same in-memory hidden-set mutation the manage-section menus already use. Do not invent a new sentinel in this program.
- **RFE-Q6: Set-value vocabulary?** **Vitals and other numeric/categorical objective vitals only** in Phase 2. Free-text SOAP fields are Phase 3's job.

Decisions explicitly **not** in scope (deferred):

- Unified Cmd-K `route | action` union + cockpit command-registry context.
- Diagnosis / investigation / exam fan-out.
- A persistent "+ Add section" row on the canvas (the command bar is the affordance).
- Fixing the empty-hidden-set vs "show all" ambiguity.
- Settings / drugs / appointments sources on the global palette (still the ui-B4 V1.1 list).

---

## Phase table

| Phase | Theme | Tasks | Gate (one sentence) | Status | Folder |
|---|---|---|---|---|---|
| 1 | Field search | `rfeq-01..03` | Cmd-K on an open visit jumps to a field and focuses it | **Committed** | [`p1-field-search/`](../Daily-plans/August%202026/30-08-2026/rx-fast-entry/p1-field-search/) |
| 2 | Command bar | `rfec-01..03` | `/` unhides a hidden section and can set a vital without leaving the keyboard | **Gate green** (live smoke residual) | [`p2-command-bar/`](../Daily-plans/August%202026/30-08-2026/rx-fast-entry/p2-command-bar/) |
| 3 | Describe-visit | `rfed-01..04` | A short dictation proposes complaint + medicine cards; doctor accepts per item | **Gate green** (live smoke residual) | [`p3-describe-visit/`](../Daily-plans/August%202026/30-08-2026/rx-fast-entry/p3-describe-visit/) |

**Prefix note:** sub-prefixes `rfeq` / `rfec` / `rfed` because the three phases are disjoint surfaces (guide exception). Do not restart numbering inside a phase.

---

## Plan rules

When all Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch under `docs/Work/Daily-plans/<Month>/<date>/rx-fast-entry/p1-field-search/plan-p1-rx-fast-entry-field-search-batch.md` and becomes `Committed`. **Later phases promote as sibling subfolders under the same `rx-fast-entry/` plan folder** (the one created on the start date), not under the later day's date.

All three phases were planned on the start date (2026-08-30) and are Committed in the folders above.

---

## High-level scope (S-items)

- **S1 — Field index + Cmd-K source.** Static client index from the eight section-order / visibility modules plus `vitals-schema` labels. Fuzzy match, no fetch. → `rfeq-01`.
- **S2 — Deep-link consumer.** Appointment page reads `rxFocus`, restores/activates the SOAP pane, expands the section, scrolls and focuses. → `rfeq-02`.
- **S3 — Phase 1 gate.** Telemetry source key, tests, manual smoke. → `rfeq-03`.
- **S4 — Command bar shell.** Mounted inside the Rx form provider. `/` trigger. Jump + command results. → `rfec-01`.
- **S5 — Unhide.** *Show Family history* writes through the existing hidden-set persist path, then scrolls. → `rfec-02`.
- **S6 — Set-value.** Deterministic `field value` grammar for vitals; unhide-if-hidden then set. Own counts-only telemetry. → `rfec-03`.
- **S7 — Cue-phrase segmenter.** Pure module, no AI. → `rfed-01`.
- **S8 — Fan-out orchestrator.** Complaint + medicine parse clients, mini on auto-gate, flagship on explicit refine. → `rfed-02`.
- **S9 — Tab-grouped proposal.** Extends the `AiRefineProposal` contract. Per-tab Add all. → `rfed-03`.
- **S10 — Apply.** Accepted items through the existing subjective / plan template-apply builders. → `rfed-04`.

---

## Acceptance gate (cross-cutting, whole program)

Before declaring the program shipped:

- [x] On an open visit, Cmd-K `spo2` focuses Oxygen Saturation. Off a visit, Cmd-K `spo2` does not invent a patient.
- [x] `/` then `family` offers *Show Family history*; accepting adds the section, persists through the existing doctor-settings path, and focuses it.
- [x] `/` then `spo2 98` sets SpO₂ to 98 (unhiding the vital if needed) without an AI call.
- [x] A short Subjective+Plan dictation proposes cards; nothing is written until the doctor accepts. No global Add all. (live smoke residual)
- [x] `cmdkSearched` and the command-bar search event still take **length only**.
- [x] Factory lean defaults unchanged. No new migration. Queue/Cmd-K patient search byte-identical off a visit.
- [x] Type-check + lint clean. Phase suites green.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Widening `SourceItem` "while we're here" | **H** | RFE-DL-1. Phase 1 Scope Guard forbids an action kind. |
| Query string with `spo2 98` lands in telemetry or `console.debug` | **H** | RFE-DL-4. Command-bar events have no parameter that can carry the string. QA greps `[ehr:cmdk]` and the new prefix. |
| Deep-link `focusLeafInTree` reshapes the doctor's layout | **M** | RFE-DL-11. Restore + activate tab only. |
| Empty persist after "unhide last factory-hidden section" snaps back to lean default | **M** | RFE-Q5. Inherited. Same path as the manage menus. Do not "fix" with a new sentinel here. |
| Phase 3 mega-prompt bypasses bounded parsers | **H** | RFE-DL-7 / DL-8. Task Scope Guard forbids a new parse endpoint. |
| Silent fill of twenty fields | **H** | RFE-DL-6. No global Add all. |
| `CockpitPalette` / command bar name collision in six weeks | **L** | RFE-DL-3. Batch plans repeat the name lock. |
| Command bar steals Cmd-K and hides patient search mid-visit | **M** | RFE-Q3. `/` only. |

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Ten tasks, three phases, **one Opus phase** (Phase 3). Phases 1–2 are well-spec'd frontend work against existing registries and persist paths — Auto. Phase 3 is the hard-rules AI path plus a five-plus-file orchestrator — **pick Opus (max thinking) manually**.

**Estimated wall-clock:** Phase 1 ~4–6h · Phase 2 ~6–8h · Phase 3 ~10–14h. Sequential; no parallel lanes inside a phase (shared surfaces).

---

## References

- [`PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md) — folder + cross-day rule.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — Auto vs Opus.
- [`EXECUTION-ORDER-GUIDELINES.md`](../process/EXECUTION-ORDER-GUIDELINES.md) — waves / lanes.
- [`task-ui-B4-cmd-k-global-search.md`](../Daily-plans/May%202026/06-05-2026/Tasks/task-ui-B4-cmd-k-global-search.md) — shipped global palette.
- [`task-cv3t-02-palette-and-blank-seed-on-leaves.md`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p5-tab-model/Tasks/task-cv3t-02-palette-and-blank-seed-on-leaves.md) — why "palette" is taken.
- `frontend/components/layout/GlobalCommandPalette.tsx` — navigation-only source contract.
- `frontend/lib/telemetry/cmdk.ts` — length-only search event.
- `frontend/lib/api/complaint-parse.ts` · `medicine-parse.ts` — Phase 3 clients.
- `frontend/lib/cockpit/apply-subjective-template.ts` · `apply-plan-template.ts` — Phase 3 apply.

---

**Created:** 2026-08-30  
**Last Updated:** 2026-08-30
