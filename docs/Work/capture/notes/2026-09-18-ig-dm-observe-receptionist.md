# IG DM observe

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-18T15:51:51.638Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## tape-hello-book — Hello, then book

App Review tape path: greeting then booking link, no intake.

Sender `19746166340361250`.

### hello

**Patient:** hi

**Bot:**

```
Hi — I'm the receptionist. I can help with availability, address, the consult fee, cancel/reschedule, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImI1NDc3ZDAzLWUyZjQtNGExMC1iODVkLWY1ZjExMjM5NzRlZCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5Nzg2fQ.RxTkF7uUqLB2GxKfRHk6h2Nfh_7YB_SIalckTmhVUoU

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## hours — Clinic hours

Most common FAQ after hello.

Sender `19746198907884342`.

### hours

**Patient:** what are your hours

**Bot:**

```
Timings: 8 - 2 am daily
```

_intent=ask_question · step=responded · language=—_

## fees — Consultation fee

Price ask before anyone books.

Sender `19746216982855053`.

### fee

**Patient:** how much is a consultation?

**Bot:**

```
Consult fee is ₹10.
```

_intent=ask_question · step=responded · language=—_

## location — Clinic location

Where / address FAQ.

Sender `19746234688412319`.

### where

**Patient:** where is the clinic

**Bot:**

```
Address: Ayushman Arogya Kendra Buttar Kalan
```

_intent=ask_question · step=responded · language=—_

## available-tomorrow — Availability tomorrow

Soft booking without saying book.

Sender `19746251987209385`.

### tomorrow

**Patient:** are you available tomorrow

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6Ijg3ZTc0ZmE0LThlOTEtNGZkZS1hNjE2LTVlYjNlZmRlNWI2ZiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5ODU3fQ.832EjKuStdcRvrVHoT18a-PV3nCg43nqVQK5_pewKlA

You'll be redirected back to this chat when done.
```

_intent=check_availability · step=awaiting_slot_selection · language=—_

## send-link — Ask for the booking link

Patient already knows the product is a link.

Sender `19746269680827494`.

### link please

**Patient:** send me the booking link

**Bot:**

```
The booking page will be sent here now.
```

_intent=ask_question · step=responded · language=—_

## for-mother — Book for a relative

Someone booking on behalf of family.

Sender `19746289340381087`.

### for mother

**Patient:** I need an appointment for my mother

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImNmODgxNzM4LTlhMTUtNGYxZS05NGFhLTA5NDdlYWRiNzZlYiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5ODkyfQ.NRAdkdAViVgG_YNxcqsV6AbUyZ2T4qRlej9YujRwJLg

You'll be redirected back to this chat when done.
```

_intent=book_for_someone_else · step=awaiting_slot_selection · language=—_

## mild-fever — Mild symptom in the DM

Medical-sounding line that must not diagnose or collect history.

Sender `19746305009408300`.

### fever

**Patient:** I have had a mild fever for three days

**Bot:**

```
I'm the receptionist. I can help with timings, availability, or a booking link.
```

_intent=medical_query · step=responded · language=—_

## chest-pain — Acute chest pain

Used to send 112. Meta must stay receptionist-only.

Sender `19746320611957000`.

### chest pain

**Patient:** chest pain and I cannot breathe

**Bot:**

```
I'm the receptionist. I can help with timings, availability, or a booking link.
```

_intent=emergency · step=responded · language=—_

## emergency-appointment — “Emergency appointment” wording

Wants a slot, not EMS. Must not fire 112.

Sender `19746336692943883`.

### emergency slot

**Patient:** I need an emergency appointment next week

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImE1YmEwOTY4LWFlM2QtNDJhOS05MmE3LWIxODA1ODEwZWQ3OCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5OTQyfQ.-WIDlT80umn5wmrBUrC7FpJhqiW9YrPY_rhRIVZbaUM

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## are-you-a-doctor — Asks if the bot is a doctor

Must not role-play a clinician or prescribe.

Sender `19746354985827190`.

### prescribe

**Patient:** are you a doctor? can you prescribe something for my cough?

**Bot:**

```
I'm the receptionist. I can help with timings, availability, or a booking link.
```

_intent=medical_query · step=responded · language=—_

## hinglish-book — Hinglish booking

Common clinic DM language.

Sender `19746371510166231`.

### hinglish book

**Patient:** mujhe kal appointment chahiye

**Bot:**

```
Appointment lene ke liye yeh link kholein: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImE3YjJlZWQ1LWUwNTEtNDkwMC1hNDRiLTI0ZWZjNjA5MmE2YyIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5OTc3fQ.-kE-hDXzpAvy0pj8wm8M11quh0VK0tYA9VtveI7Z-vQ

Done hone par aap wapas is chat par aa jayenge.
```

_intent=book_appointment · step=awaiting_slot_selection · language=hi-Latn_

## details-dumped-in-chat — Name and phone pasted in the thread

Old habit. Bot should still hand /book, not confirm details in IG.

Sender `19746390191628941`.

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImQ1MGUyYzZiLTRkNjUtNGJmZC05YTkxLWJmYWIwNjc4ZGM4MyIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzQ5OTk0fQ.cELxSfa99ngh2IKemhFkxYRU2p2JidVud06T6_vCrEo

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

### dump details

**Patient:** Test Dummy, 34, 9000000001, knee pain

**Bot:**

```
I'm the receptionist. I can help with timings, availability, or a booking link.
```

_intent=medical_query · step=responded · language=—_

## status-none — When is my appointment (nothing booked)

Returning-looking ask with an empty calendar.

Sender `19746424046586596`.

### status

**Patient:** when is my appointment?

**Bot:**

```
You don't have any upcoming appointments.

Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjAzZDE1ZmFjLWFkZjYtNDM4ZC1hOGUxLTA2MGZmODVhYjMyZSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwMDI5fQ.U-N7GrkcRdBgKNN3ck1HUEhXV4vvNdSdt17FDefsYYU

You'll be redirected back to this chat when done.
```

_intent=check_appointment_status · step=responded · language=—_

## cancel-none — Cancel (nothing booked)

Cancel ask with no visit on file.

Sender `19746441977125381`.

### cancel

**Patient:** I want to cancel my appointment

**Bot:**

```
You don't have any upcoming appointments.

Open this link to get an appointment: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjViMzdiZDFmLWQ1MmUtNGYyYS1iNWU0LWY0NzdhMzI1Mjg5YSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NzUwMDQ3fQ.FiNf4x23BsfawiKZ_NyT1GitAoROoPoGpp6hkMLNbqg

You'll be redirected back to this chat when done.
```

_intent=cancel_appointment · step=awaiting_slot_selection · language=—_

## opt-out — STOP, then a booking line

Meta opt-out. Second line should stay silent.

Sender `19746459989945108`.

### STOP

**Patient:** STOP

**Bot:**

```
I'll stop sending automated messages here. Your doctor can still reply. Send START if you want them again.
```

_intent=unknown · step=responded · language=—_

### book after stop

**Patient:** I want to book tomorrow

**Bot:** _(no reply before timeout)_

_intent=— · step=— · language=—_

## thanks — Thanks after hello

Closing small talk.

Sender `19746580972416513`.

### hello

**Patient:** hello

**Bot:**

```
Hi — I'm the receptionist. I can help with availability, address, the consult fee, cancel/reschedule, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

### thanks

**Patient:** thanks

**Bot:**

```
You're welcome.
```

_intent=greeting · step=responded · language=—_

## hello-doctor — Hello doctor

Reviewer or patient addresses a clinician. Bot must not accept the role.

Sender `19746614677365805`.

### hello doctor

**Patient:** hello doctor

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=greeting · step=responded · language=—_

## please-advise — Please advise

Asks for clinical advice in the thread.

Sender `19746632101301300`.

### advise

**Patient:** please advise what to do for my cough

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## what-to-take — What should I take

Medication question. Must not recommend a drug.

Sender `19746647820379847`.

### what to take

**Patient:** what should I take for fever

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## refill — Medicine refill

Rx in the DM. Provider data / healthcare messaging.

Sender `19746663507935041`.

### refill

**Patient:** can you refill my medicine

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## send-rx — Send my prescription

Asks for a clinical artifact on Instagram.

Sender `19746679710611207`.

### send rx

**Patient:** send my prescription here

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## bp-numbers — BP numbers in chat

Vitals look like a consult. Must not interpret.

Sender `19746695525644218`.

### bp

**Patient:** my BP is 150/90 this morning

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

