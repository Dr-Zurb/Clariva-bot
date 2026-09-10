# Wed 26 — deep build — data deletion callback

**Week:** [`W35`](./0-week.md) · **Month:** [`August`](../month.md)

**Morning** · duty: ⟨fill⟩

Work below landed **30 Aug**, not on Wed 26. Card left open until then.

### 1. Data deletion callback endpoint — build it (M1)

- [x] Public `POST /data-deletion-callback` on the live frontend (`Clariva-bot-1` / `main`)
- [x] Status page at `/data-deletion?code=…`
- [x] `META_APP_SECRET` set on Render (server-only)

Live: https://haloaid.com/data-deletion-callback

Acks Meta. Real Instagram disconnect still waits on a hosted Express backend.

### 2. Verify it from the Meta app dashboard (M1 / L9)

- [x] App domains → `haloaid.com`
- [x] Contact → `founder@haloaid.com`
- [x] Privacy → https://haloaid.com/privacy
- [x] Terms → https://haloaid.com/terms
- [x] User data deletion → **Data deletion callback URL** → https://haloaid.com/data-deletion-callback
- [x] Live POST returns `200` + `{ url, confirmation_code }` pointing at `haloaid.com` (not Render localhost)
- [ ] Facebook → Apps and Websites → Remove Halo Aid → **Send Request** — only if this Facebook account has ever connected the app. There is no Test button on Basic Settings.

### 3. CA answers into `tracks.md` (L2 / L3 / L4)

- [ ] Still waiting. Pinged 28 Aug. Do not invent deadline dates.

- Firing today:

**Night**

- Shipped (30 Aug): Public Meta callback + status page on `haloaid.com`. Basic Settings pointed at the Halo Aid URLs. Render has `META_APP_SECRET`.
- Slipped + why: Not done on Wed 26. CA (L2/L3/L4) still unanswered. Optional Facebook Send Request not run.
- Tomorrow's first move: Leave the CA thread. Optional Send Request if this account has Halo Aid connected; otherwise M1 is done enough.
- Parked: Hosted backend so the callback actually disconnects Instagram. Do not point production at Tailscale.
