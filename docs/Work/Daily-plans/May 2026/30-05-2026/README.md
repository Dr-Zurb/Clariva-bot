# 30 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-30. **Structure:** each product plan gets one folder; phases live as `p{N}-<slug>/` subfolders inside it.

---

## Plans on this day

| Plan folder | Phases here | Product plan |
|---|---|---|
| [`cockpit-v3/`](./cockpit-v3/) | p0 scaffold · p1 shell · p2 dnd · p3 platform | [`plan-cockpit-v3.md`](../../Product%20plans/plan-cockpit-v3.md) |
| [`cockpit-pane-freedom/`](./cockpit-pane-freedom/) | p1 tabs · p2 dnd · p3 customize · p4 chrome | (predecessor program; see [`plan-cockpit-v3.md`](../../Product%20plans/plan-cockpit-v3.md)) |
| [`receptionist-rearchitecture/`](./receptionist-rearchitecture/) | p0 compliance · p1 foundation · p2 router · p3 channels · p4 state · p5 memory · p6 identity | [`plan-receptionist-rearchitecture-charter.md`](./receptionist-rearchitecture/plan-receptionist-rearchitecture-charter.md) |

---

## Program map

```
Pane freedom (all phases in cockpit-pane-freedom/)
  p1  cockpit-pane-freedom/p1-tabs/     (planned 28 May; docs consolidated here)
  p2  cockpit-pane-freedom/p2-dnd/
  p3  cockpit-pane-freedom/p3-customize/
  p4  cockpit-pane-freedom/p4-chrome/

Cockpit v3 (all phases in cockpit-v3/)
  p0  cockpit-v3/p0-scaffold/
  p1  cockpit-v3/p1-shell/
  p2  cockpit-v3/p2-dnd/
  p3  cockpit-v3/p3-platform/

Receptionist re-architecture
  receptionist-rearchitecture/   (p0-compliance → p6-identity)
```

---

## Sequencing notes

1. **Cockpit v3:** Phase 0 → 1 → 2 → 3 within [`cockpit-v3/`](./cockpit-v3/). Hard chain.
2. **Pane freedom:** Phase 1 → 2 → 3 → 4 within [`cockpit-pane-freedom/`](./cockpit-pane-freedom/).
3. **Receptionist:** Independent of cockpit; execute p0 → p6 within [`receptionist-rearchitecture/`](./receptionist-rearchitecture/) — see [`receptionist-rearchitecture/README.md`](./receptionist-rearchitecture/README.md).

---

## Adjacent reading

- **Product plan — Cockpit v3:** [`../../Product plans/plan-cockpit-v3.md`](../../Product%20plans/plan-cockpit-v3.md)
- **Pane freedom index:** [`./cockpit-pane-freedom/README.md`](./cockpit-pane-freedom/README.md)
- **Next day (31 May):** [`../31-05-2026/README.md`](../31-05-2026/README.md)
- **Capture inbox:** [`../../capture/inbox.md`](../../capture/inbox.md)
