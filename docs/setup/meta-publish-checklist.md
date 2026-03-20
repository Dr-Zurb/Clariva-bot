# Meta App Publish Checklist

Complete these fields in **Meta for Developers** → **App Dashboard** → **Basic Settings** before publishing to Live mode.

---

## 1. App Domains

Add your production domains (no `https://`, no trailing slash):

| Domain |
|--------|
| `clariva-bot.onrender.com` |
| `clariva-bot.vercel.app` |

If you have a custom domain (e.g. `app.clariva.com`), add it too.

---

## 2. Privacy Policy URL

**Required.** Must be a live, publicly accessible URL.

| Environment | URL |
|-------------|-----|
| Production (Vercel) | `https://clariva-bot.vercel.app/privacy` |
| Custom domain | `https://your-domain.com/privacy` |

---

## 3. Terms of Service URL

**Required.** Must be a live, publicly accessible URL.

| Environment | URL |
|-------------|-----|
| Production (Vercel) | `https://clariva-bot.vercel.app/terms` |
| Custom domain | `https://your-domain.com/terms` |

---

## 4. User Data Deletion

Meta requires **either** a Data Deletion Instructions URL **or** a Data Deletion Callback URL.

### Option A: Data Deletion Instructions URL (simpler)

A page that explains how users can request deletion:

| URL |
|-----|
| `https://clariva-bot.vercel.app/data-deletion` |

### Option B: Data Deletion Callback URL (recommended)

Meta POSTs to this URL when a user removes your app. Our backend implements this:

| URL |
|-----|
| `https://clariva-bot.onrender.com/data-deletion-callback` |

Use **Option B** if you want Meta to notify you automatically when users request deletion.

---

## 5. App Category

Select from the dropdown. Suggested:

- **Business and Pages** (if available)
- Or **Other** → choose the closest match

---

## 6. App Icon (1024 × 1024)

Upload a PNG image, 1024×1024 pixels. Use your Clariva Care logo or a simple icon.

---

## 7. Data Protection Officer (DPO)

Required for some regions (e.g. EU/GDPR). Fill if you target EU users:

| Field | Example |
|-------|---------|
| Name | Your name or company contact |
| Email | Your contact email |
| Address | Your business address |

---

## 8. Contact Email

Already set. Ensure it is valid and monitored.

---

## Quick Copy-Paste

```
App domains:
clariva-bot.onrender.com
clariva-bot.vercel.app

Privacy Policy URL:
https://clariva-bot.vercel.app/privacy

Terms of Service URL:
https://clariva-bot.vercel.app/terms

Data Deletion Instructions URL (Option A):
https://clariva-bot.vercel.app/data-deletion

Data Deletion Callback URL (Option B):
https://clariva-bot.onrender.com/data-deletion-callback
```

---

## After Filling

1. Click **Save Changes** in Basic Settings
2. Go to **Publish** in the sidebar
3. Resolve any remaining "Required actions"
4. Click **Publish** to switch to Live mode

---

## References

- [Meta Data Deletion Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
- [App Review](https://developers.facebook.com/docs/app-review/)
