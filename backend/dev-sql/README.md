# Dev SQL (manual)

Paste into Supabase → SQL Editor. **Not** schema migrations — leave `backend/migrations/` alone.

Convention: one scenario folder → `apply.sql` + `delete.sql` (fixed UUIDs so delete is safe to re-run).
