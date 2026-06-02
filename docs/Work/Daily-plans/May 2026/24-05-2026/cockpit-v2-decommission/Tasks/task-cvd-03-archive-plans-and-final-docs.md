# cvd-03 · Archive plans + final docs

> **Wave 2 β** of [cockpit-v2-decommission](../plan-cockpit-v2-decommission-batch.md). Documentation close-out for the whole cockpit-v2 program.

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 2 | **Depends on** | cvd-02 | **Blocks** | — (program close-out) |

---

## What to do

### 1. Create archive folder if it doesn't exist

```powershell
# Check first:
# ls docs/Work/Product\ plans/archive 2>$null
# If missing:
# mkdir docs/Work/Product\ plans/archive
```

### 2. Move + banner `plan-cockpit-v2.md`

```powershell
# git mv "docs/Work/Product plans/plan-cockpit-v2.md" "docs/Work/Product plans/archive/plan-cockpit-v2.md"
```

Prepend the DL-4 banner at the top of the moved file (preserve all existing content below):

```markdown
> **🗄️ ARCHIVED — Cockpit v2 program completed 2026-06-{day} via [cockpit-v2-decommission](../../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) batch.**
>
> This plan and its roadmap are kept for historical reference. They are no
> longer the source of truth.
>
> Current cockpit work tracked in:
> - **Daily plans** under [`docs/Work/Daily-plans/`](../../Daily-plans/) — search for "cockpit-".
> - **Future cockpit product plan(s)** — TBD when the next major cockpit
>   refactor is scoped.
>
> See [`docs/Reference/product/cockpit/COCKPIT.md`](../../../Reference/product/cockpit/COCKPIT.md) for the
> **current** cockpit reference (DL-5 of the decommission batch promoted
> this to the live single source of truth).

---

(original content of plan-cockpit-v2.md follows)
```

### 3. Move + banner `plan-cockpit-v2-execution-roadmap.md`

Same treatment:

```powershell
# git mv "docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md" "docs/Work/Product plans/archive/plan-cockpit-v2-execution-roadmap.md"
```

Prepend a similar banner. Final state of the roadmap before move should already show every R-item / batch as `✅ DONE` (clpm-06 + the preceding 5 close-outs all updated this).

Add ONE LAST changelog entry on the roadmap right above the banner:

```markdown
### 2026-06-{day} — Cockpit v2 program completed, plans archived

- All Phase 2 + Phase 3 R-items shipped.
- Kill-switch + `legacyBuiltInPanes` removed (cvd-02).
- This plan + the source `plan-cockpit-v2.md` archived to `Product plans/archive/`.
- `docs/Reference/product/cockpit/COCKPIT.md` is now the live single source of truth.
- `cockpit_v2.program_completed` telemetry event fires per-session for new-load doctors.
- Soak: 4 weeks. Kill-switch escape rate: {X.YY}% (recorded in cvd-01).
```

### 4. Promote `docs/Reference/product/cockpit/COCKPIT.md`

Add at the top of the file, after any existing intro:

```markdown
> **Single source of truth for cockpit state.** As of 2026-06-{day}, the
> `plan-cockpit-v2.md` + `plan-cockpit-v2-execution-roadmap.md` are
> archived to `docs/Work/Product plans/archive/`. This file is
> built up batch-by-batch and reflects current behaviour. Future
> cockpit work should update this file directly in each batch's
> close-out task; further product plans get authored when the next
> major refactor is scoped.
```

### 5. Update `docs/Work/capture/inbox.md`

Append:

```markdown
- [ ] [cockpit-v2-decommission program close-out 2026-06-{day}] ✅ Cockpit v2 program complete. Phase 1 (1 batch) + Phase 2 (8 batches) + Phase 3 (6 batches) = 15 batches over 2026-05-17 → 2026-06-{day}. Plans archived; live state in docs/Reference/product/cockpit/COCKPIT.md.
- [ ] [Q3 2026 follow-up] Hard-delete `@deprecated` kill-switch helpers from cvd-02. (Source: docs/Work/Daily-plans/May 2026/24-05-2026/cockpit-v2-decommission/plan-cockpit-v2-decommission-batch.md DL-2)
- [ ] [Q3 2026 follow-up] Migrate all `doctor_settings.cockpit_layout_presets` rows from legacy `layout` shape to `layout_tree`; drop the converter + the legacy column. (Source: same DL-3)
- [ ] [Q3 2026 follow-up] Cockpit v2 program retrospective — what worked, what didn't, what we'd do differently next refactor. (Source: same)
```

### 6. Verify

```powershell
# git status — confirm:
#   M docs/Work/Product plans/archive/plan-cockpit-v2.md (with banner)
#   M docs/Work/Product plans/archive/plan-cockpit-v2-execution-roadmap.md (with banner + final changelog)
#   D docs/Work/Product plans/plan-cockpit-v2.md  (moved)
#   D docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md  (moved)
#   M docs/Reference/product/cockpit/COCKPIT.md
#   M docs/Work/capture/inbox.md
#
# rg "Product plans/plan-cockpit-v2" docs/   # → only matches under archive/
```

If `git mv` wasn't used (e.g. PowerShell can't due to path quirks), use `Move-Item` then `git add` the new path + `git rm` the old path explicitly.

---

## Acceptance gate

- [x] Both plans moved to archive with banners.
- [x] Final changelog entry in archived roadmap.
- [x] `COCKPIT.md` promoted with SoT note.
- [x] Inbox has program close-out summary + 3 Q3 follow-ups.
- [x] No references to the old plan paths outside `archive/` in live docs (`COCKPIT.md`, inbox). Historical daily-plan task files retain planning-time links.

---

## Anti-goals

- ❌ Don't delete the plans — DL-4 says archive (move + banner).
- ❌ Don't broadcast or write a victory-lap doc — inbox line is enough.
- ❌ Don't update the daily-plan READMEs of all past dates to reflect program completion — pointless churn.
- ❌ Don't delete `docs/Reference/product/cockpit/COCKPIT.md`'s history — it's the SoT now.
