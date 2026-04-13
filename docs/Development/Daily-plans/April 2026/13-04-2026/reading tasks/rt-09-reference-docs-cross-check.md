# RT-09 — Reference docs cross-check

**Philosophy:** Align docs with code; avoid forked “rules”.

## Paths to read

- `docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md` (full)
- `docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md` (exists? scan)
- `docs/Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` (if exists)
- `docs/Reference/COMPLIANCE.md` — PHI in DM (skim sections relevant to bot)
- `docs/Reference/DECISION_RULES.md`

## What to verify

1. **Drift:** Conversation rules vs actual branch order in `instagram-dm-webhook-handler.ts`.
2. **Philosophy optional:** User wants elite bot — consider whether **daily work** should **default** to philosophy for bot PRs (product decision; note in planning doc).
3. **Links:** Broken links from philosophy §7 to files.

## Deliverable

**Doc update backlog** (bullet list of files to edit after code audit).
