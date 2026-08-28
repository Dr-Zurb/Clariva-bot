# Doctor funnel — access, verification & onboarding roadmap

> **What this is.** The umbrella for how a doctor goes from *interested stranger* → *verified, live doctor* on Halo Aid. Groups four sibling batches created 2026-07-22.
>
> **Upstream (done):** [`../halo-aid-demo-cta/`](../halo-aid-demo-cta/) — homepage "Book a demo" → Cal.com EU (`halo.aid/demo`). The demo call itself is sales (Cal Video / Meet), **not** the product's Twilio consult stack.

---

## The funnel

```
Homepage
├─ Book a demo  → Cal.com → you demo → invite  ┐
└─ Get started  → self-serve /signup           ┘→ same account model
                                                   │
                            ┌──────────────────────┴───────────────────────┐
                            ▼                                               ▼
                 Gate 1: ACCOUNT (login exists)              Gate 2: VERIFY (real licensed doctor)
                                                                          │
                                                                          ▼
                                                       Gate 3: SETUP (IG · practice · pricing · availability)
                                                                          │
                                                                          ▼
                                                                 LIVE (patient-facing bot on)
```

Three gates, kept separate. Do **not** mash verification into the signup form or setup into the dashboard.

## Decision lock

| ID | Decision |
|---|---|
| **DF-D1** | One account model for both paths (demo→invite and self-serve). No second "kind" of doctor. |
| **DF-D2** | A "doctor" **is** the `auth.users` row (every table FKs to `auth.users(id)`; no `doctors` table). Verification state = a new table keyed to `auth.users(id)`. |
| **DF-D3** | Never fill the public signup form on a doctor's behalf; post-demo we **invite** (they set their own password). |
| **DF-D4** | Go-live chokepoint = **Instagram connect + first patient booking**. Unverified ⇒ receptionist stays paused / connect blocked (`instagram_receptionist_paused` already exists). |
| **DF-D5** | Private beta = **invite-only + manual vetting** (you check NMC/state-council by hand). The KYC *system* is built later, when manual review hurts. |
| **DF-D6** | License fields (registration number/state/council + document uploads) live in the **verification** batch (needs storage + a table), **not** on `/signup`. |

## Sequencing

| # | Batch | Weight | Gate | Status |
|---|---|---|---|---|
| 1 | [`signup-v2/`](../signup-v2/) | Auto | Account | ✅ Complete |
| 2 | Invite-only beta (manual) | ~0 eng | Verify (social) | Policy — see DF-D5 |
| 3 | [`doctor-onboarding-v1/`](../doctor-onboarding-v1/) | Auto | Setup | ✅ Complete |
| 4 | [`doctor-verification-v1/`](../doctor-verification-v1/) | **Opus** | Verify (system) | ✅ Complete (incl. VER-05 gate) |
| 5 | [`doctor-invite-v1/`](../doctor-invite-v1/) | touches auth | Account (post-demo) | ✅ Complete |
| 6 | [`../admin-console-v1/`](../admin-console-v1/) | **Opus** (auth) | Verify (review UX) | ✅ Complete (dogfood: flag admin) |
| 7 | `doctor-verification-v1` · VER-05 go-live gate | **Opus** | Verify→Live | ✅ Shipped (with #4) |
| 8 | [`../admin-console-v2/`](../admin-console-v2/) | Auto | Admin ops (discoverability + invite UI) | ✅ Complete |
| 9 | admin-console-v3 — doctors directory | **Opus** | Admin ops (cross-doctor read) | 📋 Roadmap |

**Admin console track:** v1 (role + guard + verifications review) ✅ → v2 (profile-dropdown entry point + invite UI, Auto) → v3 (doctors directory, Opus) → v4 (per-doctor actions) / v5 (admin management). See [`../admin-console-v2/plan-admin-console-v2-batch.md`](../admin-console-v2/plan-admin-console-v2-batch.md) for the full roadmap.

**Why this order:** you have zero doctors today. Building the upload vault + admin review before that is premature. Ship signup polish + the onboarding checklist first; enforce the "no quacks" bar manually via invite-only until volume justifies the (heavy, compliance-loaded) verification system.

**Why #6 before #7:** VER-05 turns verification into a *hard blocking gate* — the moment it's on, every doctor is stuck until someone approves them. So the approval path must be fast and reliable *first*. Today that path is curl/`CRON_SECRET`; `admin-console-v1` makes it a real, role-gated review UI. Build + dogfood the console, then flip the gate that depends on it.

## Escalation flags (agent contract)

- **`doctor-verification-v1` is Opus.** New migration + RLS + Supabase Storage + PHI/sensitive-doc handling + admin role/authz. Do not execute under Auto.
- **`admin-console-v1` is Opus** (auth): introduces a browser-reachable admin role + guard over the verification review endpoints. No migration. Do not execute under Auto.
- **VER-05 go-live gate is Opus** (touches live IG-connect + first-booking paths). Enforce only after #6 ships.
- **`doctor-invite-v1` touches auth** (Supabase `inviteUserByEmail`, service-role). Flag before executing.
- **`admin-console-v2` is Auto**: frontend-only (admin-only dropdown link + invite form) reusing the existing admin-gated invite endpoint; no migration, no new auth surface.
- **`admin-console-v3` (doctors directory) is Opus**: a new admin-scoped endpoint aggregating across all doctors (broad data scope / RLS / PHI care).
- `signup-v2` and `doctor-onboarding-v1` are Auto: no migration, read-only aggregation + frontend + existing `doctor_settings` fields.

**Created:** 2026-07-22.
