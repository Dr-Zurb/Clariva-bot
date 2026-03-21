# Meta Permissions Self-Review

Before submitting for App Review, verify your app requests only the permissions it actually uses and that each has a clear justification.

---

## Use Cases & Permissions

### 1. Engage with customers on Messenger from Meta (Instagram DMs)

| Permission | Used? | Purpose |
|------------|-------|---------|
| `instagram_manage_messages` | ✅ Yes | Send/receive DMs, reply to patients |
| `pages_show_list` | ✅ Yes | List doctor's Facebook Pages during connect |
| `pages_read_engagement` | ✅ Yes | Get Page → Instagram Business Account link |
| `instagram_basic` | ✅ Yes | Basic Instagram account info |
| `pages_manage_metadata` | ✅ Yes | Page token for messaging |
| `pages_messaging` | ✅ Yes | Messenger/Instagram messaging |
| `business_management` | ✅ Yes | Access business-owned Pages |
| `ads_management` | ⚠️ Check | Used for Business Manager–linked Pages; remove if not needed |

### 2. Manage messaging & content on Instagram (Comments)

| Permission | Used? | Purpose |
|------------|-------|---------|
| `instagram_manage_comments` | ✅ Yes | Reply to post comments, comment webhooks |

---

## OAuth Scopes (Connect Flow)

Our connect flow requests these scopes (in `instagram-connect-service.ts`):

```
pages_show_list, business_management, pages_read_engagement,
instagram_basic, ads_management, pages_manage_metadata,
pages_messaging, instagram_manage_messages
```

**Note:** `instagram_manage_comments` is **not** in the OAuth scopes. Comments use the **Page token** (from connect), which gets permissions when the doctor authorizes. If comment replies fail with "permission denied", add `instagram_manage_comments` to the use case permissions and ensure it's requested during connect (or that the Page token includes it).

---

## Checklist Before App Review

- [ ] **Permissions and features** (App Dashboard): Each requested permission has a clear "Why do you need this?" justification
- [ ] **No unused permissions**: Remove any permission you don't actually use (e.g. `ads_management` if you don't need Business Manager fallback)
- [ ] **Advanced Access**: Permissions like `instagram_manage_messages` and `instagram_manage_comments` typically need **Advanced Access** (App Review)
- [ ] **Testing instructions**: Reviewers can sign in, connect Instagram, and see the bot reply to DMs
- [ ] **Privacy Policy**: Mentions data collection, use, and deletion
- [ ] **Data Deletion**: Instructions or callback URL configured

---

## Common Rejection Reasons

1. **Vague justification** — Be specific: "We need X to do Y for Z feature"
2. **Requesting more than needed** — Only request what you use
3. **Broken demo** — Test credentials must work; bot must reply
4. **Missing privacy policy** — Must be live and accessible
5. **Incomplete testing instructions** — Step-by-step, with credentials

---

## Suggested Justifications (for App Review)

**instagram_manage_messages:**  
"We use this to send and receive Instagram Direct Messages between patients and healthcare practices. Doctors connect their Instagram via our dashboard; our AI receptionist replies to appointment requests, availability questions, and general queries."

**instagram_manage_comments:**  
"We use this to reply to comments on doctors' Instagram posts (e.g. when someone comments 'book appointment'). We send a public reply and optionally open a DM conversation."

**pages_show_list, pages_read_engagement, instagram_basic, pages_manage_metadata, pages_messaging, business_management:**  
"Required for our Instagram connect flow: doctors must authorize their Facebook Page (linked to Instagram) so we can obtain a Page token for sending/receiving messages on their behalf."

**ads_management (optional):**  
"Required when a doctor's Instagram is linked via Business Manager. Without this, we cannot retrieve the Instagram Business Account for Pages linked through Business Manager."

---

## Webhook Signature Behavior

Instagram webhooks (comments and DMs) may fail standard HMAC signature verification. Our webhook controller **bypasses verification** for `comment:*` and `message` payloads when the signature fails, so comment → DM and two-way DM conversations work. This is documented in `webhook-controller.ts` and verified by integration tests.

---

## Optional: Trim `ads_management`

If you don't use Business Manager–linked Pages, you can remove `ads_management` from the OAuth scopes to reduce the permission surface. This may simplify App Review.
