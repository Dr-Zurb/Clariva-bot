# Inbox

Add new items **below** this line (or at the top of the list—stay consistent). Uncheck ` [ ] ` until promoted or done.

---
code related 

[] save and leave  on all pages of settings just like how its set for services catalog
[] description on service catalog 
[] booking flow improvments - consent taking flow issue 
[] doctor availability time on payment slot links in case opd mode is set to queue ,
[] always verify from doctor before booking first mode, some docs may prefer this 
[] only onE APPOINTMETN FEE FLOW ?  in case any doc only wants one appointment fee , others/not listed coloumn should be present only if multiple services are to be selected by doc with different prices ?
[] placeholder appears if want confirmation 
[] notification system for docs ( match reviews and other things )
- [x] Pre-existing test failure on `main`: `backend/tests/unit/workers/webhook-worker-characterization.test.ts` — "confirm_details yes → consent (self booking)" expects `/Anything else|extras/i` but current extras prompt uses "Any special notes for the doctor — like allergies, medications, or preferences". Update either the assertion or the copy to realign. → Fixed 2026-04-16 by widening the regex to `/special notes|allergies|Anything else|extras/i`.
- [ ] Follow-up to task-04 (service scope mode): add a dismissible one-time migration banner in practice setup explaining "New services default to Strict matching; existing services default to Flexible". Needs localStorage or `doctor_settings.ui_flags_json` persistence. Inline helper in the drawer was shipped as interim education.
- [ ] Follow-up to task-06 (AI auto-fill): per-doctor token-budget telemetry for `POST /api/v1/catalog/ai-suggest` (currently only the OpenAI helper logs token counts globally). Open question 1 from plan-02.
- [ ] Follow-up to task-06: add a route-level test harness for `POST /api/v1/catalog/ai-suggest` (express + supertest + auth-token mock). Service layer is fully unit-tested in `tests/unit/services/service-catalog-ai-suggest.test.ts`; the route file itself is currently only covered by tsc + Zod schema validation.
- [ ] Follow-up to task-06: bootstrap Jest in `frontend/` so we can add a unit test for the `aiSuggestionMeta` round-trip in `lib/service-catalog-drafts.ts` (`offeringToDraft` strips it, `draftsToCatalogOrNull` ignores it). Today the frontend has Playwright e2e only.
- [ ] Follow-up to task-06: manual end-to-end click-through of all four AI trigger points (empty-catalog starter, new-card inline banner, sparkle on empty hints, sparkle on filled hints → diff modal) against a real doctor profile to validate copy + UX with live LLM output.
- [ ] Follow-up to task-07 (catalog quality checks): implement `[Fix all with AI]` bulk dispatch — runs each issue's `autoFixAvailable` action sequentially, shows one combined toast at the end, and auto-snapshots `service_offerings_json` before the run so the doctor can revert. Drafts only; never auto-persists. Blocked until snapshot/undo model is agreed on.
- [ ] Follow-up to task-07: wire `enable_modality` and `reprice` one-tap fixes once the per-channel pricing context (per-modality default prices + modality availability from `doctor_settings`) is plumbed through `applyAiSuggestionToDraft`.
- [ ] Follow-up to task-07: frontend component tests for `CatalogCardHealthBadge` (4 states + scope-aware tooltip) and `CatalogReviewPanel` (grouping, fix dispatch, save-anyway). Blocked on the existing "bootstrap Jest in `frontend/`" inbox item above.
- [ ] Follow-up to task-07: cross-workspace schema-parity runner (jest project or node script) that imports `backend/src/types/catalog-quality-issues.ts` + `frontend/lib/catalog-quality-issues.ts` and asserts enum + action equality. Today parity is enforced by `backend/tests/unit/types/catalog-quality-issues.test.ts` plus manual review.
- [ ] Follow-up to task-07: manual end-to-end of catalog review — hand-craft a catalog that triggers one of each issue type, apply each `[Fix with AI]` action, and confirm the resulting draft state.
- [ ] Follow-up to task-07: surface the mixed-complaint signal in `review` mode once Plan 01 Task 05 telemetry (per-service misroute counts) lands.
## Inbox

<!-- Add `- [ ] Your item` below -->
Business related
[] start brand building insta post stories 
[] look for comments in docs post see what kind of comments there usually are present  find possible solutions
