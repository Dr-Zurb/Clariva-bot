# OPD Systems — Product & Engineering Plan

**Date:** 2026-03-24  
**Status:** 📋 Planning  
**Location:** `docs/Development/Daily-plans/March 2026/2026-03-24/OPD modes/`

---

## 1. North Star

**Clariva does not impose a single OPD workflow.** Each doctor (and optionally each clinic or session) **chooses** between **two** OPD models:

- **Slot-based** — fixed appointment times on the calendar.
- **Queue / token-based** — first-come, first-served within a session; **includes** rolling **ETAs**, optional **approximate “around …”** messaging for patients/DMs, and **soft time language** where helpful. *(What we previously called “hybrid” is **not** a third mode—it is an **enhanced queue UX**: same token order, plus estimated rough times and honest forecasts.)*

This respects different practice styles (private low-volume vs high-volume camp vs tele-first), keeps the product **simple** (two modes, one mental model), and builds trust: doctors adopt tools they control.

---

## 2. Why two modes (slot vs queue)

| Factor | Slot-only | Queue / token (with ETA + optional “around …” copy) |
|--------|-----------|--------------------------------------------------------|
| **Predictable schedule** | Strong | Weaker on clock time; **order + ETA** answer “when?” |
| **Variable consult length** | Poor fit (waste if consult &lt; slot; overrun if &gt; slot) | Strong |
| **High DM / social volume** | Can cap throughput; idle gaps if consults are short | Strong (no fixed grid cap) |
| **Patient expectation (“when is my turn?”)** | Clear clock time | Token # + position + **ETA** / **approx window** (forecast, not a contract) |

**Summary**

- **Slots alone** can waste time (e.g. 2-minute consult in a 10-minute slot) and disrupt flow in very busy clinics.
- **Queue/token** fits variable length and high volume; add **rolling ETA** and optional **soft “expected around …”** in UI/DMs so social/tele flows still feel human—**without** a separate “hybrid” mode in the schema.

---

## 3. Modes — Definitions

### 3.1 Slot-only (fixed appointments)

- Doctor defines **availability** as discrete slots (and possibly duration per slot type).
- Patients **book a specific time** (or slot block).
- Scheduling engine is **calendar-first**: conflicts, buffers, and “fully booked” are slot-based.

**Best for:** Predictable, lower-volume flow; patients who expect a time on the calendar.

---

### 3.2 Queue / token (includes “rough times” — former “hybrid”)

- Doctor defines a **session** (e.g. morning OPD 9:00–13:00) and optionally **max patients** or unlimited.
- **Source of truth:** **token order** (typically **FCFS**; optional rules later: priority, walk-in vs booked).
- **ETAs:** estimated wait from **rolling average** consult duration × people ahead (see §6.3).
- **Optional UX layer (not a second mode):** show an **approximate window** or AI/DM copy like “we’ll try **around** 10:30”—always labeled **forecast** / **approx**, never a hard slot. When reality diverges, **position + updated ETA** win.
- **Early join / delay** messaging applies the same as elsewhere: queue order first; honesty when late.

**Best for:** High volume, variable length, social/tele flows where patients need both **fair order** and a **rough sense of when**.

---

## 4. Configuration Model (Product)

### 4.1 Who decides

- **Primary:** **Per doctor** — “Default OPD mode” and related parameters.
- **Future / optional:** **Per clinic or per session template** (e.g. “Monday camp = queue; Wed clinic = slots”) if multi-location or multi-session types appear.

### 4.2 Suggested settings (per mode)

| Setting | Slot-only | Queue / token |
|---------|-----------|-----------------|
| Session / day boundaries | Via slot templates or calendar | Explicit session windows |
| Slot length / grid | Required | N/A (no calendar slot contract) |
| Max patients per session | Via slot count | Explicit cap optional |
| Token issuance | N/A | Required |
| Patient messaging | Confirm time | Token #, position, **ETA**, optional **approx window** / “around …” copy (forecast) |
| Optional doctor toggles | — | e.g. show **time range** vs point ETA; **buffer** between patients; **staged next** in virtual waiting room |

### 4.3 Naming in UI (draft)

- **“How patients join your OPD”** or **“OPD mode”** — **two** options only:
  - **Fixed time slots** — Patients book a specific time.
  - **Token queue** — Patients get a place in line for the session; **estimated wait / rough window** shown as forecasts, not fixed appointments.

---

## 5. Problems, risks & solutions (by mode)

Each mode has predictable failure modes. Design **product rules + UX + telemetry** so staff and patients aren’t surprised.

**Scope (Clariva near term):** Product is **digital-first** — bookings from **social / DMs / comments** and care delivery as **teleconsultation**. Rows below are written for **online** flows first; **physical clinic** waiting rooms are a later extension (same ideas, different copy).

### 5.1 Slot-only — problems & mitigations

| Problem | Why it hurts | Possible solutions |
|--------|----------------|-------------------|
| **Short consult finishes early** | Next patient not due yet → idle chair/room, wasted throughput | **Optional “join early”** (see §6.2): invite next booked patient; not a reschedule—patient **opts in** to arrive/join now. Doctor/staff triggers “ready for next.” |
| **Early join for next vs “I still have time on paper”** | **Patient A** still sees **slot end time** (e.g. 10:15) while **Patient B** was offered **early join**—**A** may feel entitled to the **tail** of the block | **§5.1b** — define **what a slot means** in policy + booking copy; offer **early invite to B** only **after A’s visit is completed** in workflow; optional **same-slot add-on** only if **B** not yet admitted; optional **grace slot** (doctor opt-in). |
| **Consult runs over slot** | Cascade delay; wrong expectations | **Delay detection** vs scheduled slot end; **delay notifications** + patient UI banner; optional buffer between slots (doctor setting). |
| **No-show / late arrival** | Gap or dispute on forfeiture | Clear policy in copy: **grace window**, when slot is released; staff **mark no-show**. **Missed-slot handling** is stricter than queue—see **§5.1a** (rebook / overflow / strict forfeit—not “drag everyone’s time”). |
| **Patient thinks time is guaranteed** | Anger when reality diverges | Messaging: “scheduled time” + **live status** (“running late by ~X min”) so the contract is **best-effort** once OPD is dynamic. |
| **Overbooking / double-book** | Rare bugs or manual errors | Strong slot constraints in API; conflict handling; audit. |
| **Timezone / DST** | Wrong displayed time | Store UTC; display in clinic/patient TZ; tests around DST. |

#### 5.1a Slot-only — “I missed my time” / late (why it’s not like queue)

In **queue** mode you **re-order** tokens; the **line** is the truth. In **slot** mode everyone has a **fixed block on the calendar**—you **don’t silently move** one person’s 10:00 to 17:00 without either (a) a **new booking** / **new slot row**, or (b) an explicit **overflow** rule. Otherwise the grid and other patients’ expectations break.

**What the product can offer (doctor/clinic chooses — not one universal rule):**

| Approach | What happens | Notes |
|----------|----------------|-------|
| **Strict — “missed is missed”** | Outside **grace**, slot = **forfeit** / **no-show**; patient must **book again** if allowed. | **Refund / credit / fee** is **business + legal** (T&Cs, jurisdiction). Clariva **displays** the clinic policy; it does **not** default to “no refund” in product—**you configure** it. |
| **Grace window** | e.g. join within **X minutes** of slot start → still valid; after → **missed** per policy. | Reduces “I was 2 minutes late” disputes. |
| **Reschedule to next available** | Patient/staff picks **next empty** slot; **new** appointment record (or reschedule flow). | Common; avoids reshuffling the whole day. |
| **End-of-session overflow** | Doctor **approves** “see them **after** last booked slot today” — **append** capacity, not insert mid-grid. | Same-day mercy without bumping everyone’s fixed times. |
| **Doctor adds an extra slot** | Admin extends the session; **new** slot appears on the calendar. | Optional; capacity +1. |

**“Move to the end” in slot mode** means: **not** retargeting the same appointment to “end” without a **defined** end slot or **overflow**—usually **rebook** to last free slot or **overflow block**, with **staff/doctor approval** if policy requires.

**Clariva UX (direction):** Status: **grace** → **late** → **missed / no-show** → **reschedule offered** (per policy). Doctor actions: **Mark no-show**, **Send rebook link**, **Approve overflow** (end of day), **Add slot** (optional). Patient copy at booking: **grace**, **what if I’m late**, **refund/credit** pointer.

#### 5.1b Slot-only — “Paper time” vs early join for the next patient (disputes)

When a consult ends **early**, **patient B** may be offered **join early**. **Patient A** may still see **on paper** that their slot runs until **:15** and feel entitled to the **remainder** of the block (e.g. “forgot to ask”)—creating a **perceived conflict** if **B** accepts and **A** believes the calendar still “belongs” to them.

**Root cause:** Two interpretations of “slot”: (1) **displayed calendar block** (start–end) vs (2) **visit lifecycle** (consult **completed** vs still ongoing).

**Policy options (doctor/clinic chooses — document in booking + appointment UI):**

| Policy | Meaning |
|--------|---------|
| **Slot = scheduled window; visit may end before block end** | The **block** is a **planning window**, not a guarantee of **exclusive** doctor time until **:15** for add-ons **after** the consultation has **ended** in workflow. **Early invite** to **B** only **after A’s visit is marked completed** (or equivalent). **Copy:** e.g. “Your slot is your **scheduled** time; the visit may finish earlier; the next patient may be invited **after your consultation ends**.” |
| **Strict — no early invite to B until A’s slot end** or **until A confirms “done”** | Maximizes **A’s** sense of **tail time**; may **idle** the doctor if A finished early. |
| **Same-slot “forgot to ask” only while `now < slot_end` and B has not accepted / is not in consult** | **Conditional chance:** quick add-on **only** if **B** is still **waiting**; once **B** **accepts early join** (or enters consult), **A’s** same-block add-on may be **closed** per policy—otherwise use **post-consult return** (§5.2) or **grace / overflow** (§5.1a). |

**Product rules (direction):**

- Do **not** offer **early join** to **B** based only on “**gap on calendar**” while **A’s** consult is still **in progress** in workflow.
- **Optional:** show **A** both **scheduled block** and **visit status** (e.g. “Consultation ended”) so “paper time” does not imply an ongoing visit.
- Align **notifications** to the chosen policy so **A** and **B** are not told contradictory things about **who may join when**.

**Optional “grace slot” / buffer block (doctor opt-in):** A **dedicated** append-only block (e.g. end of session) to absorb **missed**, **forgot to ask after next started**, or **mercy** cases—**one** optional toggle can bundle several exception types without **inserting** into the middle of fixed slots. Combines with **§5.1a** (overflow / extra slot).

### 5.2 Queue / token — problems & mitigations

| Problem | Why it hurts | Possible solutions |
|--------|----------------|-------------------|
| **ETA feels wrong** | Early session: little data; variable consult length | **Rolling average consult duration** per doctor (and optionally per session type); show **range** or “~25–40 min from now” + “refining as we learn.” Cold-start: use **default** from specialty or doctor-stated average until N visits. |
| **Queue feels unfair** | Perception of jumping | Transparent rules: FCFS; staff actions logged; optional **reason** for out-of-order (emergency) if ever allowed. |
| **Digital “overcrowding” (not physical)** | Everyone tries to **join / refresh / message** at once; lobby APIs spike; noisy notifications | **Tele-first:** activate **join** or **waiting room** only when **near turn**; **arrive-by-window** from ETA as “open the app between X–Y”; rate-limit or batch notifications; optional **virtual waiting room** with position (see below). *Physical clinic* later: same idea as “don’t all arrive at door at 9:00.” |
| **Token limits / cap** | Patient can’t join when session is full | **Digital:** clear **“session full”** at booking / join attempt; no “travel” framing needed—same as “slots sold out.” Optional **waitlist** (future). |
| **Abandonment (missed turn)** | Token called; patient offline / didn’t open link / lost connection | **Missed turn** policy (doctor setting): e.g. call next immediately; **re-insert** patient (options below); max **grace** window for “calling your name.” |

**Missed turn — re-insertion options (tele, queue mode):**

- **End of queue** — fairest to others who were ready; simple to explain.
- **Insert after current** (e.g. missed #5 while #6 is in progress → put #5 **before #7** when they return) — faster for the late patient; can feel unfair to #7 if not messaged; needs **clear policy** + optional **notify affected patients** (“your turn may move by one”).
- **One “recall”** — auto-hold for 1–2 minutes then forfeit.
- Product should expose **doctor/clinic rules**: buffer time, whether re-insertion is allowed, and **where** in queue (after current vs end).

**“I missed my turn / I’m back now” — common in real OPDs (queue + slot):**

This is the daily case: the doctor **already moved on** (next token called or next slot started), then the patient **returns** and says they missed their turn.

| Layer | What to decide | Clariva direction |
|-------|----------------|-------------------|
| **Policy (doctor setting)** | Is re-entry allowed at all? How often? | Default options: **end of queue** (fairest), **after current patient** (faster for returnee), **one recall only per session**, or **staff-only / doctor discretion** (no automatic re-insert). |
| **Queue mode** | Where do they go? | Same as **re-insertion options** above: e.g. **end of queue** vs **before next waiting** (insert after active consult). Notify others if order shifts. |
| **Slot mode** | They missed the **clock window** | **Fixed grid** ≠ queue shuffle—see **§5.1a**: strict forfeit vs grace vs **reschedule** vs **overflow** / **extra slot** (doctor-approved). |
| **Staff / doctor UI** | One-tap reality | Actions: **“Patient returned — requeue at end”** / **“Insert after current”** / **“Reschedule”**; optional **reason** (bathroom, parking, network) for analytics only. |
| **Patient UX (digital)** | Reduce arguments | Clear prior copy: “If you miss when called, you may be asked to **rejoin at the end of the line**” (or whatever the policy is). If they come back in-app: **“You missed your turn at [time]. Tap to rejoin queue”** → applies clinic rule. |
| **Fairness** | Others already waited | If inserting **not** at end, **notify** affected patients (ETA shift). Log **who** approved out-of-order if staff override. |

**Principle:** There is **no universal medical rule**—only a **consistent clinic rule** patients and staff understand. Product should **encode the chosen rule** and make the **exception path** (return after miss) a **first-class flow**, not only a hallway negotiation.

**Post-consult return — “I forgot to ask” / “I also have this complaint” (after visit already ended):**

This is **not** the same as **missed turn** (never got seen). Here the **consult is already finished**, the **next patient has started** (or is next in line), and the **same patient comes back**—often for a forgotten question, a new minor symptom, or paperwork.

| Question | Practical guidance |
|----------|-------------------|
| **Is “after the current patient” the right thing?** | Often **yes**, and it matches how many OPDs run: you **don’t interrupt** the person currently with the doctor (unless emergency); you **slot the returnee right after** the active visit. That balances **continuity** for the returnee with **respect for whoever is in the chair**. |
| **What’s “most right” in principle?** | **Triage:** (1) **Emergency** → handle immediately. (2) **Quick clarification** (seconds–minute) → many doctors handle at door or “after current” as you do. (3) **New significant issue** → may deserve a **new appointment** or **end of session** slot so the day doesn’t unravel. There is no single rule—**clinic policy + doctor judgment**. |
| **Fairness** | Patient **B** (in consult) keeps **uninterrupted** time; returnee **A** waits **after B**, not **before** others who were already waiting in queue—unless your policy explicitly allows **end of queue** for returns to protect everyone else’s ETAs. **Your pattern (after current only)** is a clear, defensible default: **one** insert point, minimal ripple. |
| **Documentation / billing** | Same calendar “visit” vs **addendum** vs **new visit** depends on jurisdiction and clinic rules—product can flag **“same-day return”** for records without prescribing billing. |

**Clariva direction:** Treat as a distinct **event type**: e.g. **`return_after_completed`** (vs `missed_turn`). Doctor/staff actions: **“See after current patient”** (matches your habit), **“End of queue”**, **“Book follow-up”**, **“Brief question only”** (optional). Patient app: **“Need something else from today’s visit?”** → routes to clinic rule + queue position. **Do not** silently merge with the previous completed encounter without an explicit **addendum** or new line item in the chart if the product tracks visits.

**Tele flow improvement — “next patient staged” (optional):**

- While **current** consult is ongoing, **next in line** can be moved to a **virtual waiting room** (or “ready to join” state) so when the doctor ends the visit, the next patient **joins immediately** with minimal gap—similar to calling someone into the corridor before the previous exits.
- **Optional buffer** (doctor setting): e.g. 0–5 minutes between patients for notes/handover.
- Improves throughput and doctor flow; pairs well with **early finish** on previous visit (next is already ready).

### 5.3 Queue mode — soft time & DM copy (pitfalls, not a separate mode)

When AI or staff say “**around** 10:00” while the system is **queue-backed**, patients may confuse that with **slot** booking. Same mitigations as before—now explicitly part of **queue**:

| Problem | Why it hurts | Possible solutions |
|--------|----------------|-------------------|
| **Soft time vs token order** | Patient treats “around 10:00” like a fixed appointment | **Token order is authoritative**; label times **forecast** / **approx**; live **position + ETA** always visible. |
| **Marketing vs reality** | DM said ~10:00; ETA now says ~11:00 | Copy + UI: “expected around” + **updated ETA**; never hide queue position. |
| **One screen to rule them** | Avoid two mental models | Patient sees **token + ETA (+ optional window)** + status on one appointment view. |

**Relation to “hybrid”:** Retired as a **third enum value**. Behavior lives under **queue** as **UX + copy + ETA**, not a parallel scheduling engine.

---

## 6. Patient-side dashboard & appointment UI (all modes)

A single **appointment detail / “my visit today”** experience should adapt by **doctor OPD mode**, while sharing a common **status model** where possible.

**Section map:** **§6.1** universal UI elements → **§6.2** slot-only behaviors → **§6.3** queue behaviors → **§6.4** dashboard/screens **planning** (both modes) → **§6.5** cross-cutting (notifications, tele).

### 6.1 Universal elements (every mode)

Patients should always understand:

| Element | Purpose |
|---------|---------|
| **My status** | e.g. Upcoming → Checked in / In queue → **Your turn soon** → In consultation → Completed / No-show. |
| **Where the doctor is (session context)** | Not stalking—**operational clarity**: “Doctor is currently with another patient” / “Serving **token 14**” / “In another appointment (slot **10:10–10:20**)” depending on mode and privacy settings. |
| **What to do next** | Join video / come to room / wait; **one primary CTA** that updates live. |
| **Mode hint** | Subtle copy: **fixed time (slot)** vs **queue** (order + **ETA** / optional **approx** window). |

**Privacy note:** Doctor identity + session type as today; “who” the doctor is with may be **anonymous** (“another patient”) unless clinic opts into token display for waiting room screens.

### 6.2 Slot-only — patient UI

| Topic | Behavior |
|-------|----------|
| **Scheduled time** | Show booked slot start (and end if applicable); timezone clear. |
| **What “slot” means (booking copy)** | Per **§5.1b** clinic policy: e.g. **scheduled window** vs **exclusive block until end**—set expectations so **early join for the next patient** does not contradict **paper end time** (see **§5.1b**). |
| **Early finish → next patient** | **Not preponement** of the calendar: do **not** silently change the appointment time. Offer **“Doctor is ready — you may join early”** (push + in-app) to **B** only when **A’s** consult is **completed** in workflow per policy. Patient **accepts** or **declines**; if decline, original slot still valid. |
| **A vs B (paper time dispute)** | If policy allows **tail add-on** for **A**: only while **visit active** and **before B accepts** early join; otherwise direct **A** to **post-consult return** flow or **grace/overflow** per settings. |
| **Delays** | If current running past next slot’s start: **delay notifications** (push/SMS per prefs) + **banner** on patient appointment screen: e.g. “Running about **15 minutes** late”; optional **revised ETA** (now + delay, capped by honesty). |
| **Live position** | Order among **today’s booked slots** for that session (e.g. “2 patients ahead before your slot”) if data available—optional enhancement. |

### 6.3 Queue / token — patient UI

| Topic | Behavior |
|-------|----------|
| **Token & position** | Show **token number** and **people ahead** (or “next in line”). |
| **Estimated wait / time** | **ETA** = f(people ahead, **estimated consult duration**). **Estimated duration** = **rolling average** of completed consult lengths for that doctor (session-weighted or global to doctor); update as more consults complete. Display: **point ETA** and/or **time range** to set expectations when variance is high. |
| **Cold start (no history)** | Use **default prior** (specialty default or doctor-configured “typical consult minutes”); label “estimate improving over time.” |
| **Where doctor is** | “Now serving **token 21**” (or anonymous equivalent) so patient can mentally reconcile ETA. |
| **Delays** | If ETA slips past original estimate materially, **notify** + refresh ETA (same pipeline as slot delays). |
| **Approximate window / “around …”** | Optional display next to token: e.g. “Token **8** · Expected around **10:25–10:40**” — same ETA engine; window is **informational**. |
| **Early join (queue)** | If previous finishes early: optional **join early** for **next in line**—still **respects token order**; does not create a fake slot booking. |
| **When forecast slips** | Honest **updated ETA** + “later than first expected” copy; don’t blame the patient. |

### 6.4 Patient dashboard — structure, screens & states (planning)

This subsection is the **implementation-facing plan** for patient-facing UI: what to build so **slot** and **queue** stay consistent with **§6.1–6.3** and **§5**.

#### Information architecture

| Surface | Role |
|---------|------|
| **Appointments list / home** | Cards for **upcoming** visits: show **mode** (slot vs queue), **date**, **key line** (e.g. “Tue 10:00–10:15” vs “Token **12** · ~25 min wait”). Tap → **appointment detail**. |
| **Appointment detail (“my visit today”)** | **Single source of truth** for live state: status, session context, **one primary CTA**, banners (delay, early invite). Prefer **polling** or **websocket** for live updates. |
| **Optional hub** | “Today’s OPD” if multiple sessions; else detail-first. |

#### Shared building blocks (both modes)

| Component | Notes |
|-----------|--------|
| **Header** | Doctor name, specialty, session **date**; optional **mode badge** (“Fixed slot” / “Queue”) so patients know how to read the screen. |
| **Status** | Shared **lifecycle** where possible: `upcoming` → `ready_or_waiting` → `your_turn_soon` → `in_consultation` → `completed` / `missed` / `cancelled`. Exact labels differ by mode (see below). |
| **Session line** | **Slot:** “Your slot: **10:00–10:15**” + timezone. **Queue:** “Token **8** · **3** ahead” + **ETA** / range. |
| **Doctor / queue context** | One line: e.g. “Doctor is in another visit” / “Now serving **token 21**” (privacy-safe). |
| **Primary CTA** | One dominant action: **Join video** / **Prepare to join** / **Wait** — state-driven. |
| **Secondary** | Reschedule (if allowed), **policy** link (grace, missed, refund), **need help** / contact. |
| **Banners** | **Delay**, **early invite** (when applicable), **running late** — stack clearly; one **dominant** message. |

#### Slot mode — screen states (patient)

Map UI to **§6.2** / **§5.1a–5.1b**.

| State | What the patient sees (summary) |
|-------|----------------------------------|
| **Upcoming** | Scheduled **start–end** (or start + duration); countdown or calendar; **what “slot” means** (link/short copy per policy). |
| **Grace / late** | If within **grace** window: “You can still join.” If **late** per policy: warning → **missed** path. |
| **Your turn / join** | **Join** CTA live; optional **prepare** (mic/cam). |
| **In consultation** | In-call UI; minimal duplicate scheduling noise. |
| **Completed** | Summary, next steps, **post-consult return** entry (“Need something else from this visit?”) if product supports. |
| **Running late (doctor)** | **Banner** + optional **revised** expectation (not fake precision). |
| **Early invite (you are next, B)** | **“Doctor is ready — join early?”** opt-in; **not** silent calendar change. |
| **Missed / no-show** | Honest copy; **rebook** / **reschedule** CTA per **§5.1a**; payment messaging per clinic config. |

#### Queue mode — screen states (patient)

Map UI to **§6.3** / **§5.2**.

| State | What the patient sees (summary) |
|-------|----------------------------------|
| **Upcoming / token issued** | **Token #**, **people ahead**, **ETA** or **range**; **cold-start** copy if needed. |
| **Waiting** | Refreshing ETA; **now serving** line; optional **approx “around …”** window. |
| **Your turn soon / staged** | **Virtual waiting room** or “get ready”; optional **join link** arms when **near turn** (tele). |
| **In consultation** | Same as slot. |
| **Completed** | Same as slot. |
| **ETA slipped** | **Updated ETA** + apology-free factual copy. |
| **Missed turn** | **Rejoin** / **end of queue** per policy; **notify** if position changes. |
| **Early join (queue)** | **Next in line** invited when previous ends — **opt-in**; preserves **order**. |

#### Dashboard vs detail (product choice)

- **Minimal:** list + **one** detail screen with **state machine** above.  
- **Richer:** **today strip** on home (next appointment only) + detail.  
- **Push / in-app:** deep-link to **appointment id** + **state** so patient lands in the right CTA.

#### Empty & error

- **No upcoming appointment:** CTA to book / message clinic.  
- **Session full / slot unavailable:** Clear error from API; suggest **another day** or **queue** if doctor offers both later.

### 6.5 Cross-cutting patient features

- **Notification prefs:** Delay, “your turn soon,” early-invite (per channel where available).
- **Tele vs in-person:** Same logical UI; tele emphasizes **join link** activation when **called or imminent**.

---

## 7. Edge Cases & Rules (Cross-Mode)

Document behavior explicitly for implementation and support (complements §5–6):

- **Overrun:** Current patient exceeds expected time → update downstream ETAs / delay messages; slot mode triggers delay pipeline.
- **No-show / skip / missed slot:** **Queue:** advance token; re-insert per policy. **Slot:** do **not** treat like queue reorder—**§5.1a** (grace, forfeit, reschedule, overflow, extra slot); free + optional early invite only if slot released.
- **Full session:** Stop new tokens or new bookings; waitlist policy (future).
- **Walk-in vs booked:** If both exist in one practice, priority rules (future phase).
- **Early invite:** Distinct from **reschedule**—appointment record keeps original scheduled time unless staff explicitly edits.
- **Slot + early join + “paper time”:** **§5.1b** — **next** patient early invite only **after current visit completed** (unless clinic policy is **strict** hold-until-slot-end); avoid implying **exclusive** block until end if product allows **early join** for **next**.
- **Missed turn / re-queue:** **Queue:** re-insert per §5.2. **Slot:** **§5.1a** — not “move my 10:00 to end” without **rebook** / **overflow** / **doctor-approved** slot; **“I’m back after my turn was skipped”** — see §5.2 table.
- **Post-consult return** (visit already done; “forgot to ask” / new minor complaint): distinct from missed turn—see §5.2 **post-consult return**; default operational pattern **after current patient**; product event type + optional addendum vs new visit.

---

## 8. Engineering Scope (High Level)

Workstreams should stay aligned with the **selected mode** end-to-end (no half-implemented paths).

### 8.1 Data model

- Doctor (or session) **OPD mode** enum: **`slot` | `queue`** only (queue carries ETA + optional soft-window UX; no separate `hybrid` value).
- Mode-specific fields: session windows, max patients, slot duration, token counters, etc.
- **Consult duration telemetry:** store completed consult start/end (or duration) for **rolling average** used in **queue** ETAs (privacy/compliance as per product).
- Migrations and backward compatibility for existing doctors (default strategy: e.g. **slot** if today’s product is slot-first).

### 8.2 APIs

- CRUD for doctor OPD settings; validation per mode.
- Booking / join endpoints branch by mode (reserve slot vs issue token / queue rules).
- **Patient-facing:** session snapshot endpoints (current token/slot, delay offset, early-invite eligibility) for live appointment UI.

### 8.3 Booking bot & patient flows

- Copy and steps differ by mode (confirm time vs token + ETA / soft “around …” messaging).
- Error messages: full queue, session ended, slot conflict—mode-appropriate.

### 8.4 Doctor dashboard / staff UI

- **Slot mode:** Calendar / slot grid as today (extended as needed); **invite next patient early** only per **§5.1b** workflow (typically after **mark visit complete**); **mark delay** / auto-delay from overrun; optional **grace slot** / overflow controls.
- **Queue mode:** Live queue, call next, mark done/skip; session controls; **ETA / optional expected window** panel; tools for delay broadcast.

### 8.5 Notifications

- Reminders, “your turn soon,” **delay** alerts, **early-invite** pushes—wired per mode and doctor/patient preferences.

### 8.6 Patient app / appointment UI (implementation)

- Mode-aware **appointment detail** screen: status, **where doctor is in session**, CTAs (join / wait).
- **Slot:** delay banner + revised ETA; **early join** opt-in flow for **next** patient per **§5.1b**; booking copy aligns **slot contract** with early join; does not mutate scheduled time without explicit reschedule.
- **Queue:** token, position, **ETA from rolling average** (with cold-start fallback); optional **approximate window** copy.
- Websocket or polling for **live** updates where product requires low latency.

---

## 9. Phasing (Suggested)

| Phase | Focus | Outcome |
|-------|--------|---------|
| **P0** | Product spec lock: enums, copy, per-mode rules + **patient UI** patterns (§5–6) | Single source of truth doc + API sketch |
| **P1** | Schema + doctor settings API + default for existing users | Doctors can set mode; system stores it |
| **P2** | **Queue** path: token + session + doctor queue UI + **patient ETA** (rolling avg v1) | One full vertical slice |
| **P3** | **Slot** enhancements: delay pipeline + **early invite** + patient banners | Slot mode coherent with **§6.2** + **§6.4** (patient dashboard states) |
| **P4** | **Queue** polish: soft-window copy, DM alignment, “forecast slipped” messaging | Queue mode complete end-to-end |
| **P5** | Polish: ETAs confidence, waitlist, multi-session templates, specialty cold-start defaults | Scale and edge cases |

Order can shift if product is already slot-heavy—**P1** still unblocks everything. **P3/P4** can swap if slot UX is higher priority than queue polish.

---

## 10. Dependencies & Related Work

- **Appointments / Add Appointment** (dashboard) — slot assumptions today; must respect doctor OPD mode when **queue** ships in full.
- **Patient app / web appointment UI** — **§6.4** (screens/states) + **§6.1–6.3** behaviors; live session state, notification plumbing.
- **Analytics / telemetry** — Completed consult durations for **rolling average ETA** (queue); retention and consent policy.
- **RLS / admin** — Any doctor-created appointments or overrides should align with the same mode rules.
- **Payments / verification** — Usually orthogonal; ensure “appointment” vs “visit” semantics stay consistent per mode.

---

## 11. Open Questions

- [ ] Default mode for **new** signups: slots (simplest) vs queue vs region-based default?
- [ ] Can a doctor **switch** mode mid-day or only between sessions? (Recommend: **between sessions** or **next day** to avoid inconsistent patient expectations.)
- [ ] **Tele vs in-person** — same mode picker or tele always slot-first?
- [ ] **Multi-location:** per location override timeline?
- [ ] **Rolling average:** minimum N consults before hiding “estimate improving” copy? Per-session vs all-time weighting?
- [ ] **Early invite:** legal/consent for push when patient did not opt in to marketing messages (transactional only)?
- [ ] **Queue — soft window:** can displayed “around …” ever auto-shift, or only **ETA** text / range updates?
- [ ] **Slot contract:** default policy — **window until visit ends** vs **strict hold until slot end** for **early join** to next patient?

---

## 12. Success Criteria

- Doctor can **choose** OPD mode and sees **consistent** behavior in settings, **patient** journey, and dashboard.
- **Patient UI** reflects mode: slot (time + delay + optional early join **aligned with §5.1b**); queue (token + **ETA** + optional approx window + doctor session context).
- **Slot** booking copy and **early join** behavior are **consistent** (no “paper time” dispute by design where avoidable).
- **Queue** never implies a **fixed** calendar slot unless the doctor chose **slot** mode.
- Documentation and support can explain **two** modes without a third “hybrid” label.

---

## 13. Implementation notes (shipped behavior — 2026-03-24)

| Topic | Where |
|--------|--------|
| DB: `opd_mode`, queue rows, policies | [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md), migrations `028`–`031` |
| Patient snapshot + polling + in-app hint types | [CONTRACTS.md](../../../../../Reference/CONTRACTS.md) § Patient OPD session snapshot; `backend/src/services/opd-snapshot-service.ts`, `opd-notification-hints.ts` |
| Booking / DM mode-aware copy | [APPOINTMENT_BOOKING_BOT_FLOW.md](../../../../../Reference/APPOINTMENT_BOOKING_BOT_FLOW.md) |
| Edge cases: grace join, no-show, requeue | [OPD_SUPPORT_RUNBOOK.md](../../../../../Reference/OPD_SUPPORT_RUNBOOK.md), e-task-opd-08 |
| Observability (OPD log-metrics) | [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md) — `opd_booking_total`, `opd_eta_computed_total`, `opd_queue_reinsert_total` |

---

## References

- Daily context: doctor-led OPD choice; **two modes** — slot vs **queue** (queue includes ETA + soft-time UX; former “hybrid” folded in).
- This doc: **§5** problems/solutions (**§5.1a** missed slot; **§5.1b** paper time vs early join); **§6** patient UI — **§6.4** dashboard/screens plan for **both modes**; **§6.2–6.3** slot vs queue behaviors.
- Related daily docs: `../README.md` (2026-03-24 payout initiative — separate track); appointment integration notes under `2026-03-23` if needed.

---

*Last updated: 2026-03-24 — added **§6.4** patient dashboard/screens planning (slot + queue); **§5.1b** / **§6.5** cross-cutting renumbered.*
