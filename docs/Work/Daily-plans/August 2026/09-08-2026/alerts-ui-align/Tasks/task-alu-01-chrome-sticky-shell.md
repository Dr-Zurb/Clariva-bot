# alu-01 — Drop Card, sticky band, list shell, shadcn

> **Model:** Auto  
> **Depends:** —  
> **Plan:** [plan-alerts-ui-align-batch.md](../plan-alerts-ui-align-batch.md) · ALU-D1–D4, D6, D8

## Goal

Alerts matches OPD/Patients/Inbox outer chrome.

## Work

1. `page.tsx`: `flex flex-col gap-3` (drop `space-y-6`).
2. `DoctorDashboardEventFeed.tsx`: remove `Card` / “Notifications” title; sticky band for Mark all + Show acknowledged; list shell `rounded-lg border-border/50`; shadcn `Button` / `Checkbox`.

## Out of scope

Empty dashed block, route skeleton (alu-02).

## Done when

- No nested Card title.
- Sticky band + rounded-lg shell + shadcn controls.
