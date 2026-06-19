# 03 June 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-06-03. **Structure:** each product plan gets one folder; phases live as `p{N}-<slug>/` subfolders inside it (see [`PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md)).

---

## Plans on this day

| Plan folder | Phases here | Product plan |
|---|---|---|
| [`subjective-tab/`](./subjective-tab/) | p1 complaint-cards · p2 fast-entry · p3 polish | [`plan-subjective-tab.md`](../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) |

---

## Program map

```
Cockpit-v3 Subjective tab (all phases in subjective-tab/)
  p1  subjective-tab/p1-complaint-cards/  ← structured complaint cards + owned histories + linked sections (subj-01..05)
  p2  subjective-tab/p2-fast-entry/       ← complaint master + favourites + carry-forward + presets (subj-06..08)
  p3  subjective-tab/p3-polish/           ← smart-confirm defaults + integration/a11y/gate (subj-09..10)
```

---

## Sequencing notes

1. **Subjective tab:** Phase 1 → 2 → 3 within [`subjective-tab/`](./subjective-tab/). Phase 1 (v1) is shippable on its own — structured complaint cards replace today's two raw CC/HOPI inputs, with `cc`/`hopi` derived for backward-compat. Phase 2 layers the fast-entry stack on top; Phase 3 polishes + gates.
2. **Builds on:** Cockpit-v3 (shipped — `SubjectivePane` / `SubjectiveSection` / `RxFormContext`), EHR T1 (`patient_allergies` / `patient_chronic_conditions`, shipped) and T2 (`drug_master` / `doctor_rx_templates` / `doctor_drug_favorites` / `useAutoSave`, shipped).

---

## Adjacent reading

- **Product plan — Subjective tab:** [`../../../Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md)
- **Subjective tab (all phases):** [`./subjective-tab/README.md`](./subjective-tab/README.md)
- **EHR roadmap:** [`../../../Product plans/ehr/README.md`](../../../Product%20plans/ehr/README.md)
- **Prior day (31 May):** [`../../May 2026/31-05-2026/README.md`](../../May%202026/31-05-2026/README.md)
- **Capture inbox:** [`../../capture/inbox.md`](../../capture/inbox.md)
