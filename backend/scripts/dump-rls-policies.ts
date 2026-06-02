/**
 * Dump every RLS policy that mentions consultation_messages /
 * consultation_sessions / consultation-attachments. Service-role key
 * bypasses RLS, so we can read pg_policies via PostgREST.
 *
 * Usage:
 *   npx ts-node backend/scripts/dump-rls-policies.ts
 */

import 'dotenv/config';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(2);
  }

  const queries: { label: string; path: string }[] = [
    {
      label: 'consultation_messages policies',
      path: `/rest/v1/pg_policies?tablename=eq.consultation_messages&select=policyname,cmd,qual,with_check`,
    },
    {
      label: 'consultation_sessions policies',
      path: `/rest/v1/pg_policies?tablename=eq.consultation_sessions&select=policyname,cmd,qual,with_check`,
    },
  ];

  for (const q of queries) {
    console.log(`\n=== ${q.label} ===`);
    const res = await fetch(`${url}${q.path}`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
    const body = await res.text();
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`Body: ${body.slice(0, 500)}`);
      console.log(`(pg_policies isn't exposed by default — copy the SQL below into the dashboard SQL editor.)`);
      continue;
    }
    try {
      const rows = JSON.parse(body) as Array<Record<string, unknown>>;
      for (const row of rows) {
        console.log(JSON.stringify(row, null, 2));
      }
    } catch {
      console.log(body);
    }
  }

  console.log('\n--- Fallback SQL for the dashboard editor ---');
  console.log(`
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('consultation_messages', 'consultation_sessions')
ORDER BY schemaname, tablename, policyname;
`.trim());
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(2);
});
