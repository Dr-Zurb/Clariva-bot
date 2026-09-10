# Task ckd-03: Browser fullscreen toggle

**Program / Phase:** cockpit-density · Phase 1  
**Status:** done — 2026-08-31  
**Change Type:** Update existing

**Current State:**
- ✅ `requestDocumentFullscreen` exists for patient-phone (`patient-mobile-chrome.ts`)
- ✅ `VideoRoom` fullscreens the stage element
- ❌ No cockpit-wide document fullscreen

**Design Constraints:**
- CKD-DL-4: user gesture required. Button + optional hotkey. Not on route enter.
- Target the dashboard root (`#dashboard-shell`), not the video stage.
- If cockpit already owns fullscreen, VideoRoom expand must not steal it (use fill-tab only).
- Esc / browser exit restores windowed chrome-hidden cockpit.

**Acceptance:**
- Palette (or header kebab) toggles document fullscreen.
- Video expand while cockpit-fullscreen does not call `stage.requestFullscreen`.
