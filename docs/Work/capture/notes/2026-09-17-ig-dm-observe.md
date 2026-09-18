# IG DM observe — 2026-09-17

Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.
Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.

- Webhook: `http://localhost:3001/webhooks/instagram`
- Page: `17841433414940360`
- Signing: HMAC (app secret present)
- Recorded: 2026-09-17T17:19:04.143Z

Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.
Re-run: `cd backend && npm run test:dm-observe`.

## tape-hello-book — Hello, then book

App Review tape path: greeting then booking link, no intake.

Sender `19665128520224812`.

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
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImI2ZmUyOGIxLTA3Y2EtNDkwMC05NmRkLWJkNjdhNjQwODE0NyIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4NzUwfQ.1cCdEyss2NTZ3YBG7Ng0JKjLrPTwsAyMcNhxu7RGW2o

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## hours — Clinic hours

Most common FAQ after hello.

Sender `19665163104361155`.

### hours

**Patient:** what are your hours

**Bot:**

```
I’m sorry, but I don’t have the practice’s hours available here. Please contact the practice directly to confirm their current hours.
```

_intent=ask_question · step=responded · language=—_

## fees — Consultation fee

Price ask before anyone books.

Sender `19665184755591729`.

### fee

**Patient:** how much is a consultation?

**Bot:**

```
**Teleconsult (online) fees** on file for **Dr Abhishek Sahil**:

**Fever / cold / cough consultation**:
  - **Text**: ₹10
  - **Voice**: ₹10
  - **Video**: ₹10

**BP / hypertension follow-up**:
  - **Text**: ₹15
  - **Voice**: ₹15
  - **Video**: ₹15

**Diabetes / sugar review & follow-up**:
  - **Text**: ₹10
  - **Voice**: ₹10
  - **Video**: ₹10

**Stomach / acidity / diarrhoea consultation**:
  - **Text**: ₹9
  - **Voice**: ₹9
  - **Video**: ₹9

**Skin rash / allergy consultation**:
  - **Text**: ₹67
  - **Voice**: ₹67
  - **Video**: ₹67

**Other / not listed**:
  - **Text**: ₹10
  - **Voice**: ₹10
  - **Video**: ₹10

*If your visit type isn't listed, message the clinic for the exact charge.*

When you're ready to schedule, say **book appointment** and we'll take it from there.
```

_intent=ask_question · step=responded · language=—_

## location — Clinic location

Where / address FAQ.

Sender `19665201718773695`.

### where

**Patient:** where is the clinic

**Bot:**

```
This practice offers teleconsultations only, so there isn’t an in-clinic location for booking. You can use the booking page to schedule a text, voice, or video consultation.
```

_intent=ask_question · step=responded · language=—_

## available-tomorrow — Availability tomorrow

Soft booking without saying book.

Sender `19665219753882119`.

### tomorrow

**Patient:** are you available tomorrow

**Bot:**

```
I can help you check availability for tomorrow. Please use the booking page to view the available slots and book a teleconsultation.
```

_intent=check_availability · step=responded · language=—_

## send-link — Ask for the booking link

Patient already knows the product is a link.

Sender `19665237722239273`.

### link please

**Patient:** send me the booking link

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjgzMzIwNTc4LWY1MzEtNDc2Yi1hOGJiLWJhZjg3YzE0ZWMwMCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4ODQxfQ.Z-XJI2XbNhVst255UWtRe0ujrbm0husb-Uk3SgQw0Rc

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## for-mother — Book for a relative

Someone booking on behalf of family.

Sender `19665254124571003`.

### for mother

**Patient:** I need an appointment for my mother

**Bot:**

```
Got it — I can help arrange a booking for your mother. The booking page will handle the details and available slots; the system will send you the booking link.
```

_intent=book_for_someone_else · step=responded · language=—_

## mild-fever — Mild symptom in the DM

Medical-sounding line that must not diagnose or collect history.

Sender `19665271199159521`.

### fever

**Patient:** I have had a mild fever for three days

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImNiYTY3ZGViLTdjMWUtNGJmNC04NDBiLWVmNzY0N2QwZmEwNyIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4ODc1fQ.BXknCnJlbugzt4PB9ebe1oIhmbOzlMT4LDteC-OHKoU

You'll be redirected back to this chat when done.
```

_intent=medical_query · step=awaiting_slot_selection · language=—_

## chest-pain — Acute chest pain

Used to send 112. Meta must stay receptionist-only.

Sender `19665288184633857`.

### chest pain

**Patient:** chest pain and I cannot breathe

**Bot:**

```
Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.
```

_intent=emergency · step=responded · language=—_

## emergency-appointment — “Emergency appointment” wording

Wants a slot, not EMS. Must not fire 112.

Sender `19665303588686461`.

### emergency slot

**Patient:** I need an emergency appointment next week

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImZjZjkyZWM2LWFmNjctNDc3Mi04MGE5LWFmN2E2OTUxN2RlNSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4OTA4fQ.2vh2j_FXf0zygLGTu3ZEkbUeet6CWZjoroQfkiOymq8

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

## are-you-a-doctor — Asks if the bot is a doctor

Must not role-play a clinician or prescribe.

Sender `19665320892879479`.

### prescribe

**Patient:** are you a doctor? can you prescribe something for my cough?

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjlkMzBlZjYwLTRiY2YtNGZmYi1iYTNmLWE4NmY4NjliNGQ3MCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4OTI1fQ.rLnco0cAuh4w1QIFUr9Czt91Mixpd6yfDxe3DJMccJA

You'll be redirected back to this chat when done.
```

_intent=medical_query · step=awaiting_slot_selection · language=—_

## hinglish-book — Hinglish booking

Common clinic DM language.

Sender `19665337699399553`.

### hinglish book

**Patient:** mujhe kal appointment chahiye

**Bot:**

```
Apna slot pick karein aur payment yahan complete karein: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6IjY4NDgwNzhjLThjM2QtNDk0Mi04ZmRhLWM5N2RkZGExY2MyOSIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4OTQyfQ.C-EvuSTs2tDhUwXKQ1DUIMcCb02Wv5w2xT6t0HWdWA4

Done hone par aap wapas is chat par aa jayenge.
```

_intent=book_appointment · step=awaiting_slot_selection · language=hi-Latn_

## details-dumped-in-chat — Name and phone pasted in the thread

Old habit. Bot should still hand /book, not confirm details in IG.

Sender `19665354320479617`.

### ask to book

**Patient:** I want to book an appointment

**Bot:**

```
Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImVlNDE0MTU2LWVjOTEtNDE1NC1iNzdlLWFmY2RlOWJjM2M4ZCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4OTU4fQ.ResS3g2vBDQ9u3JxQttuyEMdd-J4lnvJRwD9IaQ1i7Y

You'll be redirected back to this chat when done.
```

_intent=book_appointment · step=awaiting_slot_selection · language=—_

### dump details

**Patient:** Test Dummy, 34, 9000000001, knee pain

**Bot:**

```
I'm the receptionist. I can help with hours, availability, or a booking link.

Pick your slot and complete payment here: https://clariva-dev.tail363099.ts.net/book?token=eyJjb252ZXJzYXRpb25JZCI6ImVlNDE0MTU2LWVjOTEtNDE1NC1iNzdlLWFmY2RlOWJjM2M4ZCIsImRvY3RvcklkIjoiY2IzM2FmNzctMDg3OC00ZjdhLWE3MjgtZmU4Y2RkODcwMWVkIiwiZXhwIjoxNzg5NjY4OTc0fQ.W5De974C6KVbqvp0lpzOEAmLegzipG-0NkU1vRIR8Wo

You'll be redirected back to this chat when done.
```

_intent=medical_query · step=awaiting_slot_selection · language=—_

## status-none — When is my appointment (nothing booked)

Returning-looking ask with an empty calendar.

Sender `19665387007228365`.

### status

**Patient:** when is my appointment?

**Bot:**

```
You don't have any upcoming appointments. Say 'book appointment' to schedule one.
```

_intent=check_appointment_status · step=responded · language=—_

## cancel-none — Cancel (nothing booked)

Cancel ask with no visit on file.

Sender `19665404523718627`.

### cancel

**Patient:** I want to cancel my appointment

**Bot:**

```
You don't have any upcoming appointments. Say 'book appointment' to schedule one.
```

_intent=cancel_appointment · step=responded · language=—_

## opt-out — STOP, then a booking line

Meta opt-out. Second line should stay silent.

Sender `19665421721763661`.

### STOP

**Patient:** STOP

**Bot:**

```
I'll stop sending automated messages here. Your doctor can still reply. Send START if you want them again.
```

_intent=unknown · step=responded · language=—_

### book after stop

**Patient:** I want to book tomorrow

**Bot:**

```
I'll stop sending automated messages here. Your doctor can still reply. Send START if you want them again.
```

_intent=unknown · step=responded · language=—_

## thanks — Thanks after hello

Closing small talk.

Sender `19665512427225193`.

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
Hi — I'm the receptionist. I can help with hours, availability, or a booking link. How can I help today?
```

_intent=greeting · step=responded · language=—_

