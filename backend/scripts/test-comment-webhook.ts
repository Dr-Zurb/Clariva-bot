/**
 * Test script to simulate Instagram comment webhooks.
 * Sends comment payloads to the webhook endpoint to verify classification and lead flow.
 *
 * Usage:
 *   npm run test:comment "want to book"
 *   npm run test:comment "lol"
 *   npm run test:comment -- --file test-comments.txt
 *
 * Env (optional):
 *   TEST_COMMENT_WEBHOOK_URL - default http://localhost:3000/webhooks/instagram
 *   TEST_INSTAGRAM_PAGE_ID   - doctor's Instagram page ID (e.g. 17841479659492101)
 *   TEST_COMMENTER_IG_ID    - commenter's IG user ID (real ID needed for DM to succeed)
 *
 * Note: Comment webhooks bypass signature verification when it fails, so this script
 * can send without a valid Meta signature.
 */

import 'dotenv/config';

const WEBHOOK_URL =
  process.env.TEST_COMMENT_WEBHOOK_URL || 'http://localhost:3000/webhooks/instagram';
const PAGE_ID = process.env.TEST_INSTAGRAM_PAGE_ID || '17841479659492101';
const COMMENTER_IG_ID = process.env.TEST_COMMENTER_IG_ID || '17841400000000000'; // placeholder
const MEDIA_ID = process.env.TEST_MEDIA_ID || '17889455560051444'; // placeholder post ID

function buildCommentPayload(commentText: string, commentId?: string): object {
  const id = commentId || `test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    object: 'instagram',
    entry: [
      {
        id: PAGE_ID,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              from: { id: COMMENTER_IG_ID, username: 'test_user' },
              media: { id: MEDIA_ID },
              id,
              text: commentText,
            },
          },
        ],
      },
    ],
  };
}

async function sendComment(commentText: string): Promise<{ status: number; ok: boolean }> {
  const payload = buildCommentPayload(commentText);
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': 'sha256=placeholder', // will fail verification; comment bypass applies
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ok: res.ok };
}

async function main() {
  const args = process.argv.slice(2);
  let comments: string[] = [];

  if (args[0] === '--file' && args[1]) {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(process.cwd(), args[1]);
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    comments = content
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
  } else if (args.length > 0) {
    comments = [args.join(' ')];
  } else {
    console.log('Usage:');
    console.log('  npm run test:comment "comment text"');
    console.log('  npm run test:comment -- --file comments.txt');
    console.log('');
    console.log('Example comments to try:');
    console.log('  "want to book"  (high-intent)');
    console.log('  "lol"           (skip)');
    console.log('  "great post!"   (low-intent)');
    process.exit(1);
  }

  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('Page ID:', PAGE_ID);
  console.log('Commenter IG ID:', COMMENTER_IG_ID);
  console.log('---');

  for (const text of comments) {
    const { status, ok } = await sendComment(text);
    const symbol = ok ? '✓' : '✗';
    console.log(`${symbol} "${text}" → ${status}`);
  }

  console.log('---');
  console.log('Check logs for: "Comment: skip intent" | "Instagram comment webhook queued" | "Email sent"');
}

main().catch((err: unknown) => {
  const code = (err as NodeJS.ErrnoException)?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ECONNREFUSED') {
    console.error('Connection refused. Is the backend running?');
    console.error('  Local: npm run dev');
    console.error('  Or set TEST_COMMENT_WEBHOOK_URL to your deployed URL.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
