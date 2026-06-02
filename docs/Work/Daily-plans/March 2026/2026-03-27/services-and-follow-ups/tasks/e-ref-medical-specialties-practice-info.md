# Reference — Medical specialties (Practice Info)

**Purpose:** Human-readable catalog of specialty strings for **Practice Info → Specialty** (curated, not a regulatory register).

**Source of truth (code):** `frontend/lib/medical-specialties.ts`

- **`MEDICAL_SPECIALTIES_BY_REGION`** — per-region lists (currently only **`IN`** = India).
- **`DEFAULT_MEDICAL_SPECIALTY_REGION`** — `"IN"` until product switches by locale/tenant.
- **`MEDICAL_SPECIALTIES`** — sorted, deduped list for the default region (same as `IN` today).
- **`MEDICAL_SPECIALTY_COUNT`** — length of that list.
- **`getMedicalSpecialties(region?)`** — typed accessor for future regions.

## Region: India (`IN`)

**Intent:** India-first labels — AYUSH, common outpatient/clinic terms (e.g. General Physician, Diabetology), broad MD/MS/DNB/DM/MCh-style names, major paediatric subspecialties, dental (MDS) branches, laboratory & community subjects as used in Indian institutions.

## Count

**112** specialties (after dedupe). Order below is **A–Z** (matches runtime `localeCompare` sort).

## Alphabetical list (India region)

1. Addiction Medicine  
2. Adolescent Medicine  
3. Allergy and Immunology  
4. Anatomic Pathology  
5. Andrology  
6. Anesthesiology  
7. Ayurveda  
8. Biochemistry  
9. Cardiac Surgery  
10. Cardiology  
11. Cardiothoracic and Vascular Surgery  
12. Cardiothoracic Surgery  
13. Child and Adolescent Psychiatry  
14. Clinical Genetics  
15. Clinical Microbiology  
16. Colon and Rectal Surgery  
17. Community Medicine  
18. Conservative Dentistry and Endodontics  
19. Critical Care Medicine  
20. Dentistry  
21. Dermatology  
22. Diabetes and Metabolism  
23. Diabetology  
24. Emergency Medicine  
25. Endocrine Surgery  
26. Endocrinology  
27. Family Medicine  
28. Forensic Medicine  
29. Gastroenterology  
30. Gastrointestinal Surgery  
31. General Medicine  
32. General Physician  
33. General Practice  
34. General Surgery  
35. Geriatric Medicine  
36. Geriatric Psychiatry  
37. Gynecologic Oncology  
38. Hematology  
39. Hepatobiliary and Pancreatic Surgery  
40. Homeopathy  
41. Hospice and Palliative Medicine  
42. Hospital Medicine  
43. Infectious Disease  
44. Internal Medicine  
45. Interventional Cardiology  
46. Interventional Radiology  
47. Maternal-Fetal Medicine  
48. Medical Genetics  
49. Medical Oncology  
50. Neonatology  
51. Nephrology  
52. Neurology  
53. Neuromuscular Medicine  
54. Neuropathology  
55. Neuropsychiatry  
56. Neurosurgery  
57. Nuclear Medicine  
58. Obstetrics and Gynaecology  
59. Occupational Medicine  
60. Ophthalmology  
61. Oral and Maxillofacial Surgery  
62. Oral Medicine and Radiology  
63. Oral Pathology and Microbiology  
64. Orthodontics  
65. Orthopedics  
66. Otolaryngology (ENT)  
67. Pain Medicine  
68. Pathology  
69. Pediatric Cardiology  
70. Pediatric Critical Care  
71. Pediatric Dentistry  
72. Pediatric Emergency Medicine  
73. Pediatric Endocrinology  
74. Pediatric Gastroenterology  
75. Pediatric Hematology-Oncology  
76. Pediatric Infectious Disease  
77. Pediatric Nephrology  
78. Pediatric Neurology  
79. Pediatric Pulmonology  
80. Pediatric Surgery  
81. Pediatrics  
82. Periodontics  
83. Physical Medicine and Rehabilitation  
84. Plastic Surgery  
85. Preventive Medicine  
86. Prosthodontics  
87. Psychiatry  
88. Public Health  
89. Public Health Dentistry  
90. Pulmonology  
91. Radiation Oncology  
92. Radiology  
93. Reproductive Endocrinology and Infertility  
94. Rheumatology  
95. Sexual Medicine  
96. Siddha Medicine  
97. Sleep Medicine  
98. Sowa-Rigpa (Amchi)  
99. Sports Medicine  
100. Surgical Oncology  
101. Thoracic Surgery  
102. Transfusion Medicine  
103. Transplant Hepatology  
104. Transplant Surgery  
105. Trauma Surgery  
106. Tuberculosis and Respiratory Medicine  
107. Unani Medicine  
108. Urgent Care  
109. Urology  
110. Vascular Neurology  
111. Vascular Surgery  
112. Yoga and Naturopathy  

---

**Adding another region:** extend `MEDICAL_SPECIALTIES_BY_REGION_RAW` in `medical-specialties.ts` (e.g. `US: [...]`), add the key to the mapped `MEDICAL_SPECIALTIES_BY_REGION` object, then document here.

**API field:** still free `string | null`, max 200 chars (`backend` validation). Existing saved values outside this list remain valid if the UI allows custom entry alongside the dropdown.

**Last updated:** 2026-03-29 (India region expanded + regional structure)
