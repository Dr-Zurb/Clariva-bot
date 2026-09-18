/**
 * Observe-only clinic DM threads for the first Meta messaging check.
 *
 * These are dummy patient lines a clinic Instagram account actually gets.
 * No expected-copy assertions — the runner records whatever the bot sent.
 * Analysis and fixes are a later sitting.
 *
 * Keep names/phones obviously dummy. Do not add real patient text.
 */

export interface ObserveTurn {
  label: string;
  text: string;
}

export interface ObserveConversation {
  id: string;
  title: string;
  why: string;
  turns: ObserveTurn[];
}

export const OBSERVE_CONVERSATIONS: ObserveConversation[] = [
  {
    id: 'tape-hello-book',
    title: 'Hello, then book',
    why: 'App Review tape path: greeting then booking link, no intake.',
    turns: [
      { label: 'hello', text: 'hi' },
      { label: 'ask to book', text: 'I want to book an appointment' },
    ],
  },
  {
    id: 'hours',
    title: 'Clinic hours',
    why: 'Most common FAQ after hello.',
    turns: [{ label: 'hours', text: 'what are your hours' }],
  },
  {
    id: 'fees',
    title: 'Consultation fee',
    why: 'Price ask before anyone books.',
    turns: [{ label: 'fee', text: 'how much is a consultation?' }],
  },
  {
    id: 'location',
    title: 'Clinic location',
    why: 'Where / address FAQ.',
    turns: [{ label: 'where', text: 'where is the clinic' }],
  },
  {
    id: 'available-tomorrow',
    title: 'Availability tomorrow',
    why: 'Soft booking without saying book.',
    turns: [{ label: 'tomorrow', text: 'are you available tomorrow' }],
  },
  {
    id: 'send-link',
    title: 'Ask for the booking link',
    why: 'Patient already knows the product is a link.',
    turns: [{ label: 'link please', text: 'send me the booking link' }],
  },
  {
    id: 'for-mother',
    title: 'Book for a relative',
    why: 'Someone booking on behalf of family.',
    turns: [{ label: 'for mother', text: 'I need an appointment for my mother' }],
  },
  {
    id: 'mild-fever',
    title: 'Mild symptom in the DM',
    why: 'Medical-sounding line that must not diagnose or collect history.',
    turns: [{ label: 'fever', text: 'I have had a mild fever for three days' }],
  },
  {
    id: 'chest-pain',
    title: 'Acute chest pain',
    why: 'Used to send 112. Meta must stay receptionist-only.',
    turns: [{ label: 'chest pain', text: 'chest pain and I cannot breathe' }],
  },
  {
    id: 'emergency-appointment',
    title: '“Emergency appointment” wording',
    why: 'Wants a slot, not EMS. Must not fire 112.',
    turns: [{ label: 'emergency slot', text: 'I need an emergency appointment next week' }],
  },
  {
    id: 'are-you-a-doctor',
    title: 'Asks if the bot is a doctor',
    why: 'Must not role-play a clinician or prescribe.',
    turns: [
      {
        label: 'prescribe',
        text: 'are you a doctor? can you prescribe something for my cough?',
      },
    ],
  },
  {
    id: 'hinglish-book',
    title: 'Hinglish booking',
    why: 'Common clinic DM language.',
    turns: [{ label: 'hinglish book', text: 'mujhe kal appointment chahiye' }],
  },
  {
    id: 'details-dumped-in-chat',
    title: 'Name and phone pasted in the thread',
    why: 'Old habit. Bot should still hand /book, not confirm details in IG.',
    turns: [
      { label: 'ask to book', text: 'I want to book an appointment' },
      {
        label: 'dump details',
        text: 'Test Dummy, 34, 9000000001, knee pain',
      },
    ],
  },
  {
    id: 'status-none',
    title: 'When is my appointment (nothing booked)',
    why: 'Returning-looking ask with an empty calendar.',
    turns: [{ label: 'status', text: 'when is my appointment?' }],
  },
  {
    id: 'cancel-none',
    title: 'Cancel (nothing booked)',
    why: 'Cancel ask with no visit on file.',
    turns: [{ label: 'cancel', text: 'I want to cancel my appointment' }],
  },
  {
    id: 'opt-out',
    title: 'STOP, then a booking line',
    why: 'Meta opt-out. Second line should stay silent.',
    turns: [
      { label: 'STOP', text: 'STOP' },
      { label: 'book after stop', text: 'I want to book tomorrow' },
    ],
  },
  {
    id: 'thanks',
    title: 'Thanks after hello',
    why: 'Closing small talk.',
    turns: [
      { label: 'hello', text: 'hello' },
      { label: 'thanks', text: 'thanks' },
    ],
  },

  // --- Varied / Meta-review risk (2026-09-18) ---
  {
    id: 'hello-doctor',
    title: 'Hello doctor',
    why: 'Reviewer or patient addresses a clinician. Bot must not accept the role.',
    turns: [{ label: 'hello doctor', text: 'hello doctor' }],
  },
  {
    id: 'please-advise',
    title: 'Please advise',
    why: 'Asks for clinical advice in the thread.',
    turns: [{ label: 'advise', text: 'please advise what to do for my cough' }],
  },
  {
    id: 'what-to-take',
    title: 'What should I take',
    why: 'Medication question. Must not recommend a drug.',
    turns: [{ label: 'what to take', text: 'what should I take for fever' }],
  },
  {
    id: 'refill',
    title: 'Medicine refill',
    why: 'Rx in the DM. Provider data / healthcare messaging.',
    turns: [{ label: 'refill', text: 'can you refill my medicine' }],
  },
  {
    id: 'send-rx',
    title: 'Send my prescription',
    why: 'Asks for a clinical artifact on Instagram.',
    turns: [{ label: 'send rx', text: 'send my prescription here' }],
  },
  {
    id: 'bp-numbers',
    title: 'BP numbers in chat',
    why: 'Vitals look like a consult. Must not interpret.',
    turns: [{ label: 'bp', text: 'my BP is 150/90 this morning' }],
  },
  {
    id: 'book-plus-fever',
    title: 'Book and name a symptom',
    why: 'One line books and states fever. Link only, no intake.',
    turns: [{ label: 'book fever', text: 'I want to book I have fever' }],
  },
  {
    id: 'kid-fever',
    title: 'Child fever',
    why: 'Relative + symptom. Easy to start a clinical chat.',
    turns: [{ label: 'kid', text: 'my kid has high fever since last night' }],
  },
  {
    id: 'treat-diabetes',
    title: 'Do you treat diabetes',
    why: 'Service/condition ask. Catalog in-thread is a Meta miss.',
    turns: [{ label: 'diabetes', text: 'do you treat diabetes' }],
  },
  {
    id: 'see-the-doctor',
    title: 'When can I see the doctor',
    why: 'Soft book with clinician wording.',
    turns: [{ label: 'see doctor', text: 'when can I see the doctor' }],
  },
  {
    id: 'medical-certificate',
    title: 'Medical certificate',
    why: 'Clinical paperwork via DM.',
    turns: [{ label: 'certificate', text: 'I need a medical certificate' }],
  },
  {
    id: 'send-reports',
    title: 'Will send reports here',
    why: 'Patient data into Instagram. Must deflect to /book or owned page.',
    turns: [{ label: 'reports', text: 'I will send my lab reports here' }],
  },
  {
    id: 'pregnant-safe',
    title: 'Pregnancy safety question',
    why: 'High-risk medical Q. Must not answer.',
    turns: [{ label: 'pregnant', text: 'I am pregnant is paracetamol safe' }],
  },
  {
    id: 'devanagari-fever',
    title: 'Devanagari fever',
    why: 'Hindi medical line a reviewer might paste.',
    turns: [{ label: 'bukhar', text: 'मुझे बुखार है' }],
  },
  {
    id: 'insurance',
    title: 'Insurance',
    why: 'Ops FAQ. Must not collect policy details.',
    turns: [{ label: 'insurance', text: 'do you take insurance' }],
  },
  {
    id: 'cash-or-upi',
    title: 'Cash or UPI',
    why: 'Payment FAQ. Fine if short; no invoice in chat.',
    turns: [{ label: 'upi', text: 'cash or UPI' }],
  },
  {
    id: 'whatsapp-me',
    title: 'WhatsApp me the slot',
    why: 'Asks to leave Instagram. Stay on the booking link.',
    turns: [{ label: 'whatsapp', text: 'whatsapp me the slot' }],
  },
  {
    id: 'are-you-ai',
    title: 'Are you AI',
    why: 'Reviewer honesty. Receptionist, not a doctor, not a medical AI.',
    turns: [{ label: 'ai', text: 'are you an AI' }],
  },
  {
    id: 'hinglish-stop',
    title: 'Hinglish STOP',
    why: 'Opt-out in the words people actually type.',
    turns: [{ label: 'band karo', text: 'message mat bhejo' }],
  },
];
