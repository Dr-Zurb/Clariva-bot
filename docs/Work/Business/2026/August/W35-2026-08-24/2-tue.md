# Tue 25 — deep build — policy URLs live

**Week:** [`W35`](./0-week.md) · **Month:** [`August`](../month.md)

**Morning** · duty: ⟨fill⟩

Protected build. CA is pinged — do not sit on that thread. Meta verification is already in review.

If only one thing happens: **privacy + terms at a public URL.** That is L9 and it unblocks Meta App Review later.

---

### 1. Privacy policy — public URL (L9)

Pages already exist in the app: `frontend/app/privacy/page.tsx`.

Live on `haloaid.com` (29 Aug). Frontend only — no production backend, so desk / EHR cannot be used.

- [x] Decide the public host — Cloudflare DNS + Render (`Clariva-bot-1`)
- [x] Privacy reachable without login
- [x] Contact on the page is a real Halo Aid address (`founder@haloaid.com`), not “app settings”
- [x] Paste the live URL here: https://haloaid.com/privacy

---

### 2. Terms of service — public URL (L9)

Same as above. File: `frontend/app/terms/page.tsx`.

- [x] Terms reachable without login
- [x] Same host as privacy
- [x] Paste the live URL here: https://haloaid.com/terms

Data deletion (same host, not a rewrite): https://haloaid.com/data-deletion

Do **not** rewrite these as a full DPDP / counsel pass today. Live and findable is the win. Counsel later.

---

### 3. Meta business verification (M2)

- [x] Already submitted (Fri 28 Aug) — in review
- [ ] Turn on **2FA** if it is still “No one” (one minute, same Security Centre)

---

### Nudge

Monday’s CA ping: no reply yet. Leave it. Do not double-text the same sitting.

---

**Night**

- Shipped: Privacy, terms, and data-deletion at public Halo Aid URLs. `haloaid.com` + `www` verified on Render (cert issued). Copy is HALO AID PRIVATE LIMITED / `founder@haloaid.com`.
- Slipped + why: Meta 2FA still “No one”. Landed 29 Aug, not on Tue 25.
- Tomorrow's first move: Turn on Meta 2FA, then paste the three policy URLs into the Meta app settings.
- Parked: Hosted backend + `NEXT_PUBLIC_API_URL`. Do not point production at Tailscale. Migrations 187–221 still untracked.
