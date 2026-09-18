# Service providers that process Meta Platform Data

Platform Terms §5.a / §5.a.iv. Written 2026-09-17 from the running product (code + `AUDIT.md` F5). Produce this list on Meta request. Keep it current when a provider is added or dropped. When dropping one, confirm deletion (§5.a.iii).

**Platform Data in this product:** Instagram/Facebook access tokens (encrypted at rest), IG-scoped IDs (`platform_conversation_id` / commenter id), usernames used on public replies, inbound message/comment text.

**Not this list:** Meta itself (the Platform). Payment (Razorpay) and Twilio Video consult media are Halo Aid product data, not Meta Platform Data.

DPA / contact rows marked `⟨fill⟩` are facts only the founder can confirm. Do not invent a signed-agreement date.

---

## Processors (Platform Data flows here)

| Provider | Role | Platform Data types | Written terms | Contact |
|---|---|---|---|---|
| **Supabase** | Primary store + Auth. Conversations, messages, encrypted tokens, doctor IG connection. | Tokens, IG-scoped IDs, usernames, message text (as stored rows). | Public: https://supabase.com/legal — executed DPA / date: ⟨fill⟩ | ⟨fill⟩ |
| **Render** | Compute for the Express API and the Next frontend (`Clariva-bot-1` / marketing host). Request handling, logs. | In memory during a request: webhook bodies, tokens, Graph sends. Logs must not contain raw payloads or tokens (`COMPLIANCE.md`). | Public: https://render.com/legal — executed DPA / date: ⟨fill⟩ | ⟨fill⟩ |
| **OpenAI** | Receptionist replies / intent on inbound DM (and related) text. Service Provider under §5.a. | Message text (redacted phone/email in prompts; still message content). | Public: https://openai.com/policies/data-processing-addendum — executed DPA / date: ⟨fill⟩ | ⟨fill⟩ |
| **Redis** (only if `REDIS_URL` is set) | BullMQ `webhook-processing` queue. Job `payload` is the Graph webhook body. Transient; not written to the app DB. | Full webhook payload (IDs + message/comment text). | Vendor for this URL: ⟨fill — Render Redis / Upstash / other⟩. Executed DPA / date: ⟨fill⟩ | ⟨fill⟩ |

If `REDIS_URL` is unset, webhooks are not queued and Redis is not a processor.

---

## Checked — not Platform Data processors

Inspected 2026-09-17 against `notification-service.ts` and connect/token paths.

| Provider | Why they are out |
|---|---|
| **Resend** | Email is built from Halo Aid appointment / patient rows (time, optional first name, join/booking URL). No IGSID, token, username, or IG message body is passed to Resend. |
| **Twilio SMS** | Same: SMS body is Halo Aid reminder / join copy. Recipient is the patient phone on our row, not an IG-scoped ID. |
| **Twilio Video** | Consult rooms. Not Instagram Platform Data. |
| **Razorpay** | Payments. Not Instagram Platform Data. |

Re-check these if a future send includes `platform_conversation_id`, IG username, or raw DM text.

---

## When this list changes

1. Add a row before the new vendor sees Platform Data.
2. Fill the DPA / contact `⟨fill⟩` in the same sitting.
3. If a vendor is dropped: record the drop date here and confirm deletion (§5.a.iii).
4. Re-snapshot Meta terms when their “Last updated” date bumps (`AUDIT.md` standing obligations).
