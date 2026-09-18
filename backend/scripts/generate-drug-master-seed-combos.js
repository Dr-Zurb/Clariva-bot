/**
 * Generates backend/migrations/230_drug_master_seed_expand_combos.sql
 *
 * Same-pass cleanup + India-focused FDC / programme expand.
 * Brand names stay stored as a hidden search + allergy-match key.
 *
 * Usage: node backend/scripts/generate-drug-master-seed-combos.js
 */

const fs = require("fs");
const path = require("path");

/** True-duplicate rows (same molecule + form + strength as an existing row). */
const DELETE_GENERICS = [
  "Rifaximin (hepatic)",
  "Baclofen (neuro)",
  "Hydroxychloroquine (rheum)",
  "Sulfasalazine (rheum)",
  "Sodium Bicarbonate (alkaline)",
  "Hyoscine (injection)",
  "Nifedipine (tocolytic)",
  "Hydrocortisone (injection)",
];

/**
 * Brand-as-generic / non-INN names → canonical generic.
 * Optional brand overwrite when the old list is wrong for the new name.
 * @type {Array<{ from: string, to: string, brands?: string[] }>}
 */
const RENAME_ROWS = [
  { from: "Avil (injection)", to: "Pheniramine Maleate" },
  { from: "Deriphyllin (injection)", to: "Etofylline + Theophylline" },
  { from: "Buscopan (injection)", to: "Hyoscine Butylbromide" },
  {
    from: "Candibiotic (ear)",
    to: "Beclomethasone + Clotrimazole + Chloramphenicol + Lidocaine",
  },
  {
    from: "Wax softener",
    to: "Paradichlorobenzene + Benzocaine + Chlorbutol + Turpentine Oil",
  },
  {
    from: "Combined Oral Contraceptive",
    to: "Levonorgestrel + Ethinylestradiol",
    brands: ["Mala-N", "Ovral"],
  },
  {
    from: "Antacid (Aluminium + Magnesium)",
    to: "Aluminium Hydroxide + Magnesium Hydroxide + Simethicone",
  },
];

/** Route / site parentheticals — form + route_default already carry this. */
const STRIP_ROUTE_PARENS = [
  ["Diclofenac (topical)", "Diclofenac"],
  ["Ciprofloxacin (eye)", "Ciprofloxacin"],
  ["Tobramycin (eye)", "Tobramycin"],
  ["Xylometazoline (nasal)", "Xylometazoline"],
  ["Budesonide (oral)", "Budesonide"],
  ["Fluticasone (inhaled)", "Fluticasone"],
  ["Codeine (cough)", "Codeine"],
  ["Oxymetazoline (nasal)", "Oxymetazoline"],
  ["Fluticasone (nasal)", "Fluticasone"],
  ["Mometasone (nasal)", "Mometasone"],
  ["Azelastine (nasal)", "Azelastine"],
  ["Fluticasone (topical)", "Fluticasone"],
  ["Hydrocortisone (topical)", "Hydrocortisone"],
  ["Tacrolimus (topical)", "Tacrolimus"],
  ["Clindamycin (topical)", "Clindamycin"],
  ["Ketoconazole (topical)", "Ketoconazole"],
  ["Terbinafine (topical)", "Terbinafine"],
  ["Ketoprofen (topical)", "Ketoprofen"],
  ["Finasteride (topical)", "Finasteride"],
  ["Moxifloxacin (eye)", "Moxifloxacin"],
  ["Ofloxacin (eye)", "Ofloxacin"],
  ["Gatifloxacin (eye)", "Gatifloxacin"],
  ["Chloramphenicol (eye)", "Chloramphenicol"],
  ["Sodium Hyaluronate (eye)", "Sodium Hyaluronate"],
  ["Olopatadine (eye)", "Olopatadine"],
  ["Ketorolac (eye)", "Ketorolac"],
  ["Prednisolone (eye)", "Prednisolone"],
  ["Atropine (eye)", "Atropine"],
  ["Ofloxacin (ear)", "Ofloxacin"],
  ["Ciprofloxacin (ear)", "Ciprofloxacin"],
  ["Clotrimazole (ear)", "Clotrimazole"],
  ["Benzocaine (ear)", "Benzocaine"],
  ["Budesonide (nasal)", "Budesonide"],
  ["Amiodarone (IV)", "Amiodarone"],
  ["Potassium Chloride (IV)", "Potassium Chloride"],
  ["Sodium Bicarbonate (IV)", "Sodium Bicarbonate"],
  ["Diclofenac (injection)", "Diclofenac"],
  ["Tramadol (injection)", "Tramadol"],
  ["Ondansetron (injection)", "Ondansetron"],
  ["Pantoprazole (injection)", "Pantoprazole"],
  ["Methylprednisolone (injection)", "Methylprednisolone"],
  ["Levonorgestrel (ECP)", "Levonorgestrel"],
];

/** @type {Array<[string, string[], string, string, string]>} */
const ROWS = [
  // —— Analgesia / ortho / neuropathic FDCs ——
  [
    "Aceclofenac + Paracetamol + Serratiopeptidase",
    ["Zerodol-SP", "Hifenac-SP", "Aceron-SP"],
    "100/325/15mg",
    "tablet",
    "oral",
  ],
  [
    "Diclofenac + Paracetamol + Serratiopeptidase",
    ["Enzoflam", "Diclogesic-SP"],
    "50/325/10mg",
    "tablet",
    "oral",
  ],
  [
    "Aceclofenac + Serratiopeptidase",
    ["Zerodol-S", "Hifenac-S"],
    "100/15mg",
    "tablet",
    "oral",
  ],
  [
    "Diclofenac + Serratiopeptidase",
    ["Seradic", "Emanzen-D"],
    "50/10mg",
    "tablet",
    "oral",
  ],
  [
    "Etoricoxib + Thiocolchicoside",
    ["Etoshine-MR", "Nucoxia-MR"],
    "60/4mg",
    "tablet",
    "oral",
  ],
  [
    "Aceclofenac + Thiocolchicoside",
    ["Zerodol-TH", "Hifenac-TH"],
    "100/4mg",
    "tablet",
    "oral",
  ],
  [
    "Diclofenac + Tizanidine",
    ["Dynapar-MR", "Diclofenac-T"],
    "50/2mg",
    "tablet",
    "oral",
  ],
  [
    "Aceclofenac + Tizanidine",
    ["Zerodol-T", "Hifenac-T"],
    "100/2mg",
    "tablet",
    "oral",
  ],
  [
    "Trypsin + Chymotrypsin",
    ["Chymoral Forte", "K-Tripsin"],
    "100000AU",
    "tablet",
    "oral",
  ],
  [
    "Gabapentin + Nortriptyline",
    ["Gabapin-NT", "Nortipan"],
    "400/10mg",
    "tablet",
    "oral",
  ],
  [
    "Pregabalin + Nortriptyline",
    ["Pregalin-NT", "Maxgalin-NT"],
    "75/10mg",
    "tablet",
    "oral",
  ],
  [
    "Gabapentin + Methylcobalamin",
    ["Gabapin-ME", "Nervijen-G"],
    "300/500mcg",
    "tablet",
    "oral",
  ],
  [
    "Methylcobalamin + Alpha Lipoic Acid + Pyridoxine + Folic Acid",
    ["Nurokind-Plus", "Methycobal-Plus"],
    "1500mcg",
    "tablet",
    "oral",
  ],

  // —— Antibiotic FDCs ——
  [
    "Ofloxacin + Ornidazole",
    ["Oflox-OZ", "Zanocin-OZ", "Oflomac-OZ"],
    "200/500mg",
    "tablet",
    "oral",
  ],
  [
    "Levofloxacin + Ornidazole",
    ["Levoflox-OZ", "Glevo-OZ"],
    "250/500mg",
    "tablet",
    "oral",
  ],
  [
    "Norfloxacin + Tinidazole",
    ["Norflox-TZ", "Norilet-TZ"],
    "400/600mg",
    "tablet",
    "oral",
  ],
  [
    "Ciprofloxacin + Tinidazole",
    ["Cifran-TZ", "Ciplox-TZ"],
    "500/600mg",
    "tablet",
    "oral",
  ],
  [
    "Metronidazole + Norfloxacin",
    ["Nor-Metrogyl", "Gramoneg-M"],
    "400/400mg",
    "tablet",
    "oral",
  ],
  [
    "Ceftriaxone + Sulbactam",
    ["Monocef-SB", "Xone-SB"],
    "1.5g",
    "injection",
    "IV",
  ],
  [
    "Ceftriaxone + Tazobactam",
    ["Monocef-TZ", "Oframax-TZ"],
    "1.125g",
    "injection",
    "IV",
  ],
  [
    "Cefotaxime + Sulbactam",
    ["Taxim-S", "Omnatax-S"],
    "1.5g",
    "injection",
    "IV",
  ],
  [
    "Doxycycline + Lactobacillus",
    ["Doxt-SL", "Microdox-LB"],
    "100mg",
    "capsule",
    "oral",
  ],
  [
    "Isoniazid + Rifampicin + Pyrazinamide",
    ["Akurit-3", "R-Cinex-Z"],
    "3FDC",
    "tablet",
    "oral",
  ],
  [
    "Isoniazid + Rifampicin + Ethambutol",
    ["Akurit", "Macox-ZH"],
    "3FDC",
    "tablet",
    "oral",
  ],

  // —— GI FDCs ——
  [
    "Rabeprazole + Levosulpiride",
    ["Razo-L", "Rabicip-L", "Veloz-L"],
    "20/75mg",
    "capsule",
    "oral",
  ],
  [
    "Esomeprazole + Levosulpiride",
    ["Esoz-L", "Sompraz-L"],
    "40/75mg",
    "capsule",
    "oral",
  ],
  [
    "Pantoprazole + Levosulpiride",
    ["Pan-L", "Pantocid-L"],
    "40/75mg",
    "capsule",
    "oral",
  ],
  [
    "Pantoprazole + Itopride",
    ["Pan-IT", "Pantop-IT"],
    "40/150mg",
    "capsule",
    "oral",
  ],
  [
    "Rabeprazole + Itopride",
    ["Razo-IT", "Rabicip-IT"],
    "20/150mg",
    "capsule",
    "oral",
  ],
  [
    "Omeprazole + Cinitapride",
    ["Omez-CP", "Cintapro-O"],
    "20/3mg",
    "capsule",
    "oral",
  ],
  [
    "Pantoprazole + Cinitapride",
    ["Pan-CP", "Cintapro-P"],
    "40/3mg",
    "capsule",
    "oral",
  ],
  [
    "Dicyclomine + Mefenamic Acid",
    ["Meftal-Spas", "Cyclopam-MF"],
    "10/250mg",
    "tablet",
    "oral",
  ],
  [
    "Drotaverine + Mefenamic Acid",
    ["Drotin-M", "Doverin-M"],
    "80/250mg",
    "tablet",
    "oral",
  ],
  [
    "Sucralfate + Oxetacaine",
    ["Sucrafil-O", "Mucaine Gel"],
    "1g/20mg",
    "syrup",
    "oral",
  ],
  ["ORS + Zinc", ["Electral-Z", "Walyte-Z"], "21g/20mg", "sachet", "oral"],

  // —— Respiratory / cough-cold FDCs ——
  [
    "Levosalbutamol + Ambroxol + Guaifenesin",
    ["Ascoril-LS", "Ambrolite-S"],
    "1/30/50mg",
    "syrup",
    "oral",
  ],
  [
    "Ambroxol + Levosalbutamol",
    ["Ambrodil-S", "Kofarest-PD"],
    "30/1mg",
    "syrup",
    "oral",
  ],
  [
    "Montelukast + Bambuterol",
    ["Montair-Plus", "Telekast-B"],
    "10/10mg",
    "tablet",
    "oral",
  ],
  [
    "Doxofylline + Montelukast",
    ["Doxolin-M", "Doxofyl-M"],
    "400/10mg",
    "tablet",
    "oral",
  ],
  [
    "Etofylline + Theophylline",
    ["Deriphyllin", "Unicontin"],
    "77/23mg",
    "tablet",
    "oral",
  ],
  [
    "Formoterol + Glycopyrronium + Budesonide",
    ["Glycohale-FB", "Airz-FB"],
    "6/9/400mcg",
    "inhaler",
    "inhaled",
  ],
  [
    "Indacaterol + Glycopyrronium",
    ["Ultibro", "Indacaterol-Glyco"],
    "110/50mcg",
    "inhaler",
    "inhaled",
  ],
  [
    "Umeclidinium + Vilanterol",
    ["Anoro Ellipta"],
    "62.5/25mcg",
    "inhaler",
    "inhaled",
  ],
  [
    "Tiotropium + Formoterol",
    ["Duova", "Tiova-F"],
    "18/12mcg",
    "inhaler",
    "inhaled",
  ],
  [
    "Budesonide + Levosalbutamol",
    ["Budecort-LS", "Derinide-LS"],
    "0.5/1.25mg",
    "nebuliser",
    "inhaled",
  ],
  [
    "Ipratropium + Salbutamol",
    ["Duolin", "Ipravent-S"],
    "500/2.5mg",
    "nebuliser",
    "inhaled",
  ],
  [
    "Paracetamol + Phenylephrine + Cetirizine",
    ["Sinarest-AF", "Wikoryl"],
    "325/10/5mg",
    "tablet",
    "oral",
  ],
  [
    "Paracetamol + Phenylephrine + Chlorpheniramine",
    ["Sinarest", "Alex-P", "Wikoryl-Plus"],
    "500/10/2mg",
    "tablet",
    "oral",
  ],
  [
    "Levocetirizine + Ambroxol",
    ["Levocet-A", "Xyzal-A"],
    "5/60mg",
    "tablet",
    "oral",
  ],
  [
    "Montelukast + Bilastine",
    ["Bilaxten-M", "Bilazest-M"],
    "10/20mg",
    "tablet",
    "oral",
  ],
  [
    "Montelukast + Rupatadine",
    ["Rupafin-M", "Rupanex-M"],
    "10/10mg",
    "tablet",
    "oral",
  ],

  // —— Cardiovascular FDCs ——
  [
    "Telmisartan + Chlorthalidone",
    ["Telma-CT", "Tazloc-CT"],
    "40/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Telmisartan + Metoprolol",
    ["Telma-Beta", "Tazloc-MT"],
    "40/50mg",
    "tablet",
    "oral",
  ],
  [
    "Telmisartan + Cilnidipine",
    ["Telma-LN", "Cilacar-T"],
    "40/10mg",
    "tablet",
    "oral",
  ],
  [
    "Telmisartan + Bisoprolol",
    ["Telma-B", "Concor-T"],
    "40/5mg",
    "tablet",
    "oral",
  ],
  [
    "Telmisartan + Amlodipine + Chlorthalidone",
    ["Telma-ACT", "Tazloc-ACT"],
    "40/5/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Telmisartan + Amlodipine + Hydrochlorothiazide",
    ["Telma-AMH", "Tazloc-AMH"],
    "40/5/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Olmesartan + Chlorthalidone",
    ["Olmesar-CH", "Olmy-CH"],
    "20/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Olmesartan + Hydrochlorothiazide",
    ["Olmesar-H", "Olmy-H"],
    "20/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Olmesartan + Amlodipine + Hydrochlorothiazide",
    ["Olmesar-AH", "Olmy-AH"],
    "20/5/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Losartan + Amlodipine",
    ["Repace-AM", "Losacar-A"],
    "50/5mg",
    "tablet",
    "oral",
  ],
  [
    "Metoprolol + Amlodipine",
    ["Met XL-AM", "Prolomet-AM"],
    "50/5mg",
    "tablet",
    "oral",
  ],
  [
    "Atenolol + Chlorthalidone",
    ["Tenoric", "Atecard-C"],
    "50/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Ramipril + Hydrochlorothiazide",
    ["Cardace-H", "Ramcor-H"],
    "5/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Enalapril + Hydrochlorothiazide",
    ["Envas-H", "Enam-H"],
    "5/12.5mg",
    "tablet",
    "oral",
  ],
  [
    "Nebivolol + Amlodipine",
    ["Nebistar-AM", "Nodon-AM"],
    "5/5mg",
    "tablet",
    "oral",
  ],
  [
    "Bisoprolol + Amlodipine",
    ["Concor-AM", "Corbis-AM"],
    "5/5mg",
    "tablet",
    "oral",
  ],
  [
    "Cilnidipine + Metoprolol",
    ["Cilacar-M", "Cinod-M"],
    "10/50mg",
    "tablet",
    "oral",
  ],
  [
    "Torsemide + Spironolactone",
    ["Dytor-Plus", "Tide-Plus"],
    "10/25mg",
    "tablet",
    "oral",
  ],
  [
    "Furosemide + Spironolactone",
    ["Lasilactone", "Fruselac"],
    "20/50mg",
    "tablet",
    "oral",
  ],

  // —— Lipids / antiplatelet ——
  [
    "Rosuvastatin + Fenofibrate",
    ["Rosuvas-F", "Rozavel-F"],
    "10/160mg",
    "tablet",
    "oral",
  ],
  [
    "Atorvastatin + Fenofibrate",
    ["Atorlip-F", "Storvas-F"],
    "10/160mg",
    "tablet",
    "oral",
  ],
  [
    "Aspirin + Atorvastatin",
    ["Ecosprin-AV", "Atorva-ASP"],
    "75/10mg",
    "tablet",
    "oral",
  ],
  [
    "Aspirin + Rosuvastatin",
    ["Rozustat-ASP", "Rosuvas-ASP"],
    "75/10mg",
    "tablet",
    "oral",
  ],

  // —— Diabetes FDCs ——
  [
    "Metformin + Gliclazide",
    ["Diamicron-M", "Glizid-M"],
    "500/80mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Glipizide",
    ["Glytop-M", "Glynase-MF"],
    "500/5mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Pioglitazone",
    ["Pioz-MF", "Pioglit-MF"],
    "500/15mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Voglibose",
    ["Volibo-M", "Volix-M"],
    "500/0.3mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Linagliptin",
    ["Trajenta-Duo", "Ondero-M"],
    "500/2.5mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Saxagliptin",
    ["Kombiglyze", "Onglyza-M"],
    "500/5mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Glimepiride + Pioglitazone",
    ["Glycomet-GP-Pio", "Gemer-P"],
    "500/2/15mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Glimepiride + Voglibose",
    ["Glycomet-GP-V", "Gemer-PV"],
    "500/2/0.2mg",
    "tablet",
    "oral",
  ],
  [
    "Dapagliflozin + Sitagliptin",
    ["Oxra-S", "Dapanorm-S"],
    "10/100mg",
    "tablet",
    "oral",
  ],
  [
    "Dapagliflozin + Vildagliptin",
    ["Dapanorm-V", "Jalra-D"],
    "10/100mg",
    "tablet",
    "oral",
  ],
  [
    "Dapagliflozin + Linagliptin",
    ["Oxra-L", "Dapanorm-L"],
    "10/5mg",
    "tablet",
    "oral",
  ],
  [
    "Empagliflozin + Linagliptin",
    ["Glyxambi", "Gibrus-L"],
    "10/5mg",
    "tablet",
    "oral",
  ],
  [
    "Metformin + Dapagliflozin + Sitagliptin",
    ["Oxra-SM", "Dapanorm-SM"],
    "500/10/100mg",
    "tablet",
    "oral",
  ],
  [
    "Insulin Degludec + Insulin Aspart",
    ["Ryzodeg"],
    "100IU/ml",
    "injection",
    "SC",
  ],

  // —— Haematinics / supplements ——
  [
    "Ferrous Ascorbate + Folic Acid",
    ["Orofer-XT", "Fericip-XT", "Richar-CR"],
    "100/1.5mg",
    "tablet",
    "oral",
  ],
  [
    "Carbonyl Iron + Folic Acid + Zinc + Vitamin B12",
    ["Autrin", "Fesovit"],
    "100/1.5/22.5/15mcg",
    "capsule",
    "oral",
  ],
  [
    "Iron + Folic Acid + Vitamin B12",
    ["Fefol-Z", "Livogen-Z"],
    "150/1.5/15mcg",
    "tablet",
    "oral",
  ],
  [
    "Calcium Carbonate + Vitamin D3 + Magnesium + Zinc",
    ["Shelcal-M", "Calcimax-P"],
    "500mg",
    "tablet",
    "oral",
  ],
  [
    "Calcium + Vitamin D3 + Vitamin K2-7",
    ["Shelcal-K", "Cipcal-K"],
    "500mg",
    "tablet",
    "oral",
  ],
  [
    "Methylcobalamin + Pyridoxine + Folic Acid",
    ["Nurokind-LC", "Methycobal-Plus"],
    "1500/3/1.5mg",
    "tablet",
    "oral",
  ],

  // —— Derm FDCs ——
  [
    "Clobetasol + Salicylic Acid",
    ["Tenovate-S", "Clonate-S"],
    "0.05%/3%",
    "ointment",
    "topical",
  ],
  [
    "Benzoyl Peroxide + Clindamycin",
    ["Peroclin", "Clinmiskin-Plus"],
    "2.5%/1%",
    "gel",
    "topical",
  ],
  [
    "Adapalene + Benzoyl Peroxide",
    ["Epiduo", "Deriva-BPO"],
    "0.1%/2.5%",
    "gel",
    "topical",
  ],
  [
    "Ketoconazole + Zinc Pyrithione",
    ["Nizral-ZP", "Keto-Z"],
    "2%/1%",
    "shampoo",
    "topical",
  ],
  [
    "Ivermectin + Albendazole",
    ["Ivecop-A", "Bandy-Plus"],
    "6/400mg",
    "tablet",
    "oral",
  ],

  // —— Eye / ENT FDCs ——
  [
    "Moxifloxacin + Dexamethasone",
    ["Moxicip-D", "Milflox-D"],
    "0.5%/0.1%",
    "drops",
    "other",
  ],
  [
    "Brimonidine + Timolol",
    ["Alphagan-T", "Brimolol"],
    "0.2%/0.5%",
    "drops",
    "other",
  ],
  [
    "Dorzolamide + Timolol",
    ["Dorzo-T", "Cosopt"],
    "2%/0.5%",
    "drops",
    "other",
  ],
  [
    "Latanoprost + Timolol",
    ["Latoprost-T", "Xalacom"],
    "0.005%/0.5%",
    "drops",
    "other",
  ],
  [
    "Bimatoprost + Timolol",
    ["Lumigan-T", "Careprost-T"],
    "0.03%/0.5%",
    "drops",
    "other",
  ],
  [
    "Ofloxacin + Ornidazole",
    ["Oflox-OZ Ear", "Zanocin-OZ Ear"],
    "0.3%/1%",
    "drops",
    "other",
  ],
  [
    "Ofloxacin + Dexamethasone",
    ["Oflox-D Ear", "Zanocin-D Ear"],
    "0.3%/0.1%",
    "drops",
    "other",
  ],

  // —— Gynaecology FDCs ——
  [
    "Ethinylestradiol + Cyproterone Acetate",
    ["Diane-35", "Krimson-35", "Ginette-35"],
    "0.035/2mg",
    "tablet",
    "oral",
  ],
  [
    "Drospirenone + Ethinylestradiol",
    ["Yasmin", "Yamini", "Dronis-30"],
    "3/0.03mg",
    "tablet",
    "oral",
  ],
  [
    "Ethinylestradiol + Desogestrel",
    ["Femilon", "Novelon", "Intimacy"],
    "0.03/0.15mg",
    "tablet",
    "oral",
  ],
  [
    "Estradiol + Dydrogesterone",
    ["Femoston", "Femoston-Conti"],
    "1/10mg",
    "tablet",
    "oral",
  ],
  [
    "Tranexamic Acid + Mefenamic Acid",
    ["Pause-MF", "Trapic-MF"],
    "500/250mg",
    "tablet",
    "oral",
  ],
  [
    "Myo-inositol + D-chiro-inositol",
    ["Myo-Inositol", "Ovacare"],
    "2000/50mg",
    "sachet",
    "oral",
  ],
  [
    "Ferrous Ascorbate + Folic Acid + Calcium",
    ["Orofer-XT Plus", "Fericip-XT Plus"],
    "100/1.5/250mg",
    "tablet",
    "oral",
  ],

  // —— National programme / endemic singles ——
  ["Clofazimine", ["Lamprene", "Hansepran"], "100mg", "capsule", "oral"],
  ["Cycloserine", ["Cycloserine", "Coxerin"], "250mg", "capsule", "oral"],
  ["Bedaquiline", ["Sirturo", "Bedaquiline"], "100mg", "tablet", "oral"],
  ["Delamanid", ["Deltyba"], "50mg", "tablet", "oral"],
  ["Pretomanid", ["Dovprela", "Pretomanid"], "200mg", "tablet", "oral"],
  ["Ethionamide", ["Ethide", "Trecator"], "250mg", "tablet", "oral"],
  ["Kanamycin", ["Kanamycin", "Kannasyn"], "500mg", "injection", "IM"],
  ["Capreomycin", ["Capastat", "Capreomycin"], "1g", "injection", "IM"],
  [
    "Para-aminosalicylic Acid",
    ["PAS", "Paser"],
    "4g",
    "sachet",
    "oral",
  ],
  ["Miltefosine", ["Impavido", "Miltex"], "50mg", "capsule", "oral"],
  [
    "Amphotericin B (Liposomal)",
    ["Ambisome", "Phosome", "Fungisome"],
    "50mg",
    "injection",
    "IV",
  ],
  ["Paromomycin", ["Humatin", "Gabbroral"], "500mg", "capsule", "oral"],
  [
    "Sodium Stibogluconate",
    ["Pentostam", "SSG"],
    "100mg/ml",
    "injection",
    "IM",
  ],
  ["Artesunate", ["Falcigo", "Larinate"], "60mg", "injection", "IV"],
  [
    "Sulfadoxine + Pyrimethamine",
    ["Fansidar", "Malocide"],
    "500/25mg",
    "tablet",
    "oral",
  ],
  [
    "Artesunate + Sulfadoxine-Pyrimethamine",
    ["Falcigo-SP", "Larinate-SP"],
    "200/500/25mg",
    "tablet",
    "oral",
  ],
  [
    "Snake Antivenom (Polyvalent)",
    ["ASVS", "Snake Venom Antiserum"],
    "10ml",
    "injection",
    "IV",
  ],
  [
    "Anti-Scorpion Venom Serum",
    ["SCORPION ANTIVENIN"],
    "1ml",
    "injection",
    "IV",
  ],
  [
    "Rabies Immunoglobulin",
    ["Berirab", "Equirab", "Kamrab"],
    "300IU/ml",
    "injection",
    "IM",
  ],
  [
    "Tetanus Immunoglobulin",
    ["Tigi", "Tetagam", "Ig-Tet"],
    "250IU",
    "injection",
    "IM",
  ],

  // —— Other missing Indian OPD singles ——
  ["Trimetazidine", ["Flavedon", "Carvidon"], "35mg", "tablet", "oral"],
  ["Deflazacort", ["Defza", "Defcort", "Calcort"], "6mg", "tablet", "oral"],
  ["Nadifloxacin", ["Nadoxin", "Nadibact"], "1%", "cream", "topical"],
  ["Nepafenac", ["Nevanac", "Nepalact"], "0.1%", "drops", "other"],
  ["Bromfenac", ["Bromvue", "Unibrom"], "0.09%", "drops", "other"],
  ["Alpha Lipoic Acid", ["R-Lipoic", "Alphalip"], "300mg", "capsule", "oral"],
  ["Cinitapride", ["Cintapro", "Kinpride"], "1mg", "tablet", "oral"],
  ["Oxetacaine", ["Mucaine", "Oxetacaine"], "10mg", "syrup", "oral"],
  ["Bambuterol", ["Bambudil", "Betaday"], "10mg", "tablet", "oral"],
];

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function formatArray(brands) {
  return `ARRAY[${brands.map((b) => `'${sqlEscape(b)}'`).join(",")}]`;
}

function formatRow([generic, brands, strength, form, route]) {
  return `  ('${sqlEscape(generic)}', ${formatArray(brands)}, '${sqlEscape(strength)}', '${sqlEscape(form)}', '${sqlEscape(route)}')`;
}

function rowKey([generic, , strength, form]) {
  return `${generic.toLowerCase()}|${String(form).toLowerCase()}|${String(strength).toLowerCase()}`;
}

const seen = new Set();
const unique = [];
for (const row of ROWS) {
  const key = rowKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

function deleteSql() {
  const list = DELETE_GENERICS.map((n) => `'${sqlEscape(n)}'`).join(", ");
  return `DELETE FROM drug_master
WHERE generic_name IN (${list});`;
}

function renameSql() {
  return RENAME_ROWS.map((r) => {
    const brands = r.brands
      ? `,\n    brand_names = ${formatArray(r.brands)}`
      : "";
    return `UPDATE drug_master
SET generic_name = '${sqlEscape(r.to)}'${brands}
WHERE lower(generic_name) = lower('${sqlEscape(r.from)}');`;
  }).join("\n\n");
}

function stripSql() {
  return STRIP_ROUTE_PARENS.map(
    ([from, to]) => `UPDATE drug_master
SET generic_name = '${sqlEscape(to)}'
WHERE lower(generic_name) = lower('${sqlEscape(from)}');`,
  ).join("\n\n");
}

const header = `-- ============================================================================
-- Drug Master seed: India FDC + programme expand + catalog cleanup
-- ============================================================================
-- Migration: 230_drug_master_seed_expand_combos.sql
-- Date:      2026-09-09
-- Description:
--   1. Cleanup brand-as-generic names (Avil, Deriphyllin, Buscopan,
--      Candibiotic, Wax softener) and non-INN labels (Combined Oral
--      Contraceptive, Antacid).
--   2. Drop true-duplicate qualifier rows (same molecule + form + strength).
--   3. Strip route/site parentheticals from generic_name — form and
--      route_default already carry that (so the capture bar can show
--      "Drops Ofloxacin 0.3%" instead of "Drops Ofloxacin (eye) 0.3%").
--      Insulin / vitamin INN parentheticals are kept.
--   4. Insert India-OPD combination products plus national-programme
--      (NTEP, NVBDCP, Anaemia Mukt Bharat) and endemic-region singles.
--
--   Brand names stay populated as a hidden search + allergy-match key.
--   They are not shown in the capture-bar dropdown.
--
--   Omitted pending clinical review (CDSCO / rationality contested):
--     cephalosporin+FQ or cephalosporin+clavulanate FDCs, Nimesulide +
--     Paracetamol, triple NSAID/relaxant, four-drug cough syrups,
--     steroid-antifungal derm combos, HQ+tretinoin+steroid triples,
--     aspirin+statin+P2Y12 polypills.
--
--   Generated by: backend/scripts/generate-drug-master-seed-combos.js
--   Insert rows in this file: ${unique.length}
--
--   Idempotent:
--     DELETE / UPDATE match the pre-cleanup generic_name (no-op after apply).
--     INSERT is guarded on lower(generic_name) + form + strength so the
--     same INN can exist as tablet and drops.
-- ============================================================================

-- 1. Drop true duplicates (FK: prescription_medicines SET NULL,
--    drug_interactions / doctor_drug_usage CASCADE).
${deleteSql()}

-- 2. Rename brand-as-generic and non-INN labels.
${renameSql()}

-- 3. Strip route / site parentheticals from generic_name.
${stripSql()}

-- 4. Insert FDC + programme + missing-single rows.
INSERT INTO drug_master (generic_name, brand_names, strength, form, route_default)
SELECT * FROM (VALUES
${unique.map(formatRow).join(",\n")}
) AS seed(generic_name, brand_names, strength, form, route_default)
WHERE NOT EXISTS (
  SELECT 1 FROM drug_master dm
  WHERE lower(dm.generic_name) = lower(seed.generic_name)
    AND lower(coalesce(dm.form, '')) = lower(coalesce(seed.form, ''))
    AND lower(coalesce(dm.strength, '')) = lower(coalesce(seed.strength, ''))
);
`;

const out = path.join(
  __dirname,
  "../migrations/230_drug_master_seed_expand_combos.sql",
);
fs.writeFileSync(out, header, "utf8");
console.log(`Wrote ${unique.length} insert rows + cleanup → ${out}`);
