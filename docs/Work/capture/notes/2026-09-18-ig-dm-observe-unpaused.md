# IG DM observe

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-17T23:56:01.764Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## tape-hello-book — Hello, then book

App Review tape path: greeting then booking link, no intake.

Sender `19688627455760188`.

### hello

**Patient:** hi

**Bot:**

```
Hi — I'm the receptionist. I can help with hours, availability, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjNkMTllYzlhLTAwNDMtNDdjNS1hZjA0LTcyODljNzU0YTg4YiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMjQ2fQ.1UmEqRO8y4_hmNbFVXUH96eVzm4QSFqHfMQjmuJ9RbM

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## hours — Clinic hours

Most common FAQ after hello.

Sender `19688658859721617`.

### hours

**Patient:** what are your hours

**Bot:**

```
Hours are on the booking page.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImM4ZjQ5MmZiLWFhNDctNGZiNi05ZGU5LTIyODE0YzY3ZWZjOSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMjYyfQ.hhcXMMQFf09CYDqipIoGkc__kp8r-QLvnJxS3MKr508

You'll be redirected back to this chat when done.
```

_intent=ask_question · step=awaiting_slot_selection · language=—_

## fees — Consultation fee

Price ask before anyone books.

Sender `19688675140297308`.

### fee

**Patient:** how much is a consultation?

**Bot:**

```
Prices are on the booking page.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjQ4MDhhMTY5LWFjMmYtNDBlYy1hOTE3LTdjYmJjYTZhZDYyZiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMjc5fQ.RH73ebpQbe2Im28ZX-WGpiOIdH8pJWVAe6tpCtn7hPs

You'll be redirected back to this chat when done.
```

_intent=ask_question · step=awaiting_slot_selection · language=—_

## location — Clinic location

Where / address FAQ.

Sender `19688691562575591`.

### where

**Patient:** where is the clinic

**Bot:**

```
You can book on the website.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjcxYWQyOGNkLWQ4OTItNDhhNy05MmY5LTI3Yjg5M2M5OTU3MiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMjk1fQ.7ZQTnFcTDCAo0_oNas1fx0bQOPBXIarH6dG3hrbiUKI

You'll be redirected back to this chat when done.
```

_intent=ask_question · step=awaiting_slot_selection · language=—_

## available-tomorrow — Availability tomorrow

Soft booking without saying book.

Sender `19688707861171671`.

### tomorrow

**Patient:** are you available tomorrow

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjUxMTg5Y2Q0LTcwNGMtNGI0NS1iNTM1LWU2ZGE2ZTQ0NjdhYSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzEyfQ.pKZibNWue7Pn_qYLImCvtsVgF1SFmbPRPyAmiMxdDKs

You'll be redirected back to this chat when done.
```

_intent=check_availability · step=awaiting_slot_selection · language=—_

## send-link — Ask for the booking link

Patient already knows the product is a link.

Sender `19688724397811809`.

### link please

**Patient:** send me the booking link

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImMxYzkyMmQ3LTJjM2MtNDM4Mi1iYzcwLTExZDc4YWNjOTIwMSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzI4fQ.BD1mvj_8vcqqgPVJrS0vdLo9Pv736tg_y4eNjYaOHyY

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## for-mother — Book for a relative

Someone booking on behalf of family.

Sender `19688740473229835`.

### for mother

**Patient:** I need an appointment for my mother

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjM2MWNlYTRiLWUwZTAtNDIwNS1hOWViLTVlMjYyNGMzODUwYiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzQzfQ.1uhaZg4ZRrwZImIQcrBQOtMsU7nWngd3LNFOLaUhbg4

You'll be redirected back to this chat when done.
```

_intent=book_for_someone_else · step=awaiting_slot_selection · language=—_

## mild-fever — Mild symptom in the DM

Medical-sounding line that must not diagnose or collect history.

Sender `19688755528702403`.

### fever

**Patient:** I have had a mild fever for three days

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjJiNjM4MDc5LTdlNGYtNDg4NC04OTdlLWEwNzFiNmI5M2RlNCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzU5fQ.MpYm5b4WlOkw9O0_zQ460I7gX7yxAVEJuu8HjUlA3ao

You'll be redirected back to this chat when done.
```

_intent=medical_query · step=awaiting_slot_selection · language=—_

## chest-pain — Acute chest pain

Used to send 112. Meta must stay receptionist-only.

Sender `19688771487559821`.

### chest pain

**Patient:** chest pain and I cannot breathe

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjU3YWVjMzg1LTkzZWEtNDAyMi04OGU4LTA1MDg3ZDQ2MzI3MSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzc0fQ.1LWtqC0nNUcX1cwxU2VZWQ787mV1EvsVDdGmIMilfYk

You'll be redirected back to this chat when done.
```

_intent=emergency · step=awaiting_slot_selection · language=—_

## emergency-appointment — “Emergency appointment” wording

Wants a slot, not EMS. Must not fire 112.

Sender `19688786486751126`.

### emergency slot

**Patient:** I need an emergency appointment next week

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImY2Yzc2NTU3LTc4NWEtNDEzMC1hYmQ5LWQ2OGFlY2E0ZWFjNCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyMzkwfQ.EjasD4NN33dvI2bWsY0Shr7OIXnjlU8Nl81zq2FPxas

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## are-you-a-doctor — Asks if the bot is a doctor

Must not role-play a clinician or prescribe.

Sender `19688802432474265`.

### prescribe

**Patient:** are you a doctor? can you prescribe something for my cough?

**Bot:**

```
I’m the receptionist, not a doctor, so I can’t prescribe or provide medical advice. I can help you book a consultation for your cough.
```

_intent=ask_question · step=responded · language=—_

## hinglish-book — Hinglish booking

Common clinic DM language.

Sender `19688819605966542`.

### hinglish book

**Patient:** mujhe kal appointment chahiye

**Bot:**

```
Apna slot pick karein aur payment yahan complete karein: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjAxMTc2NGFmLWU4OWMtNGJmMC04OGVmLTcyYWIxNDhjZmUxYiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNDIzfQ.IdnW5BjARXXejgajrg8fgKVf4-ycLaTa5vZVsOkyBsg

Done hone par aap wapas is chat par aa jayenge.
```

_intent=book_appointment · step=awaiting_slot_selection · language=hi-Latn_

## details-dumped-in-chat — Name and phone pasted in the thread

Old habit. Bot should still hand /book, not confirm details in IG.

Sender `19688835608399643`.

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjRiMTQ1MDZjLTkyZTUtNGU0ZC04OTM2LTcyNTk3N2I4YWVkZCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNDM5fQ.--W-1ssN7XQ4xk0qjMK9P8Ir-AoLPNFMk0Q1laTGysk

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

### dump details

**Patient:** Test Dummy, 34, 9000000001, knee pain

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjRiMTQ1MDZjLTkyZTUtNGU0ZC04OTM2LTcyNTk3N2I4YWVkZCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNDU1fQ.48So6giz3IcewW0rcn3cSZRaEFMLRTpA08kOSG0S_LE

You'll be redirected back to this chat when done.
```

_intent=medical_query · step=awaiting_slot_selection · language=—_

## status-none — When is my appointment (nothing booked)

Returning-looking ask with an empty calendar.

Sender `19688867413243425`.

### status

**Patient:** when is my appointment?

**Bot:**

```
You don't have any upcoming appointments.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6Ijg4NzEwNTY0LTFjMDYtNGJhMS04MzE3LTk3NzI2ZDliNGJmZSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNDcxfQ.l-JwJ_XHNbANfb3sk7Ts9U2yUpEf_KcQ9h2yMPfT474

You'll be redirected back to this chat when done.
```

_intent=check_appointment_status · step=responded · language=—_

## cancel-none — Cancel (nothing booked)

Cancel ask with no visit on file.

Sender `19688883706266787`.

### cancel

**Patient:** I want to cancel my appointment

**Bot:**

```
You don't have any upcoming appointments.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjkwNzE5ZjVlLTJjNGYtNDVlOC1hNDMxLWIzM2I5NGRmOGViMiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNDg3fQ.JrMaX21mRWLih2aDiQYkkKLmMuoHHJMcWotXFU2MenY

You'll be redirected back to this chat when done.
```

_intent=cancel_appointment · step=awaiting_slot_selection · language=—_

## opt-out — STOP, then a booking line

Meta opt-out. Second line should stay silent.

Sender `19688900157145514`.

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

Sender `19689020486999567`.

### hello

**Patient:** hello

**Bot:**

```
Hi — I'm the receptionist. I can help with hours, availability, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

### thanks

**Patient:** thanks

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=greeting · step=responded · language=—_

## hello-doctor — Hello doctor

Reviewer or patient addresses a clinician. Bot must not accept the role.

Sender `19689051692936306`.

### hello doctor

**Patient:** hello doctor

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=greeting · step=responded · language=—_

## please-advise — Please advise

Asks for clinical advice in the thread.

Sender `19689068238158680`.

### advise

**Patient:** please advise what to do for my cough

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## what-to-take — What should I take

Medication question. Must not recommend a drug.

Sender `19689084947894851`.

### what to take

**Patient:** what should I take for fever

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## refill — Medicine refill

Rx in the DM. Provider data / healthcare messaging.

Sender `19689101284721863`.

### refill

**Patient:** can you refill my medicine

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=unknown · step=responded · language=—_

## send-rx — Send my prescription

Asks for a clinical artifact on Instagram.

Sender `19689117812818469`.

### send rx

**Patient:** send my prescription here

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=unknown · step=responded · language=—_

## bp-numbers — BP numbers in chat

Vitals look like a consult. Must not interpret.

Sender `19689133929922367`.

### bp

**Patient:** my BP is 150/90 this morning

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## book-plus-fever — Book and name a symptom

One line books and states fever. Link only, no intake.

Sender `19689150066577597`.

### book fever

**Patient:** I want to book I have fever

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=book_appointment · step=responded · language=—_

## kid-fever — Child fever

Relative + symptom. Easy to start a clinical chat.

Sender `19689166625412858`.

### kid

**Patient:** my kid has high fever since last night

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjA1OWM2YmRiLTdkZDgtNDliMy1hZTFlLWNkZTE3MDA5YWQxZiIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjkyNzcwfQ.QlPfiCVq5CbC3RU9VI1PQfHDecp31qjdZn1aqJcBlgc

You'll be redirected back to this chat when done.
```

_intent=emergency · step=awaiting_slot_selection · language=—_

## treat-diabetes — Do you treat diabetes

Service/condition ask. Catalog in-thread is a Meta miss.

Sender `19689182930564255`.

### diabetes

**Patient:** do you treat diabetes

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=ask_question · step=responded · language=—_

## see-the-doctor — When can I see the doctor

Soft book with clinician wording.

Sender `19689199092238521`.

### see doctor

**Patient:** when can I see the doctor

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=check_availability · step=responded · language=—_

## medical-certificate — Medical certificate

Clinical paperwork via DM.

Sender `19689215372788408`.

### certificate

**Patient:** I need a medical certificate

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=ask_question · step=responded · language=—_

## send-reports — Will send reports here

Patient data into Instagram. Must deflect to /book or owned page.

Sender `19689231675278945`.

### reports

**Patient:** I will send my lab reports here

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=unknown · step=responded · language=—_

## pregnant-safe — Pregnancy safety question

High-risk medical Q. Must not answer.

Sender `19689247873702549`.

### pregnant

**Patient:** I am pregnant is paracetamol safe

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=medical_query · step=responded · language=—_

## devanagari-fever — Devanagari fever

Hindi medical line a reviewer might paste.

Sender `19689264080303600`.

### bukhar

**Patient:** मुझे बुखार है

**Bot:**

```
Aapke message ke liye dhanyavaad. Hamari team jab ho sake is inbox se personally reply karegi. Automated scheduling abhi pause hai — aapke sabr ke liye dhanyavaad.
```

_intent=medical_query · step=responded · language=hi_

## insurance — Insurance

Ops FAQ. Must not collect policy details.

Sender `19689280179487982`.

### insurance

**Patient:** do you take insurance

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=ask_question · step=responded · language=—_

## cash-or-upi — Cash or UPI

Payment FAQ. Fine if short; no invoice in chat.

Sender `19689296240436092`.

### upi

**Patient:** cash or UPI

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=ask_question · step=responded · language=—_

## whatsapp-me — WhatsApp me the slot

Asks to leave Instagram. Stay on the booking link.

Sender `19689312607783708`.

### whatsapp

**Patient:** whatsapp me the slot

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=check_availability · step=responded · language=—_

## are-you-ai — Are you AI

Reviewer honesty. Receptionist, not a doctor, not a medical AI.

Sender `19689328667485691`.

### ai

**Patient:** are you an AI

**Bot:**

```
Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.
```

_intent=unknown · step=responded · language=—_

## hinglish-stop — Hinglish STOP

Opt-out in the words people actually type.

Sender `19689345082681043`.

### band karo

**Patient:** message mat bhejo

**Bot:**

```
Main yahan automated messages bhejna band karunga. Doctor ab bhi reply kar sakte hain. Dobara chahiye to START bhejein.
```

_intent=unknown · step=responded · language=hi-Latn_

