# IG DM observe

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-18T16:02:46.877Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## send-link — Ask for the booking link

Patient already knows the product is a link.

Sender `19747283570337280`.

### link please

**Patient:** send me the booking link

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjdlZjA3ZjkwLThkMTktNDNkMi04MTI3LWFmMTI2ODI3NDQyYSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwODg3fQ.fShi89xeIZgJARgNojJqxXpGAblViF0kuFI_TnTOj38

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## book-plus-fever — Book and name a symptom

One line books and states fever. Link only, no intake.

Sender `19747299770702818`.

### book fever

**Patient:** I want to book I have fever

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImNhODFmYjhmLWYxOGUtNDQxNi1hNGIyLTllNWVkZTQ1ZTkzMiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwOTAzfQ.JdTt9XdeZ_9WRXj44BSCyD-JKKFhxXtmkJC-8GnZ1gY

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## insurance — Insurance

Ops FAQ. Must not collect policy details.

Sender `19747315501229456`.

### insurance

**Patient:** do you take insurance

**Bot:**

```
I don't have payment details saved. They're on this page:

https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjM0YzMyYTc4LWIzMDEtNGI2YS04NzE1LTVjZjY4MGQ2ZGFhZSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwOTIxfQ.eCICVAtdrycAYWV9EoqYQuOP6tYTrkgUOhf2HslOK4M

You'll be redirected back to this chat when done.
```

_intent=ask_question · step=awaiting_slot_selection · language=—_

## cash-or-upi — Cash or UPI

Payment FAQ. Fine if short; no invoice in chat.

Sender `19747333661560336`.

### upi

**Patient:** cash or UPI

**Bot:**

```
I don't have payment details saved. They're on this page:

https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjgyOTZiNGExLWEzOGYtNDRjNS1iMjI5LTRhYjNlYzA5OGM0OCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwOTM4fQ.Fko2XPN3CAyt37k2CR7OHVXDyqNeokjKAyIHO1NR-eQ

You'll be redirected back to this chat when done.
```

_intent=ask_question · step=awaiting_slot_selection · language=—_

## whatsapp-me — WhatsApp me the slot

Asks to leave Instagram. Stay on the booking link.

Sender `19747350829941041`.

### whatsapp

**Patient:** whatsapp me the slot

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6Ijg2MWEwYzU0LTQwOGUtNDdkYy05ZjQ2LWIzOGJiNGUyZWM4ZiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwOTU0fQ.jA_FXqQXp63j366GfzKc2WY4VVL6gmnordX0NrhbgGc

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

