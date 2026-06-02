# Task text-C7: PWA share-intent receive (manifest `share_target` + SW POST intercept + `/c/share-target` route)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When the patient has installed the PWA on Android, sharing an image / PDF from any app's share sheet (Camera, Gallery, Files, Drive) should land in the chat. Today, the patient has to leave the source app, open the PWA, then tap attach + navigate to the file — clunky.

This task wires the **Web Share Target Level 2 API**:

1. Manifest declares `share_target` with `method: 'POST'`, `enctype: 'multipart/form-data'`, accepting images and PDFs.
2. Service worker intercepts the POST to `/c/share-target` and writes the file to a temporary cache.
3. Frontend route `/c/share-target` reads from the cache, looks up the patient's most recent active text consult (if exactly one is active), and pre-loads the file into that consult's composer attachment queue. If multiple actives or none, shows a chooser screen.
4. After dispatching to the consult, the cache entry is cleared.

**iOS unsupported.** The Web Share Target API is not implemented on iOS Safari. Document the degradation: iOS users still use the in-composer file picker.

**Estimated time:** ~6 hours.

**Status:** Done (2026-05-24).

**Depends on:** None hard. [task-text-B8](./task-text-B8-multi-attachment-composer.md) is a soft-dep (the composer queue is what we hand the file to).

**Source plan:** [T6 §T6.42](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

### Manifest

- [x] **`frontend/public/manifest.json` extended** with:
  ```json
  "share_target": {
    "action": "/c/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "files": [
        { "name": "files", "accept": ["image/*", "application/pdf"] }
      ]
    }
  }
  ```
- [x] **Manifest validates** — verify with Chrome DevTools → Application → Manifest panel after PWA install. No warnings.

### Service Worker

- [x] **`frontend/public/sw.js` adds a POST intercept** for `/c/share-target`:
  ```js
  self.addEventListener('fetch', (event) => {
    if (event.request.method === 'POST' && new URL(event.request.url).pathname === '/c/share-target') {
      event.respondWith(handleShareTarget(event));
    }
  });

  async function handleShareTarget(event) {
    const formData = await event.request.formData();
    const files = formData.getAll('files');
    const cache = await caches.open('share-target-staging-v1');
    const stagedKeys = [];
    for (const file of files) {
      const key = `share-target-${crypto.randomUUID()}`;
      await cache.put(key, new Response(file, { headers: { 'Content-Type': file.type } }));
      stagedKeys.push(key);
    }
    // Redirect to the consult-chooser page; pass the staged keys as a query param.
    return Response.redirect(`/c/share-target?keys=${stagedKeys.join(',')}`, 303);
  }
  ```
  - 303 redirect because the spec requires it (POST → GET on the redirect target).
  - Cache name versioned (`-v1`) so we can invalidate cleanly in future SW updates.

### Frontend route

- [x] **`frontend/app/c/share-target/page.tsx`** new route. Behavior:
  1. On mount, parses `?keys=` from query.
  2. Reads each cached `Response` from `caches.open('share-target-staging-v1')` → `Blob`.
  3. Looks up the patient's active text consults via the existing patient-side API (whatever the patient consult-chooser page uses today; if no such API exists, query the patient's session list filtered by `modality='text'` and `status='live'`).
  4. **If exactly one active text consult:** redirect to `/c/text/{sessionId}?prefill_from_share=true`, with the blob keys persisted to `sessionStorage` under a known key (`share-target-pending-files`).
  5. **If zero active text consults:** render `No active text consult to share to. Open a consult first.` with a CTA to the dashboard.
  6. **If 2+ active text consults:** render a chooser list (rare; doctors might have parallel consults but patients typically don't).
- [x] **`/c/text/{sessionId}` route reads `share-target-pending-files`** on mount. If present:
  1. Read each cached blob.
  2. Convert to `File` objects (with the original MIME and a synthesized filename).
  3. Call `addAttachment` (B8) for each.
  4. Clear the `sessionStorage` key + the cache entries (`caches.open(...).then(c => c.delete(key))`).
- [x] **Cache cleanup** — TTL: stale entries (older than 30 minutes by `Cache-Control` or by manual purge) get deleted on next SW activation. Add a periodic cleanup in the SW's `activate` handler.
- [x] **Three-host parity / `mode='readonly'`** — the share-target route only ingresses files into a `live` consult; no readonly consideration.
- [x] **Cap respect** — the existing 5-attachment cap (B8) and 10 MB / file limit apply. Excess files surface a toast on the consult page.
- [x] **PHI hygiene** — never log file contents or filenames to console / Sentry beyond what existing attachment paths already do.
- [x] **iOS degradation documented** — README or in-app help text mentions that share-target is Android-only on installed PWA. Don't render any "Share to Clariva" preview on iOS — the system simply won't show it.
- [x] Type-check + lint clean (touched both `app/c/share-target/page.tsx`, `app/c/text/[sessionId]/page.tsx`, `public/sw.js`, `public/manifest.json`). Manual smoke (Android Chrome, PWA installed): take a photo in Camera; share → "Clariva" appears in share sheet; tap; lands on the consult; thumbnail in composer; tap Send.

---

## Out of scope

- **iOS implementation.** No supported mechanism.
- **Share-target on the doctor side.** Doctors don't consult on mobile-PWA in v1; if they do, this can be re-evaluated.
- **Share TEXT (not files).** The manifest allows it but the consult chat doesn't prefill text from share intents in v1; flag for future.
- **Cross-session share.** If the patient has 2+ active consults the chooser handles it; no "share to multiple consults at once".
- **Share-out** (sharing chat content to other apps). Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/public/manifest.json` — **edit** (add `share_target`).
- `frontend/public/sw.js` — **edit** (POST intercept + cache write + activate cleanup).
- `frontend/app/c/share-target/page.tsx` — **new** (~120 LOC; consult chooser + redirect).
- `frontend/app/c/text/[sessionId]/page.tsx` — **edit** (read sessionStorage + cache on mount; hand off to `addAttachment`).
- `frontend/lib/text/share-target-bridge.ts` — **new** (~50 LOC; helpers to read cache, convert blob → File, clear staging).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why redirect via 303 with query param instead of postMessage** — share-target POST intercept is stateless to the SW; the redirect target is what brings us back into the React app context where we can use `caches`. Spec-prescribed.
2. **Cache name versioning** — `share-target-staging-v1`. If the protocol changes, bump to v2 and ignore stale v1 entries.
3. **Why session-storage handoff between routes** — query-param-passing the cache keys works for the `/c/share-target` → `/c/text/...` redirect, but `sessionStorage` is more reliable for the same-origin read.
4. **Multiple-active chooser UX** — keep it simple: list of consults with doctor name + start time + "Share here" button per row.
5. **Error handling** — if the cache read fails (rare), toast `Couldn't attach the shared file.` and let the user re-try via picker.
6. **PWA install detection** — manifest `share_target` only takes effect after install. Document that the share sheet won't show "Clariva" until the patient installs.
7. **Cache size limits** — Chrome enforces ~6% of disk via the Cache API; 5 attachments * 10 MB = 50 MB. Way under the limit.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.42](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Soft-dep:** [task-text-B8](./task-text-B8-multi-attachment-composer.md) (composer queue).
- **Spec:** [W3C Web Share Target Level 2](https://w3c.github.io/web-share-target/level-2/).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24). iOS degradation documented in `frontend/README.md`.
