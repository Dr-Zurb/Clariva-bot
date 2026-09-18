# Locale-arm review workflow (LANG6-D2-B)

How a translation goes from draft to shipped. Approval is recorded **in-repo**, not in chat (LANG6-D5).

---

## Roles

| Role | Who | Checks |
|------|-----|--------|
| Generator | Engineer / script | English template → draft JSON; placeholders intact |
| Reviewer | Hindi and/or Punjabi speaker (clinic-receptionist register) | Whole **family** at once, not one string |
| Applier | Engineer | `locale-arms:apply` + tests/snapshots |

If no Punjabi reviewer is available, ship `pa` as `enByPolicy` with reason `no Punjabi reviewer yet` (LANG6-D8) rather than unreviewed copy.

---

## Steps

1. **Generate**  
   `cd backend && npm run locale-arms:generate -- --family <id>`  
   Optional LLM draft: add `--llm` (requires `OPENAI_API_KEY` via `config/env.ts`).  
   Output: `locale-arms/drafts/<id>.draft.json`.

2. **Review (whole family)**  
   Open the draft. Check register (LANG6-D6), protected tokens (₹, URLs, names — LANG3-D6), no invented clinical jargon.  
   Edit the draft file in place.

3. **Approve**  
   - Copy draft → `locale-arms/approved/<id>.json`  
   - Set `"status": "approved"`, `reviewedAt`, `reviewer` in that file  
   - Update `src/utils/locale-arm-manifest.ts` (`status: 'translated'`, dates)

4. **Apply**  
   `npm run locale-arms:apply -- --family <id>`  
   Lands arms into the copy module. Run unit tests + refresh snapshots if needed.

5. **Reject**  
   Family stays English via `enByPolicy(reason)`. (The transitional all-English helper was removed in lang-28.)  
   Track in `docs/Work/capture/inbox.md`. **Never partially ship** a family (some locales reviewed, others machine-only).

---

## PHI guarantee (LANG6-D3)

Drafts contain **templates only**. Placeholders like `${name}` / `${slotLink}` must appear unchanged in every locale arm. No patient data exists at generation time.

---

## Proof family

`non-text-ack` / `buildNonTextAckMessage` — first end-to-end walkthrough (lang-25).
