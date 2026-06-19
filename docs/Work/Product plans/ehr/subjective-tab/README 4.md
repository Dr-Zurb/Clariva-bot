# Subjective tab — product plan (one-stop folder)

## The Cockpit-v3 "Subjective" tab: complaint cards + patient history, built for fast data entry

This folder owns the design + build plan for the **Subjective** tab of the Cockpit-v3
consultation cockpit. It is a focused sub-area of the broader [EHR roadmap](../README.md)
(it touches the same `prescriptions` artifact and reuses T2's speed infrastructure).

The core thesis: **the Subjective tab is the most-typed surface in the whole EHR, and
typing is the enemy.** Every field must be tappable, pre-filled, or carried forward —
free text is the last resort.

---

## File index

| File | Purpose |
|------|---------|
| [plan-subjective-tab.md](./plan-subjective-tab.md) | The concrete plan: scope, field inventory, own-vs-linked split, data model, fast-entry strategy, items `ST.1–ST.10`, phasing, risks. |

---

## 60-second summary

- **What lives here (owned, per-visit, new):** Chief complaint(s) + HPI as a **list of complaint cards** (OLDCARTS, complaint-type aware), plus **Family history**, **Social/Personal history**, **Past surgical history**.
- **What is linked (patient-level, already shipped):** **PMH / chronic conditions** (`patient_chronic_conditions`), **Allergies** (`patient_allergies`), **current medications** — surfaced read-only + quick-edit inside the tab, *not* re-entered.
- **Deferred:** Review of Systems (ROS), ICE, AI/voice scribe.
- **Backward-compat:** `cc` / `hopi` become **derived** from the complaint cards so the PDF / SMS / snapshot keep working untouched.
- **Fast entry everywhere:** favorite chips, autocomplete (complaint master), copy-forward from last visit, subjective presets, smart-confirm defaults, autosave.

---

## Conventions

- **Status legend:** `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.
- **Item IDs:** `ST.1`, `ST.2`, … (Subjective Tab), never renumbered.
- **Decision IDs:** `ST-D1`, `ST-D2`, … (distinct from EHR `E#` and tier `T#-D#`).

---

**Created:** 2026-06-03.  
**Owner:** TBD (picks at commit time).
