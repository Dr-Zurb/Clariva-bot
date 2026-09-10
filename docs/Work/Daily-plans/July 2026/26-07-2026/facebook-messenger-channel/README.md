# Facebook Messenger channel

> Connect a doctor's **Facebook Page** so Clariva's AI receptionist works on **Messenger DMs** and **Page comments** — same funnel as Instagram. Reopens integrations Decision **I1′**.

**Parent roadmap:** [`../../../Product plans/integrations/plan-00-integrations-roadmap.md`](../../../Product%20plans/integrations/plan-00-integrations-roadmap.md)  
**Task prefix:** `fbm`  
**Depends on:** Instagram Login path stable (Halo Aid-IG); shared engine `run-conversation-turn` stays channel-free (I2).

---

## Execute in order

| Phase | Folder | Theme | Status |
|-------|--------|-------|--------|
| **p1** | [`p1-connect-and-messenger/`](./p1-connect-and-messenger/) | Meta ops, Page OAuth connect, `facebook` adapter, Messenger DMs, Integrations UI | ✅ Done (2026-07-26) |
| **p2** | [`p2-page-comments/`](./p2-page-comments/) | Page comment webhooks → lead + public reply + optional Messenger handoff | ✅ Done (2026-07-27) |

---

## Decision lock (program-level)

| ID | Decision |
|----|----------|
| **FBM-D1** | **Full channel** — Messenger DMs (p1) then Page comments (p2). Same AI funnel as IG; no second conversation engine. |
| **FBM-D2** | Use the **Facebook / Halo Aid app** (`27623008554059525` or current FB app in Meta Business) for Page Login + Messenger — **not** Halo Aid-IG (`1393…`). Keep IG Login credentials separate in env. |
| **FBM-D3** | **New `doctor_facebook` table** (additive migration) for Page id + Page access token + health columns. Do **not** overload `doctor_instagram` IG-login rows. |
| **FBM-D4** | Channel adapter: extend `ChannelId` with `'facebook'`; implement under `workers/channels/facebook/`. |
| **FBM-D5** | Webhooks: `object: page` on existing `/webhooks/instagram` **or** dedicated `/webhooks/facebook` — prefer **same route family** already verified with Funnel (`/webhooks/*`) unless Meta product forces split; decide in p1 and document. |
| **FBM-D6** | Doctor verification gate (`isDoctorVerified`) applies to Facebook Connect the same as Instagram. |
| **FBM-D7** | WhatsApp remains post-sales (I8). This program does **not** start WA. |
| **FBM-D8** | Generalized `doctor_channel_connections` hub table still deferred — two cards (IG + FB) on Integrations is enough for v1. |

---

## Task index

| Task | Phase | Title |
|------|-------|-------|
| fbm-01 | p1 | Meta App: Facebook Login + Messenger + Page webhooks (ops) |
| fbm-02 | p1 | Migration: `doctor_facebook` (+ RLS) |
| fbm-03 | p1 | OAuth connect / disconnect / Page subscribed_apps |
| fbm-04 | p1 | `facebook` channel adapter (parse + send) |
| fbm-05 | p1 | Wire `page` webhooks → adapter → conversation turn |
| fbm-06 | p1 | Integrations UI: Connect Facebook card |
| fbm-07 | p1 | Page token health / reconnect nudge |
| fbm-08 | p1 | Close gate p1 |
| fbm-09 | p2 | Page comment webhook → lead + resolve Page |
| fbm-10 | p2 | Public comment reply + Messenger follow-up (mirror IG comment flow) |
| fbm-11 | p2 | Close gate p2 |

---

**Created:** 2026-07-26.  
**Status:** Scaffolded → execution started. **FBM-D\*** confirmed by founder (2026-07-26).  
**Gate:** `fbm-02` migration = **Opus** (agent-contract). Do not start Wave 2 code until migration applied.
