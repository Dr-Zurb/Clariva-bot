# Business — run the company

This is where the **whole business** is managed: legal, bank, GST, trademark, Meta review, customers, pricing — and the month / week / day ritual that keeps it in one place.

It is separate from [`Daily-plans/`](../Daily-plans/), which holds *engineering batches* (dated program folders with `Tasks/`). Those are the specs an agent executes. Start the week here; let it feed Daily-plans when something needs to be built.

```
Business/
├── README.md            ← this file: the rituals
├── tracks.md            ← every open thread, one "next action" each  (the memory)
├── rhythm.md            ← default character of each weekday
├── TEMPLATE-month.md
├── TEMPLATE-week.md
├── TEMPLATE-day.md
├── TEMPLATE-pending.md
├── TEMPLATE-postponed.md
└── <YYYY>/
    ├── months.md        ← year index (one line per month)
    └── <Month>/
        ├── month.md     ← the month plan
        └── W<NN>-<Monday>/
            ├── 0-week.md  ← Sunday preplan + week review
            ├── 1-mon.md
            ├── 2-tue.md
            ├── …
            ├── 7-sun.md
            ├── pending.md    ← leftovers that still belong this week
            └── postponed.md  ← taken off a day on purpose; not leftovers
```

A week folder lives in the **month of that week's Monday**. W36 (Mon 31 Aug) is August. W40 (Mon 28 Sep) is September.

## The rituals

| When | Ritual | File | Budget |
|------|--------|------|--------|
| **Last Sunday of the month** | Month plan | `<Month>/month.md` | 15 min |
| **Sunday night** | Week preplan | `W<NN>/0-week.md` | 20 min |
| **Every morning** | Day plan | `1-mon.md` … `7-sun.md` | 5 min |
| **Every night** | Shutdown | same day file | 5 min |

### Month plan
Fill `month.md` on the last Sunday of the previous month. One outcome for the month. The week's one outcome must serve it. Index: [`2026/months.md`](./2026/months.md).

### Sunday night — preplan the week
1. Read [`tracks.md`](./tracks.md) top to bottom.
2. Open the pre-created `0-week.md` (or copy [`TEMPLATE-week.md`](./TEMPLATE-week.md) + seven [`TEMPLATE-day.md`](./TEMPLATE-day.md) files). Start date = that Monday. Compute the ISO week — don't guess.
3. Check this month's `month.md`. The week's one outcome should serve it.
4. Pick **one** weekly outcome. Not three. One.
5. List the **queue pushes**. These get fired Monday. See [`rhythm.md`](./rhythm.md).
6. Write the **Not this week** list.

### Morning — plan the day
Open today's `1-mon.md` … `7-sun.md` before opening any code. Top 3 max. Honest OPD hours.

### Night — shut down
Fill that day's **Night** block. The only mandatory field is **tomorrow's first move**. Park new threads: code → [`capture/inbox.md`](../capture/inbox.md), business → [`tracks.md`](./tracks.md).

## Rules that keep this alive

- **`tracks.md` is the memory.** `month.md` / `0-week.md` / `1-mon.md` are the commitment.
- **Every track has exactly one next action**, small enough to do in one sitting.
- **Queue pushes before build work.** External asks go out Monday.
- **Missing a day is fine, backfilling is not.** Leave the gap.
- **Don't put business threads in `capture/inbox.md`.** That file is an engineering follow-up ledger.
- **Don't invent dates or legal facts.** Use `⟨fill⟩` or ask the CA/attorney.

## Weekly review (Friday or Sunday)

Fill the `Week review` in `0-week.md`, dump leftovers into that week's `pending.md`, move deliberately-later items into `postponed.md`, then push changes back into `tracks.md`.

Index: [`../README.md`](../README.md)
