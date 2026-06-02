# `/dev/*` — developer-only smoke fixtures

Pages under this folder are mounted ONLY for manual verification of
content-agnostic primitives that don't lend themselves to RTL / Vitest
tests (drag, resize, ResizeObserver, real pointer events, etc.). They:

- are NOT linked from any production navigation;
- do NOT call backend APIs;
- mount static placeholders against the real component runtime so the
  authoring team can verify behaviour end-to-end against the real
  `react-resizable-panels` v4 library + a real ResizeObserver.

The middleware (`frontend/middleware.ts`) does not auth-gate `/dev/*`
because none of these pages read user data — they are pure
local-renderer fixtures. They remain unindexed by virtue of not being
linked from anywhere; if a `/dev/` page ever needs to be hidden in
production, add a runtime gate (e.g. `if (process.env.NODE_ENV !==
'development') notFound()`).

## Current fixtures

_None — the cv2-01 `/dev/shell-tree-smoke` page was removed in cv2-08
after Wave 2 verification. Add a new fixture here when the next batch
needs a manual shell-only smoke route._
