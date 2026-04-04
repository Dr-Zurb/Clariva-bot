# Capture system

Use this folder so ideas and “we should fix this” items do not get lost. Keep it **raw** here; turn serious work into **Daily-plans**, **GitHub issues**, or **Taskmaster** when you triage.

## Files

| File / folder      | Purpose |
|--------------------|--------|
| `inbox.md`         | Quick bullets. Default drop zone. |
| `TEMPLATE.md`      | Copy to `notes/YYYY-MM-DD.md` (or any name) for a longer dump. |
| `notes/`           | Optional dated or themed notes; keep `inbox.md` scannable. |

## How to capture

1. **Fast:** Open `inbox.md`, add `- [ ] Short description` (one line). Optional: `— context, link, or path`.
2. **Longer:** Copy `TEMPLATE.md` → `notes/2026-04-07-my-topic.md` (or today’s date + slug).
3. **With Cursor:** Say things like *“capture this: …”* or *“add to the capture inbox …”* — the agent rule will append to `inbox.md` unless you name another file under `docs/capture/`.

## Triage (weekly or before a sprint)

1. Open `inbox.md` and recent files in `notes/`.
2. For each item either:
   - **Promote** → `docs/Development/Daily-plans/...` task file, `task-master add-task`, or a GitHub issue; then remove or check off the capture line.
   - **Defer** → leave unchecked or add a note such as “review after June”.
   - **Drop** → delete; not everything needs to live forever.

## Conventions

- Use `- [ ]` for open items; `- [x]` when done or fully promoted elsewhere.
- Prefer **one idea per line** in `inbox.md`; split with a dated note if it explodes.
- Link to code with backtick paths: `` `backend/src/...` ``.

## Relation to Daily-plans & Taskmaster

- **Capture** = parking lot (low friction).
- **Daily-plans** = what you intend to execute in a window.
- **Taskmaster** = structured tasks when you want dependencies, expand, and status.

Flow: **capture → triage → Daily-plans or Taskmaster**.
