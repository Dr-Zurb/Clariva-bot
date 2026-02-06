# Bypassing Ngrok Free Tier Browser Warning for Webhooks

## Problem

Ngrok free tier shows a browser warning page that requires user interaction. This blocks automated webhook verification requests from Facebook/Instagram, causing the error:

> "The callback URL or verify token couldn't be validated."

## Solution

### Option 1: Use Ngrok with Skip Browser Warning Header (Recommended)

Configure ngrok to skip the browser warning by adding a request header rewrite:

```bash
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"
```

**Note:** This requires ngrok version 3.0+ and may not work with all ngrok free tier accounts.

### Option 2: Use Ngrok Paid Tier

Upgrade to ngrok paid tier which doesn't show browser warnings:

1. Sign up for ngrok paid plan
2. Use static domain: `ngrok http 3000 --domain=your-static-domain.ngrok.io`
3. No browser warning page

### Option 3: Use Cloudflare Tunnel (Free Alternative)

Cloudflare Tunnel doesn't show browser warnings:

```bash
# Install cloudflared
# Windows: Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
# Mac: brew install cloudflare/cloudflare/cloudflared

# Run tunnel
cloudflared tunnel --url http://localhost:3000
```

### Option 4: Configure Facebook to Send Header

Unfortunately, Facebook's webhook verification doesn't support custom headers, so this option won't work for webhook verification.

## Recommended Approach

For development, use **Option 1** if your ngrok version supports it, or **Option 3** (Cloudflare Tunnel) as a free alternative without browser warnings.

For production, use a proper hosting service (not ngrok) with a static domain.

## Testing

After configuring ngrok with the skip header, test the webhook:

1. Start your backend: `npm run dev`
2. Start ngrok: `ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"`
3. Copy the forwarding URL (e.g., `https://abc123.ngrok-free.app`)
4. Update Facebook Console with: `https://abc123.ngrok-free.app/webhooks/instagram`
5. Click "Verify and save" - should work without browser warning blocking

## Troubleshooting

If verification still fails:

1. Check server logs for incoming requests
2. Verify ngrok is forwarding requests (check ngrok dashboard at http://127.0.0.1:4040)
3. Ensure `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` in `.env` matches the token in Facebook Console
4. Check that the webhook endpoint is accessible: `GET /webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test`
