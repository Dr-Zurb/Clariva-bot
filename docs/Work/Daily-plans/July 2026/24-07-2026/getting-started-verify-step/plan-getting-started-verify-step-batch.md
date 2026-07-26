# getting-started-verify-step — batch plan

> Fold doctor verification into Getting started as checklist step 1.
> Drop the redundant sidebar **Get verified** tab + banner on the checklist page.
> Systems stay separate (onboarding API ≠ verification API). Frontend-only / Auto-safe.

---

## Why

Getting started already surfaces verification three ways: a top banner, a sidebar
tab, and an Instagram row hijack (“Get verified first”). One checklist step is enough.

---

## Decision lock (GS-D*)

| # | Decision | Rationale |
|---|---|---|
| **GS-D1** | Remove **Get verified** from the sidebar. Setup group = Getting started only. | One setup entry. |
| **GS-D2** | Keep route `/dashboard/get-verified` + `GetVerifiedClient`. Step 1 deep-links there — do not inline the form. | Large upload form; matches ONB-D3 deep-link pattern. |
| **GS-D3** | Drop `VerificationBanner` from `/dashboard/getting-started`. Keep it on Integrations. | Step 1 replaces the banner on that page; VER-05 soft-block still needs it at Connect. |
| **GS-D4** | Step 1 **done** only when `status === "verified"`. Intermediate CTAs: pending → status label (no Done); changes_requested → “Update documents”; rejected → “Fix & resubmit”; unverified → “Get verified”. | Avoid false Done while IG is still gated. |
| **GS-D5** | Hide Getting started in the sidebar only when **onboarding `complete` AND `verified`**. | With one tab, early hide would strand unverified doctors. |
| **GS-D6** | Backend onboarding status stays 4 setup booleans — **no** verification in that payload / **no migration**. Frontend composes step 1 from verification status. | DF-D4: verify ≠ setup at the API layer. |

---

## Target checklist

1. Get verified → `/dashboard/get-verified`
2. Connect Instagram
3. Add practice info
4. Set pricing
5. Set availability

---

## Scope

**Touch:** sidebar, DashboardShell hide rule, onboarding-steps / OnboardingSteps /
GettingStartedClient / getting-started page, OnboardingChecklistCard, tests.

**Do not touch:** GetVerifiedClient internals, VER-05 gates, backend onboarding /
verification services, admin review.

---

## Close gate

- [x] No Get verified sidebar item
- [x] Getting started shows verify as #1 with GS-D4 states
- [x] Banner gone from getting-started; still on Integrations
- [x] Sidebar hides Getting started only when setup complete + verified
- [x] Cockpit card remaining count includes verify when needed
- [x] Lint + vitest green on touched files (12 tests; project-wide `tsc` has pre-existing rx noise)
