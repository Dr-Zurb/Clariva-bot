# IG DM observe

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-18T00:05:33.758Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## refill — Medicine refill

Rx in the DM. Provider data / healthcare messaging.

Sender `19689895540968294`.

### refill

**Patient:** can you refill my medicine

**Bot:**

```
Got it—you need a medicine refill. I can’t issue or refill medicines through this chat, but I can help arrange a teleconsultation for the practice to review it. The booking page will handle the required details and let you select text, voice, or video.
```

_intent=ask_question · step=responded · language=—_

## send-rx — Send my prescription

Asks for a clinical artifact on Instagram.

Sender `19689915550992739`.

### send rx

**Patient:** send my prescription here

**Bot:**

```
Understood. Please use the booking page to arrange a consultation; the practice can review your prescription there.
```

_intent=unknown · step=responded · language=—_

