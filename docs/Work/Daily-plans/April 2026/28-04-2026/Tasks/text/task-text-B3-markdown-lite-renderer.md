# Task text-B3: Markdown-lite renderer (5 inline + 1 block; XSS-safe by construction)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today every message body renders as plain text. Doctors who type `**important**` or `- item 1\n- item 2` get the literal asterisks / hyphens rendered, not the formatting. Adding markdown-lite (a small allow-list — not full CommonMark) gives the chat surface a real polish boost while keeping the security surface tiny.

Allow-list (the entire grammar):

| Pattern | Renders as | Example |
|---------|-----------|---------|
| `**bold**` | `<strong>` | `**important**` |
| `*italic*` or `_italic_` | `<em>` | `*soft*` |
| `~~strike~~` | `<s>` | `~~typo~~` |
| `` `inline code` `` | `<code>` | `` `dose 5mg` `` |
| `[label](url)` | `<a target="_blank" rel="noopener">` — **only** for `https://` URLs | `[ref](https://example.com)` |
| `- item` / `* item` (block) | `<ul>/<li>` (each contiguous run becomes one list) | `- A\n- B` |

**Critically: the renderer is XSS-safe by construction.** It never accepts arbitrary HTML; it tokenises the body string, builds React VDOM nodes from the tokens, and never calls `dangerouslySetInnerHTML`. No `marked` / `markdown-it` dependency.

This task lands the renderer inside `<MessageBubble>` (B2 must have shipped first) so quoted-parent previews (B4), reaction trigger surfaces (B5), pinned banner copy (B7), etc. all inherit the same body rendering vocabulary.

**Estimated time:** ~5 hours.

**Status:** Done (2026-05-23).

**Depends on:** [task-text-B2](./task-text-B2-message-bubble-extract.md) (hard — renders inside `<MessageBubble>`). [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) is **not** required (no schema change).

**Soft-blocks:** B4 (quoted-parent inherits this renderer for the parent body preview), B7 (pinned banner shows a body excerpt that should render markdown), B6 (edit preview re-renders through the same path).

**Source plan:** [T2 §T2.13](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

- [x] **`renderMarkdownLite(body: string, opts?: { compact?: boolean }): React.ReactNode` function** exported from `frontend/lib/text/markdown-lite.tsx`. Pure; no React state. `compact: true` skips block-level rendering (no `<ul>`) — used by quoted-parent previews and pin-banner excerpts.
- [x] **Tokeniser** — single regex pass per pattern, ordered:
  1. Block-level lists (`/^[-*]\s+(.+)$/gm` matches; consecutive lines collapse into one `<ul>`).
  2. Inline patterns applied to each non-list paragraph in order: inline code first, then `**...**`, `*.../_..._`, `~~...~~`, `[...](https://...)`.
- [x] **Link renderer** — produces `<a href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">`. **REJECTS any URL not starting with `https://`.** A `[click](javascript:...)` or `[click](http://...)` falls through as plain text (the original `[label](url)` literal).
- [x] **Inline code renderer** — `<code className="rounded px-1 bg-gray-100 text-sm font-mono">`. **No syntax highlighting.**
- [x] **List renderer** — only one level of nesting (no nested lists). A line `  - sub` is treated as a literal hyphen-prefix, not a sub-list. Keep the grammar tiny.
- [x] **Newlines preserved** in non-list paragraphs via literal `\n` text nodes; parent `.message-body` keeps `whitespace-pre-wrap` (MessageBubble).
- [x] **No `dangerouslySetInnerHTML` anywhere in the renderer.** Pin this with a unit-test assertion (`expect(componentSource).not.toContain('dangerouslySetInnerHTML')`).
- [x] **Optional Slack-style toolbar in `standalone` layout only** — small button row above the composer with `B / I / S / </> / link / list` buttons that wrap the current selection in the corresponding markers. Controlled-textarea selection-replacement via `applyMarkdownToolbarAction`. **Hidden in `panel` and `canvas`** (narrow-width; the toolbar would crowd them out).
- [x] **Three-host parity** — body rendering identical in all three layouts; only the toolbar differs.
- [x] **`mode='readonly'`** — toolbar is hidden (composer is gone); body rendering still applies (history view benefits from formatted bodies).
- [x] **Unit tests** at `frontend/lib/text/__tests__/markdown-lite.test.tsx` covering:
  - Each of the 5 inline patterns renders correctly.
  - Block list collapse: 3 consecutive `- a\n- b\n- c` → one `<ul>` with 3 `<li>`.
  - `[click](javascript:alert(1))` renders as plain text — no `<a>`, no `javascript:` in the output DOM.
  - `<script>alert(1)</script>` in the body renders as plain text (escaping correct).
  - `compact: true` skips list rendering; lists render as plain text.
  - Asterisks inside code spans are NOT bolded (`` `**not bold**` `` stays literal).
- [x] **`<MessageBubble>` wires the renderer** — text bodies use `renderMarkdownLite(m.body)` inside the existing `.message-body.whitespace-pre-wrap` bubble.
- [x] Frontend type-check + lint clean. Manual smoke: send `**bold** and _italic_ with a [link](https://example.com)\n- list 1\n- list 2`; verify all five render correctly; send `<script>alert(1)</script>` and `[xss](javascript:alert(1))`; verify both render as text.

---

## Out of scope

- Full CommonMark / GFM compatibility (tables, code blocks with language hints, headers, blockquotes). Each is a Decision change with its own attack surface.
- Image embedding via `![alt](url)`. Images live in the attachment path, not in markdown.
- Mentions (`@user`). 2-party chat — no mentions semantics.
- Emoji shortcodes (`:smile:` → 😊). Out of scope.
- Markdown-in-quoted-parent expanding the original body. Quoted parent uses `compact: true` (no list rendering, plain inline only — the parent's full markdown is one tap away).
- Per-user-toggle for "render markdown vs raw". Always-on; the user can escape by typing `\*` (which is also out of scope — bare asterisks remain bare in v1).

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/markdown-lite.tsx` — **new** (~120 LOC tokenise + render).
- `frontend/lib/text/__tests__/markdown-lite.test.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (swap body render call).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (toolbar in `standalone` only; ~30 LOC).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why no library** — `marked` / `markdown-it` ship MB of CommonMark logic we don't want, and historically each library has had at least one CVE involving link-protocol smuggling. Owning the (tiny) tokeniser is safer.
2. **Asterisk inside word** — `5*5=25` should NOT bold "5". The italic pattern requires `*` to NOT be adjacent to a word character on the inside-word side (`/(?<![a-z0-9])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![a-z0-9])/i`). Test for this.
3. **Inline code escapes** — text inside `` `...` `` is rendered verbatim, including asterisks. Apply inline-code tokenisation FIRST so other patterns don't see the inner text.
4. **Link target restriction to `https://`** — relative paths (`/dashboard/...`) and `mailto:` are rejected. Doctors might want to drop a `mailto:` someday; defer that decision.
5. **Toolbar button copy** — short single chars (`B`, `I`, `S`, `</>`, `🔗`, `≡`) keep it dense. Tooltips on hover with full names.
6. **Reverse-engineer storage of newlines** — the DB stores `\n` literals; rendering must respect them. `whitespace-pre-wrap` is the cleanest mechanism.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.13](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Hard dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md) (renders inside `<MessageBubble>`).
- **Used by:** [task-text-B4](./task-text-B4-reply-to-message.md) (`compact: true` for quoted parent), [task-text-B7](./task-text-B7-pinned-messages.md) (`compact: true` for banner excerpt).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
