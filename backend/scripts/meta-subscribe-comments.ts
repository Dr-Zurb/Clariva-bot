/**
 * Subscribe to Instagram/Messenger webhooks via Meta Graph API.
 *
 * NOTE: The Page API does NOT support "comments" - that field is invalid.
 * Comments must be configured in the App Dashboard (Instagram settings → Edit Subscriptions).
 * This script subscribes to: messages, message_edits (valid Page fields).
 *
 * Prerequisites:
 * - PAGE_ID: Facebook Page ID linked to your Instagram account (e.g. clariva_care)
 * - ACCESS_TOKEN: Page access token
 *
 * Run: META_PAGE_ID=... META_PAGE_ACCESS_TOKEN=... npm run meta:subscribe
 */

const PAGE_ID = process.env.META_PAGE_ID?.trim();
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN?.trim();
const API_VERSION = 'v18.0';

// Page API valid fields only (comments is NOT supported here - use Dashboard)
const SUBSCRIBED_FIELDS = 'messages,message_edits,message_deliveries,message_reads';

async function getCurrentSubscription(): Promise<{ success: boolean; data?: unknown }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/subscribed_apps?access_token=${ACCESS_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  return { success: res.ok, data };
}

async function subscribe(): Promise<{ success: boolean; data?: unknown }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}&access_token=${ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  return { success: res.ok, data };
}

async function main() {
  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error('Missing META_PAGE_ID or META_PAGE_ACCESS_TOKEN.');
    console.error('');
    console.error('Get them from Meta for Developers:');
    console.error('  1. Your App → Messenger API Settings → Instagram settings');
    console.error('  2. PAGE_ID: The Page ID for "Clariva Care" (or your Page name)');
    console.error('  3. ACCESS_TOKEN: Click "Generate token" for that Page');
    console.error('');
    console.error('Run: META_PAGE_ID=<id> META_PAGE_ACCESS_TOKEN=<token> npm run meta:subscribe');
    process.exit(1);
  }

  console.log('PAGE_ID:', PAGE_ID);
  console.log('Subscribing to:', SUBSCRIBED_FIELDS);
  console.log('');

  // Show current subscription first
  console.log('Current subscription:');
  const current = await getCurrentSubscription();
  if (current.success && current.data) {
    console.log(JSON.stringify(current.data, null, 2));
  } else {
    console.log('Could not fetch:', current.data);
  }
  console.log('');

  // Subscribe
  console.log('POST subscribed_apps...');
  const result = await subscribe();

  if (result.success) {
    console.log('Success:', JSON.stringify(result.data, null, 2));
    console.log('');
    console.log('Page subscription updated. Note: comments must be configured in Dashboard (Edit Subscriptions).');
  } else {
    console.error('Failed:', JSON.stringify(result.data, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
