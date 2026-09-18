# Plan 03 — Post conversion analytics (Insights)

> **Status:** p1 ✅ Done 2026-07-27. p2/p3 pending. Execution: Daily-plans `post-conversion-analytics`.  
> **Roadmap:** **Axis E** (Growth / attribution) in [`plan-00-integrations-roadmap.md`](./plan-00-integrations-roadmap.md) — *organic* post→appointment proof, complementary to parked Meta Conversions API (paid ads).  
> **Consumes:** Axis A intake (`comment_leads`, conversations, appointments) + Inbox path honesty (`linkCommentLeadToConversation` — already wired in Interactions Inbox p1).

## Why this exists

The doctor is in charge of their digital clinic on social. Clariva already captures **which post a comment came from** (`comment_leads.media_id`), whether that lead became a **DM** (`conversation_id`), and whether it became an **appointment / paid booking**. Today that chain is invisible — the doctor cannot answer:

> “Which posts actually convert to appointments?”

Example the product must support:

> Post X had ~3000 comments · ~1000 healthcare-interested · ~50 appointments · conversion %…

Plus a clean split of **appointments from comments vs direct DMs** so content strategy and channel strategy both get data.

## Decisions LOCKED (2026-07-27, founder discussion)

| ID | Decision | Implication |
|----|----------|-------------|
| **PCA1** | **Surface lives under Insights** (analytics), not Inbox (ops). | Inbox stays the working queue; this is the “what worked?” view. |
| **PCA2** | **Aggregate-only in analytics.** Counts and rates — never list raw `comment_text` in this surface or its exports. | PHI / log hygiene: comment bodies stay in Inbox detail only. |
| **PCA3** | **P1 = existing data only.** Funnel by `media_id` from `comment_leads` → conversations → appointments. No Graph enrichment required for first numbers. | Ship proof fast; post cards may show raw media id until P2. |
| **PCA4** | **Attribution = first-touch comment lead** when a conversation links to ≥1 lead. | Deterministic; document in API. Last-touch is a later toggle if needed. |
| **PCA5** | **“Interested” = stored lead with a non-skip intent** (same set the comment worker keeps — `book_appointment`, `check_availability`, `pricing_inquiry`, `general_inquiry`, `medical_query`). | Aligns with what we already persist; skip intents (`spam`/`joke`/…) are not stored as leads today. |
| **PCA6** | **Direct DM bucket** for appointments whose conversation has **no** linked `comment_lead`. | Completes the source split without inventing post attribution for pure DMs. |
| **PCA7** | **Date window policy mirrors Inbox:** default 30d · presets 7/30/90 · custom max 1 year · no All-time. | Same scale concerns; server enforces. |

## Outcome

An **Insights → Content / Posts** (name TBD) view where the doctor sees:

1. **Source strip** — Appointments (and paid) from: Comment-attributed · Direct DM · (later other channels).
2. **Post leaderboard** — per `media_id` (later enriched post card): comments/leads · interested · DMs · appointments · paid · conversion %.
3. **Post detail** — funnel for one post + appointments it produced (links into Inbox / appointment, not raw comments).

## Non-goals (explicitly deferred)

- Meta **Conversions API** / ad ROAS (roadmap P8 — paid ads).
- Storing every public comment on a post (we only store leads we acted on).
- Predicting “best time to post” / creative AI.
- Cross-doctor benchmarks or marketplace leaderboards.
- WhatsApp / web attribution until those channels produce `comment_leads` or an equivalent source key.

---

## Product context — the spine already exists

| Table / field | Role | Notes |
|---------------|------|-------|
| `comment_leads.media_id` | **Post key** | Already written by IG/FB comment workers. |
| `comment_leads.intent` / `confidence` | Interested filter | HIGH_INTENT set in comment webhook handler. |
| `comment_leads.conversation_id` | Lead → DM | Requires Inbox p1 link wiring (done). |
| `comment_leads.dm_sent` / `public_reply_sent` | Outreach funnel steps | Optional secondary metrics. |
| `appointments.conversation_id` | DM → booking | Join for conversion. |
| `appointments.status` | Booked vs paid | `pending` ≈ booked unpaid; `confirmed`/`completed` ≈ paid. |
| Graph media APIs | Caption / thumb / `comments_count` | **P2** via `comment-media-service` patterns — not P1. |

**Honest gap today:** without a `social_posts` cache, P1 UI shows `media_id` (or a truncated id) until enrichment lands. Numbers are still correct.

### Funnel definitions (lock for API + UI copy)

Per post (`media_id`, doctor-scoped, date-filtered on lead `created_at`):

| Metric | Definition |
|--------|------------|
| **Leads** | Count of `comment_leads` for that `media_id` in window |
| **Interested** | Subset with intent ∈ HIGH_INTENT (PCA5) — typically ≈ Leads if skip intents aren’t stored |
| **DMs** | Leads with `conversation_id IS NOT NULL` |
| **Appointments** | Distinct appointments joined via those conversations (first-touch PCA4) |
| **Paid** | Those appointments with status `confirmed` or `completed` |
| **Conv % (lead→appt)** | `Appointments / Leads` (0 if Leads = 0) |
| **Comments (total)** | Graph `comments_count` — **P2 only**; P1 omits or shows “—” |

**Direct DM appointments:** appointments whose conversation has zero linked comment leads (PCA6).

---

## Phases (suggested Daily-plans program)

**Task prefix (proposed):** `pca`  
**Suggested folder:** `docs/Work/Daily-plans/…/post-conversion-analytics/` when execution starts.

| Phase | Theme | Depends on |
|-------|-------|------------|
| **p1 — Numbers from existing tables** | Doctor-scoped aggregate API + Insights UI leaderboard + source strip. Media id as label. | Inbox comment→DM link (done). |
| **p2 — Post identity** | `social_posts` (or equivalent) + Graph enrich (caption, permalink, thumbnail, posted_at, comments_count) + refresh cron. | p1; IG/FB tokens healthy. |
| **p3 — Depth** | Post detail funnel + appointment list links; CSV export; optional last-touch toggle. | p1–p2. |

### p1 scope (ship first)

**Backend**
- `GET /api/v1/insights/post-funnel` (name TBD) — Zod-validated `dateFrom`/`dateTo` (same 365d max as Inbox), optional `platform`.
- Service: SQL/admin aggregates only; **never select `comment_text`**.
- Response shape (illustrative):

```ts
{
  sourceSplit: { commentAttributed: n; directDm: n; paidCommentAttributed: n; paidDirectDm: n },
  posts: Array<{
    mediaId: string;
    platform: 'instagram' | 'facebook';
    leads: number;
    interested: number;
    dms: number;
    appointments: number;
    paid: number;
    conversionRate: number; // appointments/leads
  }>;
}
```

**Frontend**
- Insights sub-page or tab: source strip + sortable table/cards.
- Empty state when no leads in window.
- Link row → (p3) post detail; p1 may deep-link Inbox filtered by… **defer** if no media filter on Inbox yet.

**Tests**
- Unit: aggregation + first-touch rule + date window validation.
- No PHI in logs (assert queries omit `comment_text`).

### p2 scope

- Migration: `social_posts` (`doctor_id`, `platform`, `media_id`, caption, permalink, thumbnail_url, posted_at, comments_count, refreshed_at) unique `(doctor_id, platform, media_id)`.
- Enrich on first sighting of a new `media_id` in comment ingest (best-effort) + nightly cron for stale rows.
- UI: thumbnail + truncated caption + permalink; show total comments when known.

### p3 scope

- Post detail page/drawer: funnel viz + list of attributed appointments (id, status, date → appointment / Inbox).
- Export CSV of leaderboard (aggregates only).
- Optional attribution mode query param (`first` default / `last`).

---

## Risks & compliance

| Risk | Mitigation |
|------|------------|
| PHI leakage via comment text in analytics | PCA2 — aggregates only; audit queries. |
| Meta data-deletion shrinks history (migration 186) | Counts are “as of now”; no promise of immutable historical ROAS. |
| Graph rate limits on enrich | Cache in `social_posts`; cron; never N+1 on page load. |
| Broken comment→DM link | Already fixed in Inbox p1; analytics correctness depends on it staying wired. |
| `media_id` null on some leads | Exclude from post leaderboard; still count in overall comment-attributed if conversation linked somehow — document. |
| Opus gate | New doctor-facing read of appointment/patient lists on post detail may need Opus; **p1 aggregates are Composer/Sonnet OK** if no PHI columns returned. |

---

## Open questions (do not block p1)

| ID | Question | Lean |
|----|----------|------|
| **PCAQ1** | Nav label: “Content”, “Posts”, or “Growth”? | **Posts** under Insights. |
| **PCAQ2** | Include Facebook Page posts in the same table (platform badge)? | **Yes** — `comment_leads.platform` already discriminates. |
| **PCAQ3** | Should “Interested” collapse to Leads in UI if they’re always equal? | Show both columns; hide Interested if product later proves redundant. |
| **PCAQ4** | Paid-only conversion % as alternate sort? | Secondary sort; default sort = appointments desc. |

---

## Acceptance (program-level)

- [x] Doctor can see, for a date window ≤ 1 year, which posts produced the most appointments. *(p1)*
- [x] Source strip separates comment-attributed vs direct DM appointments. *(p1)*
- [x] Analytics responses never include `comment_text`. *(p1)*
- [x] P1 ships without Graph enrichment; P2 makes posts recognizable.
- [x] Daily-plans program created (`pca` prefix).

---

**Created:** 2026-07-27.  
**One-liner:** Prove which social posts convert to appointments — Insights leaderboard on existing `media_id` → lead → DM → booking chain; enrich post cards later.
