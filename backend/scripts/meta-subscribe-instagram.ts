/**
 * Re-subscribe Instagram Login accounts to app webhooks (messages/comments).
 * Uses tokens from doctor_instagram (service role).
 *
 * Run: npm run meta:subscribe:ig
 */

import { getSupabaseAdminClient } from '../src/config/database';
import { subscribeInstagramAccountApps } from '../src/services/instagram-connect-service';
import axios from 'axios';

async function main() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error('Supabase admin client unavailable');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('doctor_id, instagram_page_id, instagram_access_token, instagram_username')
    .limit(20);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.error('No doctor_instagram rows found');
    process.exit(1);
  }

  for (const row of data) {
    const pageId = String(row.instagram_page_id ?? '').trim();
    const token = String(row.instagram_access_token ?? '').trim();
    const username = row.instagram_username ?? '(unknown)';
    console.log(`Account @${username} id=${pageId}`);

    if (!pageId || !token) {
      console.error('  skip: missing page id or token');
      continue;
    }

    try {
      const getUrl = `https://graph.instagram.com/v18.0/${encodeURIComponent(pageId)}/subscribed_apps`;
      const current = await axios.get(getUrl, {
        params: { access_token: token },
        timeout: 10000,
        validateStatus: () => true,
      });
      console.log('  current:', current.status, JSON.stringify(current.data));
    } catch (err: unknown) {
      console.log('  current fetch failed:', err instanceof Error ? err.message : err);
    }

    const postUrl = `https://graph.instagram.com/v18.0/${encodeURIComponent(pageId)}/subscribed_apps`;
    const post = await axios.post(
      postUrl,
      null,
      {
        params: {
          subscribed_fields: 'messages,comments,messaging_postbacks,message_reactions',
          access_token: token,
        },
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    console.log('  subscribe POST:', post.status, JSON.stringify(post.data));

    // Also exercise the service helper (same call; logs structured warn on failure).
    await subscribeInstagramAccountApps(pageId, token, `meta-subscribe-ig-${Date.now()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
