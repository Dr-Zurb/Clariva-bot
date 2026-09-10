# Task lvc-15: Phase 3 gate

**Program / Phase:** last-visit-context · Phase 3
**Status:** Drafted
**Change Type:** Tests + docs

Prove a cockpit open fires one last-visit fetch (`last-visit-summary`), served from the queue-hover prefetch cache. `PreviousRxPopover` is gone. Carry-forward and vitals ghosts do not call `last-subjective` or `last-in-episode`.

First visit still renders nothing. Display still writes nothing.

Do not claim Shipped if repo-wide `tsc` / lint are dirty.
