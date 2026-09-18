-- APPLY: 9 in-clinic visits on Dr Zurb with prescriptions already filled.
-- Visit 5 (Meera Kapoor) has every letterhead field populated.
-- Visit 6 (Jaspreet Sandhu) is long enough to overflow onto a second page.
-- Visit 7 (Harinder Singh) has ~30 investigations for the two-column tick list.
-- Visits 8–9 (Gurleen Kaur, Vikram Bedi) are packed so preview covers ≥2 pages.
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Prefer: npx ts-node -r dotenv/config scripts/apply-zurb-rx-filled-2026-08-25.ts

BEGIN;

INSERT INTO patients (
  id, name, phone, email, age, gender, date_of_birth,
  guardian_name, guardian_relation, address, alt_phone, doctor_id,
  platform, platform_external_id, consent_status, consent_granted_at, consent_method,
  registered_via, medical_record_number
) VALUES
  ('c2500001-0000-4000-8000-000000000001', 'Anil Verma',      '9000025001', 'desk.zurb.rx01@example.test', 41, 'male',   '1985-02-10', NULL,           NULL,     NULL,                                    NULL,         'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000002', 'Kavita Nair',     '9000025002', 'desk.zurb.rx02@example.test', 36, 'female', '1990-06-18', NULL,           NULL,     NULL,                                    NULL,         'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000003', 'Rohit Malhotra',  '9000025003', 'desk.zurb.rx03@example.test', 48, 'male',   '1978-09-04', NULL,           NULL,     NULL,                                    NULL,         'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000004', 'Sneha Kulkarni',  '9000025004', 'desk.zurb.rx04@example.test', 31, 'female', '1995-01-22', NULL,           NULL,     NULL,                                    NULL,         'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000005', 'Meera Kapoor',    '9000025005', 'desk.zurb.rx05@example.test', 52, 'female', '1974-03-12', 'Arjun Kapoor',  'spouse', '12 Green Avenue, Buter Kalan, Amritsar', '9000025099', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000006', 'Jaspreet Sandhu', '9000025006', 'desk.zurb.rx06@example.test', 64, 'male',   '1962-07-19', 'Simran Sandhu', 'spouse', '44 Mall Road, Buter Kalan, Amritsar',     '9000025098', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000007', 'Harinder Singh',  '9000025007', 'desk.zurb.rx07@example.test', 58, 'male',   '1968-04-03', 'Manjeet Kaur',  'spouse', '8 Court Road, Buter Kalan, Amritsar',     '9000025097', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000008', 'Gurleen Kaur',    '9000025008', 'desk.zurb.rx08@example.test', 67, 'female', '1959-11-08', 'Balwinder Singh', 'spouse', '19 Lawrence Road, Buter Kalan, Amritsar', '9000025096', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2500001-0000-4000-8000-000000000009', 'Vikram Bedi',     '9000025009', 'desk.zurb.rx09@example.test', 71, 'male',   '1955-05-21', 'Neelam Bedi',     'spouse', '3 Kennedy Avenue, Buter Kalan, Amritsar', '9000025095', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  age = EXCLUDED.age,
  gender = EXCLUDED.gender,
  date_of_birth = EXCLUDED.date_of_birth,
  guardian_name = EXCLUDED.guardian_name,
  guardian_relation = EXCLUDED.guardian_relation,
  address = EXCLUDED.address,
  alt_phone = EXCLUDED.alt_phone;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'c2500001-0000-4000-8000-000000000001',
  'c2500001-0000-4000-8000-000000000002',
  'c2500001-0000-4000-8000-000000000003',
  'c2500001-0000-4000-8000-000000000004',
  'c2500001-0000-4000-8000-000000000005',
  'c2500001-0000-4000-8000-000000000006',
  'c2500001-0000-4000-8000-000000000007',
  'c2500001-0000-4000-8000-000000000008',
  'c2500001-0000-4000-8000-000000000009'
);

INSERT INTO appointments (
  id, doctor_id, patient_id, patient_name, patient_phone,
  appointment_date, status, reason_for_visit, consultation_type,
  opd_event_type, booking_origin, notes, patient_checked_in_at
) VALUES
  ('d2500001-0000-4000-8000-000000000001', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000001', 'Anil Verma',     '9000025001', timestamptz '2026-08-25 11:00:00+05:30', 'confirmed', 'Dry cough',                         'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000002', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000002', 'Kavita Nair',    '9000025002', timestamptz '2026-08-25 11:15:00+05:30', 'confirmed', 'Burning micturition',               'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000003', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000003', 'Rohit Malhotra', '9000025003', timestamptz '2026-08-25 11:30:00+05:30', 'confirmed', 'Acidity',                           'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000004', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000004', 'Sneha Kulkarni', '9000025004', timestamptz '2026-08-25 11:45:00+05:30', 'confirmed', 'Migraine',                          'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000005', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000005', 'Meera Kapoor',    '9000025005', timestamptz '2026-08-25 12:00:00+05:30', 'confirmed', 'Asthma review — full Rx preview',          'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000006', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000006', 'Jaspreet Sandhu', '9000025006', timestamptz '2026-08-25 12:15:00+05:30', 'confirmed', 'Two-page Rx — DM / HTN / COPD review',    'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000007', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000007', 'Harinder Singh',  '9000025007', timestamptz '2026-08-25 12:30:00+05:30', 'confirmed', 'Pre-op panel — 30 investigations',        'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000008', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000008', 'Gurleen Kaur',    '9000025008', timestamptz '2026-08-25 12:45:00+05:30', 'confirmed', 'Two-page Rx — RA / bone / thyroid review', 'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now()),
  ('d2500001-0000-4000-8000-000000000009', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2500001-0000-4000-8000-000000000009', 'Vikram Bedi',     '9000025009', timestamptz '2026-08-25 13:00:00+05:30', 'confirmed', 'Two-page Rx — post-CABG / HF / DM review', 'in_clinic', 'standard', 'walk_in', 'zurb rx filled seed 2026-08-25', now())
ON CONFLICT (id) DO UPDATE SET
  appointment_date = EXCLUDED.appointment_date,
  status = EXCLUDED.status,
  consultation_type = EXCLUDED.consultation_type,
  booking_origin = EXCLUDED.booking_origin,
  notes = EXCLUDED.notes,
  patient_checked_in_at = EXCLUDED.patient_checked_in_at;

DELETE FROM prescription_medicines
WHERE prescription_id IN (
  'e2500001-0000-4000-8000-000000000001',
  'e2500001-0000-4000-8000-000000000002',
  'e2500001-0000-4000-8000-000000000003',
  'e2500001-0000-4000-8000-000000000004',
  'e2500001-0000-4000-8000-000000000005',
  'e2500001-0000-4000-8000-000000000006',
  'e2500001-0000-4000-8000-000000000007',
  'e2500001-0000-4000-8000-000000000008',
  'e2500001-0000-4000-8000-000000000009'
);

INSERT INTO prescriptions (
  id, appointment_id, patient_id, doctor_id, type,
  cc, hopi, provisional_diagnosis, investigations_orders,
  advice, follow_up, follow_up_value, follow_up_unit,
  referral, patient_education, sent_to_patient_at
) VALUES
  (
    'e2500001-0000-4000-8000-000000000001',
    'd2500001-0000-4000-8000-000000000001',
    'c2500001-0000-4000-8000-000000000001',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Dry cough for 4 days.',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000002',
    'd2500001-0000-4000-8000-000000000002',
    'c2500001-0000-4000-8000-000000000002',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Burning micturition for 2 days.',
    NULL,
    'Uncomplicated UTI',
    NULL,
    'Drink plenty of fluids.',
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000003',
    'd2500001-0000-4000-8000-000000000003',
    'c2500001-0000-4000-8000-000000000003',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Heartburn after meals for 2 weeks.',
    'Worse at night. No vomiting or black stools. Occasional sour burps.',
    'Gastro-oesophageal reflux',
    NULL,
    'Smaller meals. Avoid late dinner.',
    NULL, NULL, NULL, NULL, NULL, NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000004',
    'd2500001-0000-4000-8000-000000000004',
    'c2500001-0000-4000-8000-000000000004',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Right-sided headache with nausea, 3 episodes this week.',
    'Photophobia. Sleeps it off. No fever or neck stiffness.',
    'Migraine without aura',
    'CBC if headache persists beyond 2 weeks.',
    'Dark quiet room during an attack. Regular sleep.',
    'After 2 weeks if not improving.',
    2, 'weeks',
    NULL, NULL, NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000005',
    'd2500001-0000-4000-8000-000000000005',
    'c2500001-0000-4000-8000-000000000005',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Breathlessness and wheeze for 5 days, worse at night.',
    'Known asthma. Used rescue inhaler 4 times yesterday. No chest pain. Mild fever on day 1, now settled. Sleep interrupted. Walks to the market without stopping today.',
    'Acute asthma exacerbation on known bronchial asthma',
    'CBC, chest X-ray PA, spirometry after recovery.',
    'Sit upright during an attack. Continue inhaler technique as shown. Avoid smoke and cold drinks. Return the same day if lips turn blue or speech is in single words.',
    'Review after 5 days, or sooner if worsening.',
    5, 'days',
    'Chest clinic, Civil Hospital Amritsar — if not better after 5 days or if peak flow stays low.',
    'Rinse mouth after steroid inhaler. Keep the rescue inhaler in the bag, not in a locked drawer.',
    NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000006',
    'd2500001-0000-4000-8000-000000000006',
    'c2500001-0000-4000-8000-000000000006',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Increasing breathlessness on walking to the gurdwara, ankle swelling in the evenings, and burning in both feet for 3 weeks. Also a productive cough most mornings.',
    'Known type 2 diabetes for 12 years, hypertension for 8 years, and COPD for 5 years after long beedi use. Stopped smoking 2 years ago. Metformin 500 mg twice daily; often skips the night dose when dinner is late. Blood pressure at home 150–170 systolic. Uses a salbutamol inhaler most mornings. Last 3 weeks: walks slower, needs one rest on the gurdwara road, two-pillow orthopnoea twice, and ankle swelling by evening that goes down overnight. Burning and numbness in both feet worse at night. Morning cough with a little white sputum; no blood. No chest pain at rest. No fever. Reduced urine in the last week. Eats late, salty sabzi, and two cups of chai with sugar. Walks the village most days but not since the breathlessness increased. Wife notices he is more tired after lunch.',
    'Acute-on-chronic COPD; symptomatic heart-failure overlap; type 2 diabetes with neuropathy; hypertension — not at target',
    'CBC, HbA1c, fasting glucose, creatinine and eGFR, electrolytes, fasting lipid profile, TSH, urine ACR, ECG, chest X-ray PA, spirometry when infection-free. Bring home BP diary and glucometer log to the next visit.',
    'Salt to less than one teaspoon a day. No extra salt on the table. Weigh every morning after passing urine; come the same day if weight rises by 2 kg in 3 days or if breathlessness comes on at rest. Continue inhalers even on good days. Sit upright for the steroid inhaler and rinse the mouth after. Do not stop the water tablet because the swelling has gone. Check sugars before breakfast and before dinner for 7 days. No barefoot walking. Soft shoes. One extra pillow at night if breathless. Return the same day if lips look blue, speech is in single words, or he cannot lie flat.',
    'Review after 7 days with labs and the home BP / sugar diary.',
    7, 'days',
    'Medicine / chest clinic, Civil Hospital Amritsar — if breathlessness stays NYHA III after 7 days, if creatinine rises, or if he needs oxygen. Cardiology if oedema persists after diuretic.',
    'Keep the rescue inhaler in the waistcoat, not in a locked drawer. Show the spacer technique to Simran. If he misses a metformin dose, take it with the next meal; do not double. Call if sugars stay above 300 or if he becomes very sleepy.',
    NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000007',
    'd2500001-0000-4000-8000-000000000007',
    'c2500001-0000-4000-8000-000000000007',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Left inguinal swelling for 8 months, larger on standing and coughing. Surgeon has booked open mesh repair in 3 weeks and asked for a full pre-op panel.',
    'Known hypertension for 6 years on telmisartan. Ultrasound last year showed fatty liver. No chest pain, no known diabetes. Walks the grain market most days. Occasional heartburn after late dinner. No blood in stool. No jaundice. Smoked beedis for 15 years, quit 8 years ago. Drinks 2–3 pegs on weekends. Wife notices snoring. Last BP at the chemist 148/92. Needs fitness for elective hernia surgery at Civil Hospital.',
    'Left inguinal hernia for elective mesh repair; hypertension — not at target; suspected NAFLD; pre-op master checkup',
    'CBC, ESR, peripheral smear, HbA1c, fasting glucose, postprandial glucose, fasting insulin, creatinine and eGFR, urea, electrolytes, uric acid, LFT, fasting lipid profile, TSH, free T4, vitamin D, vitamin B12, iron studies, urine routine, urine ACR, ECG, chest X-ray PA, USG abdomen, 2D echo, TMT, spirometry, PSA, HBsAg, anti-HCV, HIV. Come fasting 10 hours and bring old reports plus the insurance pre-auth form.',
    'Continue the blood-pressure tablet every morning. No beedi, no alcohol until after surgery. Light walk only; do not lift sacks. Soft scrotal support if the swelling aches. Come fasting 10 hours on the lab morning. Bring the old ultrasound and any previous ECG.',
    'Review after 5 days with the full report bundle, before the surgical date.',
    5, 'days',
    'General surgery, Civil Hospital Amritsar — as booked. Cardiology if the TMT is positive or echo shows reduced EF.',
    'Keep the insurance pre-auth form with the lab reports in one file. Do not stop the BP tablet on the morning of blood tests. Call if the swelling becomes red, painful, or will not reduce.',
    NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000008',
    'd2500001-0000-4000-8000-000000000008',
    'c2500001-0000-4000-8000-000000000008',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Pain and swelling in both wrists and the small joints of the hands for 4 months, morning stiffness lasting more than an hour, and a recent fall with back pain. Also tiredness and hair thinning.',
    'Known rheumatoid arthritis for 9 years, originally diagnosed at Civil Hospital after six months of knuckle pain. Was on methotrexate 10 mg weekly and hydroxychloroquine; stopped methotrexate on her own 8 weeks ago because of mouth ulcers and nausea. Stiffness is worst from 5 to 7 am; takes an hour to open a jar or button a kameez. Both wrists swollen; right MCP joints tender. Right knee clicks on stairs. Fell in the courtyard 12 days ago, landed on the left hip; walks with a stick since. Bone density last year was osteoporotic at the spine. Known hypothyroidism on thyroxine 75 mcg; last TSH was 8.2. Heartburn most nights if she skips the antacid. Sleeps poorly because of joint pain and a racing mind. Appetite reduced. No fever, no new rash, no dry mouth that is new. Weight down 3 kg in 2 months. Daughter notices she is slower getting out of the chair. Uses diclofenac gel twice a day and paracetamol at night. No known drug allergy. Lives with her husband; he will supervise the weekly methotrexate. Has not had an eye check for hydroxychloroquine in 18 months. Occasional dizziness on standing. Constipation for 2 weeks after the painkillers. No chest pain at rest. Walks only to the courtyard now.',
    'Active rheumatoid arthritis after self-stopping methotrexate; osteoporosis with recent fall; hypothyroidism — not at target; GERD; neuropathic pain; iron deficiency symptoms',
    'CBC; ESR; CRP; RF; anti-CCP; LFT; creatinine and eGFR; electrolytes; TSH; free T4; fasting glucose; HbA1c; vitamin D; vitamin B12; iron studies; DEXA scan; X-ray both hands PA; X-ray lumbosacral spine; ECG; urine routine. Bring the last bone-density report and the hydroxychloroquine eye-check card if she has one.',
    'Restart methotrexate only on the day written on the strip — Saturday after food — and take folic acid the next day, not the same morning. Do not take two painkillers together. Sit up for 30 minutes after the weekly bone tablet; do not lie down and do not take it with milk or tea. Thyroxine on an empty stomach, then wait 45 minutes before chai. Use the stick on the courtyard tiles. Soft shoes. No floor sitting. Weigh once a week. Return the same day if she has black stools, yellow eyes, unexplained fever, or breathlessness at rest. Keep a written list of every tablet in the steel box so the chemist does not swap brands.',
    'Review after 14 days with labs, before increasing methotrexate.',
    14, 'days',
    'Rheumatology, Civil Hospital Amritsar — if joints stay swollen after 4 weeks or if methotrexate is not tolerated. Ophthalmology for hydroxychloroquine baseline. Orthopaedics if hip pain persists after the fall films.',
    'Mouth ulcers after methotrexate: skip the next weekly dose and call. Folic acid is not optional. Eye drops four times a day while on hydroxychloroquine. Do not start an over-the-counter pain oil that smells of menthol on broken skin. Show Balwinder the Saturday methotrexate ritual once this week.',
    NULL
  ),
  (
    'e2500001-0000-4000-8000-000000000009',
    'd2500001-0000-4000-8000-000000000009',
    'c2500001-0000-4000-8000-000000000009',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'structured',
    'Breathlessness on one flight of stairs, ankle swelling by evening, and fasting sugars 180–220 for 3 weeks. Also a pulling pain in the left calf after walking to the gate.',
    'Triple-vessel CABG 11 months ago at a private hospital in Ludhiana. Was walking to the gurdwara without a stop until 6 weeks ago. Now needs one rest on the stairs and sleeps on two pillows twice a week. Ankle swelling by 6 pm that goes down overnight. Home BP 140–160 systolic; he skips the evening water tablet when he has to travel. Type 2 diabetes for 18 years; on metformin and a night insulin that he sometimes forgets if dinner is late. Fasting sugars 180–220, post-meal 240 last week. Known reduced EF 38% on the last echo. Creatinine 1.6 two months ago. Gout in the right first toe last winter; he still keeps a painkiller at home. Atrial fibrillation on the discharge ECG; not sure if he is still meant to take the blood thinner with aspirin. Occasional palpitations after chai. No chest pain at rest. No black stools. Smoked for 30 years, quit the day of surgery. Drinks one peg on Sunday. Wife says he is more tired after lunch and naps in the chair. Reduced urine in the last 4 days after extra salt at a wedding. Walks the colony most mornings but stopped the last 10 days because of the calf pull. Uses the GTN spray once last month for a tight feeling that settled in 3 minutes.',
    'HFrEF after CABG; type 2 diabetes — not at target; CKD stage 3; possible claudication; gout history; hypertension — not at target; query residual angina',
    'CBC; HbA1c; fasting glucose; creatinine and eGFR; electrolytes; fasting lipid profile; TSH; urine ACR; BNP or NT-proBNP; ECG; chest X-ray PA; 2D echo; TMT if echo is stable; arterial Doppler both legs; uric acid; LFT. Bring the CABG discharge summary, the last echo, and the home BP / sugar diary.',
    'Salt to less than one teaspoon a day. Weigh every morning after urine; come the same day if weight rises by 2 kg in 3 days or if he cannot lie flat. Do not skip the water tablet because the swelling has gone. Check sugars fasting and before dinner for 7 days. Continue both blood thinners unless a surgeon writes a hold date. Sit upright for the inhaler-style GTN spray — one puff, sit, second puff after 5 minutes if pain stays, then come to casualty. Soft shoes. No barefoot walking. One extra pillow if breathless at night. No extra painkiller for the gout toe without calling — it fights the blood thinner. Return the same day if lips look blue, speech is in single words, or calf pain comes on at rest.',
    'Review after 7 days with labs, echo date, and the home BP / sugar diary.',
    7, 'days',
    'Cardiology, Civil Hospital Amritsar — if breathlessness stays NYHA III, if BNP is high, or if Doppler shows flow-limiting disease. Endocrinology if HbA1c stays above 8 after insulin is regular. Vascular surgery if rest pain or a cold foot appears.',
    'Keep the GTN spray in the waistcoat, not in a locked drawer. Show Neelam the morning weigh and the insulin pen clicks. If he misses the night insulin, take it with a small snack; do not double the next morning. Call if sugars stay above 300 or if he becomes very sleepy. Do not stop the statin because of leg cramps until we see the CK.',
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  cc = EXCLUDED.cc,
  hopi = EXCLUDED.hopi,
  provisional_diagnosis = EXCLUDED.provisional_diagnosis,
  investigations_orders = EXCLUDED.investigations_orders,
  advice = EXCLUDED.advice,
  follow_up = EXCLUDED.follow_up,
  follow_up_value = EXCLUDED.follow_up_value,
  follow_up_unit = EXCLUDED.follow_up_unit,
  referral = EXCLUDED.referral,
  patient_education = EXCLUDED.patient_education,
  sent_to_patient_at = EXCLUDED.sent_to_patient_at;

INSERT INTO prescription_medicines (
  id, prescription_id, medicine_name, dosage, route, frequency, duration, instructions,
  sort_order, frequency_code, duration_value, duration_unit, route_code,
  dose_qty, dose_unit, form, food_timing
) VALUES
  ('f2500001-0000-4000-8000-000000000001', 'e2500001-0000-4000-8000-000000000001', 'Cough syrup (dextromethorphan)', '10 ml',  'Oral',    'Thrice daily', '5 days',  NULL,                              0, 'TID', 5,  'days',  'oral',    10, 'ml',   'syrup',   NULL),
  ('f2500001-0000-4000-8000-000000000002', 'e2500001-0000-4000-8000-000000000002', 'Nitrofurantoin 100 mg',           '100 mg', 'Oral',    'Twice daily',  '5 days',  NULL,                              0, 'BID', 5,  'days',  'oral',     1, 'cap',  'cap',     'with_food'),
  ('f2500001-0000-4000-8000-000000000003', 'e2500001-0000-4000-8000-000000000003', 'Pantoprazole 40 mg',              '40 mg',  'Oral',    'Once daily',   '14 days', NULL,                              0, 'OD',  14, 'days',  'oral',     1, 'tab',  'tab',     'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000004', 'e2500001-0000-4000-8000-000000000003', 'Domperidone 10 mg',               '10 mg',  'Oral',    'Twice daily',  '7 days',  NULL,                              1, 'BID', 7,  'days',  'oral',     1, 'tab',  'tab',     'before_food'),
  ('f2500001-0000-4000-8000-000000000005', 'e2500001-0000-4000-8000-000000000004', 'Naproxen 250 mg',                 '250 mg', 'Oral',    'Twice daily',  '3 days',  'Take at onset of headache.',     0, 'BID', 3,  'days',  'oral',     1, 'tab',  'tab',     'after_food'),
  ('f2500001-0000-4000-8000-000000000006', 'e2500001-0000-4000-8000-000000000004', 'Ondansetron 4 mg',                '4 mg',   'Oral',    'As needed',    '3 days',  'For nausea.',                    1, 'BID', 3,  'days',  'oral',     1, 'tab',  'tab',     NULL),
  ('f2500001-0000-4000-8000-000000000007', 'e2500001-0000-4000-8000-000000000005', 'Salbutamol inhaler 100 mcg',      '100 mcg','Inhaled', 'As needed',    '14 days', '2 puffs when wheezy. Shake well.', 0, 'PRN', 14, 'days',  'inhaled',  2, 'puff', 'inhaler', NULL),
  ('f2500001-0000-4000-8000-000000000008', 'e2500001-0000-4000-8000-000000000005', 'Budesonide inhaler 200 mcg',      '200 mcg','Inhaled', 'Twice daily',  '4 weeks', 'Rinse mouth after each use.',   1, 'BID', 4,  'weeks', 'inhaled',  2, 'puff', 'inhaler', NULL),
  ('f2500001-0000-4000-8000-000000000009', 'e2500001-0000-4000-8000-000000000005', 'Prednisolone 10 mg',              '30 mg',  'Oral',    'Once daily',   '5 days',  'Morning dose. Do not stop early.', 2, 'OD',  5,  'days',  'oral',     3, 'tab',  'tab',     'after_food'),
  ('f2500001-0000-4000-8000-00000000000a', 'e2500001-0000-4000-8000-000000000005', 'Montelukast 10 mg',               '10 mg',  'Oral',    'At bedtime',   '14 days', NULL,                              3, 'QHS', 14, 'days',  'oral',     1, 'tab',  'tab',     'bedtime'),
  ('f2500001-0000-4000-8000-00000000000b', 'e2500001-0000-4000-8000-000000000006', 'Metformin 500 mg',                '500 mg', 'Oral',    'Twice daily',  '30 days', 'With breakfast and dinner. Do not skip the night dose.', 0, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'with_food'),
  ('f2500001-0000-4000-8000-00000000000c', 'e2500001-0000-4000-8000-000000000006', 'Glimepiride 1 mg',                '1 mg',   'Oral',    'Once daily',   '30 days', 'Before breakfast. Keep sugar nearby if sweaty or shaky.', 1, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'before_food'),
  ('f2500001-0000-4000-8000-00000000000d', 'e2500001-0000-4000-8000-000000000006', 'Telmisartan 40 mg',               '40 mg',  'Oral',    'Once daily',   '30 days', 'Same time each morning.', 2, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-00000000000e', 'e2500001-0000-4000-8000-000000000006', 'Amlodipine 5 mg',                 '5 mg',   'Oral',    'Once daily',   '30 days', 'May cause ankle swelling; tell us if it increases.', 3, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-00000000000f', 'e2500001-0000-4000-8000-000000000006', 'Torsemide 10 mg',                 '10 mg',  'Oral',    'Once daily',   '7 days',  'Morning dose. Expect more urine for 4 hours.', 4, 'OD', 7, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000010', 'e2500001-0000-4000-8000-000000000006', 'Atorvastatin 10 mg',              '10 mg',  'Oral',    'At bedtime',   '30 days', NULL, 5, 'QHS', 30, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-000000000011', 'e2500001-0000-4000-8000-000000000006', 'Aspirin 75 mg',                   '75 mg',  'Oral',    'Once daily',   '30 days', 'After dinner. Stop and call if black stools.', 6, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000012', 'e2500001-0000-4000-8000-000000000006', 'Tiotropium inhaler 18 mcg',       '18 mcg', 'Inhaled', 'Once daily',   '30 days', 'One puff every morning. Do not swallow the capsule.', 7, 'OD', 30, 'days', 'inhaled', 1, 'puff', 'inhaler', NULL),
  ('f2500001-0000-4000-8000-000000000013', 'e2500001-0000-4000-8000-000000000006', 'Budesonide-formoterol inhaler',   '200/6 mcg', 'Inhaled', 'Twice daily', '30 days', 'Two puffs morning and night. Rinse mouth after.', 8, 'BID', 30, 'days', 'inhaled', 2, 'puff', 'inhaler', NULL),
  ('f2500001-0000-4000-8000-000000000014', 'e2500001-0000-4000-8000-000000000006', 'Salbutamol inhaler 100 mcg',      '100 mcg','Inhaled', 'As needed',    '30 days', '2 puffs when wheezy. Come in if more than 8 puffs in a day.', 9, 'PRN', 30, 'days', 'inhaled', 2, 'puff', 'inhaler', NULL),
  ('f2500001-0000-4000-8000-000000000015', 'e2500001-0000-4000-8000-000000000006', 'Pantoprazole 40 mg',              '40 mg',  'Oral',    'Once daily',   '14 days', NULL, 10, 'OD', 14, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000016', 'e2500001-0000-4000-8000-000000000006', 'Pregabalin 75 mg',                '75 mg',  'Oral',    'At bedtime',   '14 days', 'For foot burning. May cause morning drowsiness.', 11, 'QHS', 14, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-000000000017', 'e2500001-0000-4000-8000-000000000007', 'Telmisartan 40 mg',               '40 mg',  'Oral',    'Once daily',   '30 days', 'Same time each morning. Do not skip on the lab day.', 0, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000018', 'e2500001-0000-4000-8000-000000000007', 'Atorvastatin 10 mg',              '10 mg',  'Oral',    'At bedtime',   '30 days', 'Continue unless the surgeon asks to hold it.', 1, 'QHS', 30, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-000000000019', 'e2500001-0000-4000-8000-000000000007', 'Pantoprazole 40 mg',              '40 mg',  'Oral',    'Once daily',   '14 days', 'Before breakfast.', 2, 'OD', 14, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-00000000001a', 'e2500001-0000-4000-8000-000000000007', 'Paracetamol 500 mg',              '500 mg', 'Oral',    'As needed',    '7 days',  'For ache at the hernia site. Max 3 tablets in a day.', 3, 'PRN', 7, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000001b', 'e2500001-0000-4000-8000-000000000007', 'Ferrous ascorbate 100 mg',        '100 mg', 'Oral',    'Once daily',   '30 days', 'After lunch. Stools may turn dark.', 4, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000001c', 'e2500001-0000-4000-8000-000000000007', 'Vitamin D3 60k IU',               '60k IU', 'Oral',    'Once daily',   '4 weeks', 'One sachet weekly after dinner, not daily. Mix in milk.', 5, 'OD', 4, 'weeks', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000001d', 'e2500001-0000-4000-8000-000000000008', 'Methotrexate 15 mg',              '15 mg',  'Oral',    'Once weekly',  '4 weeks',  'Saturday after food. Never on the folic-acid day.', 0, 'CUSTOM', 4, 'weeks', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000001e', 'e2500001-0000-4000-8000-000000000008', 'Folic acid 5 mg',                 '5 mg',   'Oral',    'Once weekly',  '4 weeks',  'Sunday morning. Skip if she already took it with a multivitamin.', 1, 'CUSTOM', 4, 'weeks', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000001f', 'e2500001-0000-4000-8000-000000000008', 'Hydroxychloroquine 200 mg',       '200 mg', 'Oral',    'Twice daily',  '30 days',  'With meals. Book the eye check before the next refill.', 2, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'with_food'),
  ('f2500001-0000-4000-8000-000000000020', 'e2500001-0000-4000-8000-000000000008', 'Prednisolone 5 mg',               '5 mg',   'Oral',    'Once daily',   '14 days',  'Morning dose. Do not stop suddenly.', 3, 'OD', 14, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000021', 'e2500001-0000-4000-8000-000000000008', 'Sulfasalazine 500 mg',            '500 mg', 'Oral',    'Twice daily',  '30 days',  'Start one tablet for 7 days, then two. Stools may turn orange.', 4, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000022', 'e2500001-0000-4000-8000-000000000008', 'Leflunomide 10 mg',               '10 mg',  'Oral',    'Once daily',   '30 days',  'Same time each morning. Tell us if hair thinning increases.', 5, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000023', 'e2500001-0000-4000-8000-000000000008', 'Calcium carbonate 500 mg',        '500 mg', 'Oral',    'Twice daily',  '30 days',  'Away from the thyroid tablet by at least 4 hours.', 6, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000024', 'e2500001-0000-4000-8000-000000000008', 'Vitamin D3 60k IU',               '60k IU', 'Oral',    'Once weekly',  '8 weeks',  'One sachet weekly after dinner. Mix in milk, not tea.', 7, 'CUSTOM', 8, 'weeks', 'oral', 1, 'tab', 'sachet', 'after_food'),
  ('f2500001-0000-4000-8000-000000000025', 'e2500001-0000-4000-8000-000000000008', 'Alendronate 70 mg',               '70 mg',  'Oral',    'Once weekly',  '12 weeks', 'Monday on empty stomach with a full glass of water. Stay upright 30 min.', 8, 'CUSTOM', 12, 'weeks', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000026', 'e2500001-0000-4000-8000-000000000008', 'Thyroxine 75 mcg',                '75 mcg', 'Oral',    'Once daily',   '30 days',  'Empty stomach. Wait 45 minutes before tea or calcium.', 9, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000027', 'e2500001-0000-4000-8000-000000000008', 'Pantoprazole 40 mg',              '40 mg',  'Oral',    'Once daily',   '30 days',  'Before breakfast.', 10, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000028', 'e2500001-0000-4000-8000-000000000008', 'Paracetamol 650 mg',              '650 mg', 'Oral',    'Thrice daily', '14 days',  'Maximum 3 tablets in a day. Do not add another cold tablet that has paracetamol.', 11, 'TID', 14, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000029', 'e2500001-0000-4000-8000-000000000008', 'Tramadol 50 mg',                  '50 mg',  'Oral',    'As needed',    '7 days',   'Only if pain stops her sleeping. May cause constipation and dizziness.', 12, 'PRN', 7, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000002a', 'e2500001-0000-4000-8000-000000000008', 'Gabapentin 100 mg',               '100 mg', 'Oral',    'At bedtime',   '14 days',  'For night burning in the feet. May cause morning unsteadiness.', 13, 'QHS', 14, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-00000000002b', 'e2500001-0000-4000-8000-000000000008', 'Ferrous ascorbate 100 mg',        '100 mg', 'Oral',    'Once daily',   '30 days',  'After lunch. Stools may turn dark. Away from thyroxine.', 14, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000002c', 'e2500001-0000-4000-8000-000000000008', 'Methylcobalamin 1500 mcg',        '1500 mcg','Oral',   'Once daily',   '30 days',  NULL, 15, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000002d', 'e2500001-0000-4000-8000-000000000008', 'Pregabalin 75 mg',                '75 mg',  'Oral',    'At bedtime',   '14 days',  'Do not combine with tramadol on the same night unless pain is severe.', 16, 'QHS', 14, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-00000000002e', 'e2500001-0000-4000-8000-000000000008', 'Melatonin 3 mg',                  '3 mg',   'Oral',    'At bedtime',   '14 days',  'Thirty minutes before lights out. Stop if morning hangover lasts past 10 am.', 17, 'QHS', 14, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-00000000002f', 'e2500001-0000-4000-8000-000000000008', 'Diclofenac gel 1%',               '1%',     'Topical', 'Thrice daily', '14 days',  'Thin layer on wrists and the right knee. Not on broken skin.', 18, 'TID', 14, 'days', 'topical', 1, 'application', 'gel', NULL),
  ('f2500001-0000-4000-8000-000000000030', 'e2500001-0000-4000-8000-000000000008', 'Carboxymethylcellulose 0.5%',     '1 drop', 'Topical', 'Four times daily', '30 days', 'Both eyes. Wait 5 minutes before any other drop.', 19, 'TID', 30, 'days', 'topical', 1, 'drops', 'drops', NULL),
  ('f2500001-0000-4000-8000-000000000031', 'e2500001-0000-4000-8000-000000000009', 'Aspirin 75 mg',                   '75 mg',  'Oral',    'Once daily',   '30 days',  'After dinner. Stop and call if black stools.', 0, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000032', 'e2500001-0000-4000-8000-000000000009', 'Clopidogrel 75 mg',               '75 mg',  'Oral',    'Once daily',   '30 days',  'With aspirin until cardiology writes a stop date.', 1, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000033', 'e2500001-0000-4000-8000-000000000009', 'Atorvastatin 40 mg',              '40 mg',  'Oral',    'At bedtime',   '30 days',  'Tell us if new muscle pain, then we will check CK.', 2, 'QHS', 30, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-000000000034', 'e2500001-0000-4000-8000-000000000009', 'Metoprolol XL 50 mg',             '50 mg',  'Oral',    'Once daily',   '30 days',  'Same time each morning. Do not stop suddenly.', 3, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000035', 'e2500001-0000-4000-8000-000000000009', 'Ramipril 5 mg',                   '5 mg',   'Oral',    'Once daily',   '30 days',  'Morning dose. Sit on the bed edge for a minute before standing.', 4, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000036', 'e2500001-0000-4000-8000-000000000009', 'Spironolactone 25 mg',            '25 mg',  'Oral',    'Once daily',   '30 days',  'After breakfast. Hold if diarrhoea or if we hold it for high potassium.', 5, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000037', 'e2500001-0000-4000-8000-000000000009', 'Torsemide 10 mg',                 '10 mg',  'Oral',    'Once daily',   '14 days',  'Morning dose. Expect more urine for 4 hours. Do not skip on travel days.', 6, 'OD', 14, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000038', 'e2500001-0000-4000-8000-000000000009', 'Dapagliflozin 10 mg',             '10 mg',  'Oral',    'Once daily',   '30 days',  'Morning. Extra genital hygiene. Hold if vomiting or not eating.', 7, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'before_food'),
  ('f2500001-0000-4000-8000-000000000039', 'e2500001-0000-4000-8000-000000000009', 'Metformin 500 mg',                '500 mg', 'Oral',    'Twice daily',  '30 days',  'With breakfast and dinner. Do not skip the night dose.', 8, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'with_food'),
  ('f2500001-0000-4000-8000-00000000003a', 'e2500001-0000-4000-8000-000000000009', 'Insulin glargine',                '10 units','Subcutaneous','At bedtime','30 days', 'Night pen. Rotate the site. Do not omit if dinner is late — take with a snack.', 9, 'QHS', 30, 'days', 'SC', 10, 'unit', 'inj', 'bedtime'),
  ('f2500001-0000-4000-8000-00000000003b', 'e2500001-0000-4000-8000-000000000009', 'Isosorbide mononitrate 30 mg',    '30 mg',  'Oral',    'Once daily',   '30 days',  'Morning. Headache for 2–3 days is common; take paracetamol, do not stop.', 10, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-00000000003c', 'e2500001-0000-4000-8000-000000000009', 'Ivabradine 5 mg',                 '5 mg',   'Oral',    'Twice daily',  '30 days',  'If pulse at home stays above 80 on the beta blocker.', 11, 'BID', 30, 'days', 'oral', 1, 'tab', 'tab', 'with_food'),
  ('f2500001-0000-4000-8000-00000000003d', 'e2500001-0000-4000-8000-000000000009', 'Pantoprazole 40 mg',              '40 mg',  'Oral',    'Once daily',   '30 days',  'Before breakfast while on dual blood thinners.', 12, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-00000000003e', 'e2500001-0000-4000-8000-000000000009', 'Allopurinol 100 mg',              '100 mg', 'Oral',    'Once daily',   '30 days',  'After food. Not for an acute gout attack — call first.', 13, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-00000000003f', 'e2500001-0000-4000-8000-000000000009', 'Thyroxine 50 mcg',                '50 mcg', 'Oral',    'Once daily',   '30 days',  'Empty stomach. Wait 45 minutes before tea.', 14, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'empty_stomach'),
  ('f2500001-0000-4000-8000-000000000040', 'e2500001-0000-4000-8000-000000000009', 'Amlodipine 2.5 mg',               '2.5 mg', 'Oral',    'Once daily',   '30 days',  'If home systolic stays above 150 after a week. May add ankle swelling.', 15, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', NULL),
  ('f2500001-0000-4000-8000-000000000041', 'e2500001-0000-4000-8000-000000000009', 'Potassium chloride 600 mg',       '600 mg', 'Oral',    'Once daily',   '7 days',   'After lunch for 7 days only. Stop if loose stools.', 16, 'OD', 7, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000042', 'e2500001-0000-4000-8000-000000000009', 'Glyceryl trinitrate spray',       '400 mcg','Sublingual','As needed',  '30 days',  'Sit. One spray under the tongue. Second after 5 min if pain stays, then casualty.', 17, 'PRN', 30, 'days', 'sublingual', 1, 'puff', 'spray', NULL),
  ('f2500001-0000-4000-8000-000000000043', 'e2500001-0000-4000-8000-000000000009', 'Paracetamol 650 mg',              '650 mg', 'Oral',    'As needed',    '14 days',  'For nitrate headache or calf ache. Max 3 tablets a day. No other painkiller.', 18, 'PRN', 14, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000044', 'e2500001-0000-4000-8000-000000000009', 'Multivitamin',                    '1 tab',  'Oral',    'Once daily',   '30 days',  NULL, 19, 'OD', 30, 'days', 'oral', 1, 'tab', 'tab', 'after_food'),
  ('f2500001-0000-4000-8000-000000000045', 'e2500001-0000-4000-8000-000000000009', 'Pregabalin 75 mg',                '75 mg',  'Oral',    'At bedtime',   '14 days',  'For burning in the feet. May cause morning drowsiness.', 20, 'QHS', 14, 'days', 'oral', 1, 'tab', 'tab', 'bedtime'),
  ('f2500001-0000-4000-8000-000000000046', 'e2500001-0000-4000-8000-000000000009', 'Salbutamol inhaler 100 mcg',      '100 mcg','Inhaled', 'As needed',    '30 days',  '2 puffs if breathless after a walk. Come in if more than 8 puffs in a day.', 21, 'PRN', 30, 'days', 'inhaled', 2, 'puff', 'inhaler', NULL);

COMMIT;
