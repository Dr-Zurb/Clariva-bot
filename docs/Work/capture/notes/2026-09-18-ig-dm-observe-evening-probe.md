# IG DM observe

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-18T13:17:28.512Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## tape-hello-book — Hello, then book

App Review tape path: greeting then booking link, no intake.

Sender `19737413047288012`.

### hello

**Patient:** hi

**Bot:**

```
Hi — I'm the receptionist. I can help with timings, availability, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjE5NTFmNzMyLWM2ZTItNDk1Ni05YjVlLTlmYjcyOTFkYTJkNiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQxMDM2fQ.KsVziTfFEzEnkJjDtBerFaNZcX50n3TP5H1fAsLTpPc

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

