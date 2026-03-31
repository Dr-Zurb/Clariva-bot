# 2026-03-31 — Practice currency, booking rules cleanup, bot ↔ service catalog parity

**Date:** 2026-03-31  
**Theme:** Remove legacy flat **appointment fee** from Booking Rules; expose **practice currency** on **Practice Info**; ensure **patient-facing bot** (Instagram DM / AI context, fee DMs, quotes) stays aligned with **`service_offerings_json`** and `appointment_fee_currency`.

**Status:** 🟡 Planned (task files only — implementation pending)

---

## Why

- Teleconsult pricing is **service- and channel-based** (`service_offerings_json` / SFU-01, SFU-12). A separate **flat appointment fee** in Booking Rules duplicates product meaning and confuses doctors.
- **Currency** still matters globally: catalog stores **minor units** (paise/cents); `consultation-quote-service.resolveCurrency()` uses **`appointment_fee_currency`** today — that field should live where “practice identity” lives (**Practice Info**), not inside a removed “fee” block.
- The bot already receives **`service_catalog_summary_for_ai`** via `formatServiceCatalogForAiContext()` (`consultation-fees.ts`), but the **summary is list-price-only** (no follow-up rules), and other code paths still assume **legacy fee** for payment / messaging edge cases. This plan closes gaps.

---

## Plan & task order

| Order | Task | Focus |
|-------|------|--------|
| 1 | [e-task-1: Practice currency & booking rules cleanup](./e-task-1-practice-currency-and-booking-rules.md) | Dashboard: Booking Rules vs Practice Info; PATCH payload; copy; optional country → default currency |
| 2 | [e-task-2: Patient bot & pricing parity](./e-task-2-patient-bot-catalog-and-pricing-parity.md) | Backend: AI context, DM fee text, quote/payment paths, tests — catalog + currency without misleading legacy fee |

**Dependency:** Task 1 should land first or in parallel with Task 2 so **currency** is set from Practice Info before removing fee from Booking Rules (avoid doctors saving booking rules and wiping currency unintentionally).

---

## Code anchors (shared)

| Area | Path |
|------|------|
| Booking Rules UI | `frontend/app/dashboard/settings/practice-setup/booking-rules/page.tsx` |
| Practice Info UI | `frontend/app/dashboard/settings/practice-setup/practice-info/page.tsx` |
| Doctor settings API / validation | `backend/src/services/doctor-settings-service.ts`, `backend/src/utils/validation.ts` |
| Quote currency | `backend/src/services/consultation-quote-service.ts` → `resolveCurrency` |
| AI doctor context | `backend/src/workers/instagram-dm-webhook-handler.ts` → `getDoctorContextFromSettings` |
| Catalog → AI string | `backend/src/utils/consultation-fees.ts` → `formatServiceCatalogForAiContext` |
| AI system prompt fees block | `backend/src/services/ai-service.ts` → `buildResponseSystemPrompt` |
| SFU program | `docs/Development/Daily-plans/March 2026/2026-03-27/services-and-follow-ups/` |

---

## Acceptance (epic)

1. No **appointment fee** amount on **Booking Rules**; page describes slots, advance limits, cancellation, buffers only.
2. **Practice currency** (`appointment_fee_currency`) editable on **Practice Info** (with clear helper text: applies to **service catalog** amounts and quotes).
3. Bot / AI **SYSTEM FACTS — FEES** reflects **catalog** (including **follow-up policy summaries** where feasible) and correct **non-INR** formatting when currency is not INR.
4. **No catalog + no legacy fee:** product behavior documented (block quote / clear error / onboarding), no silent wrong prices.
5. Regression tests updated for quote service, DM composer, and AI context helpers as needed.

---

**Last updated:** 2026-03-31
