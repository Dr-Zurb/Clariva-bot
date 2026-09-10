# 13 Aug 2026

| Program | Path | Notes |
|---------|------|--------|
| **patient-health-hub** | [`patient-health-hub/`](./patient-health-hub/) | Patients can retrieve their own visits, prescriptions, and reports on request — no account, per-doctor scope, OTP-gated. Charter locked; phases not planned yet. Blocked on `consult-room-checkin` closing. |

---

**Consult room check-in** phases p2–p4 (planned today) live under [`../12-08-2026/consult-room-checkin/`](../12-08-2026/consult-room-checkin/) — same program folder as p1, per the cross-day rule.

| Phase | Ships |
|-------|-------|
| [`p2-presence-correctness/`](../12-08-2026/consult-room-checkin/p2-presence-correctness/) | `/my-visit` snapshot auto-refresh + voice/text heartbeat — coding shipped 2026-08-22; founder smoke open |
| [`p3-device-precheck/`](../12-08-2026/consult-room-checkin/p3-device-precheck/) | Device check moves into the lobby, before the doctor starts |
| [`p4-realtime-and-channel-gaps/`](../12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/) | Realtime presence, Facebook fan-out, lobby reconnect |

---

**Created:** 2026-08-13.
