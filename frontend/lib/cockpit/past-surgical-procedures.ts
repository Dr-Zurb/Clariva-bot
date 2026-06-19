export interface PastSurgicalProcedureDef {
  value: string;
  label: string;
  searchTerms: readonly string[];
}

export const PAST_SURGICAL_PROCEDURE_CATALOG = [
  {
    value: "appendectomy",
    label: "Appendectomy",
    searchTerms: [
      "appendectomy",
      "appendicectomy",
      "appendix removal",
      "appendix",
      "lap appendectomy",
      "open appendectomy",
      "appendicitis surgery",
    ],
  },
  {
    value: "lscs",
    label: "LSCS",
    searchTerms: [
      "lscs",
      "cesarean",
      "caesarean",
      "c-section",
      "c section",
      "cs",
      "caesarean section",
      "cesarean section",
      "lower segment cesarean",
      "lower segment caesarean",
      "emergency lscs",
      "elective lscs",
    ],
  },
  {
    value: "cholecystectomy",
    label: "Cholecystectomy",
    searchTerms: [
      "cholecystectomy",
      "gallbladder removal",
      "gall bladder removal",
      "lap chole",
      "laparoscopic cholecystectomy",
      "open cholecystectomy",
      "gallstone surgery",
      "gall bladder",
    ],
  },
  {
    value: "hernia-repair",
    label: "Hernia repair",
    searchTerms: [
      "hernia repair",
      "herniorrhaphy",
      "hernioplasty",
      "inguinal hernia",
      "femoral hernia",
      "umbilical hernia",
      "ventral hernia",
      "incisional hernia",
      "hernia",
      "mesh repair",
      "lap hernia",
    ],
  },
  {
    value: "turp",
    label: "TURP",
    searchTerms: [
      "turp",
      "transurethral resection prostate",
      "transurethral resection of prostate",
      "prostate resection",
      "prostate surgery",
      "bph surgery",
      "benign prostatic hyperplasia surgery",
    ],
  },
  {
    value: "cabg",
    label: "CABG",
    searchTerms: [
      "cabg",
      "coronary artery bypass",
      "coronary bypass",
      "bypass surgery",
      "open heart surgery",
      "open heart",
      "heart bypass",
      "cabg surgery",
    ],
  },
  {
    value: "cataract",
    label: "Cataract surgery",
    searchTerms: [
      "cataract",
      "cataract surgery",
      "cataract extraction",
      "phaco",
      "phacoemulsification",
      "sics",
      "iol",
      "intraocular lens",
      "lens implant",
    ],
  },
  {
    value: "tonsillectomy",
    label: "Tonsillectomy",
    searchTerms: [
      "tonsillectomy",
      "tonsils removed",
      "tonsil removal",
      "tonsils",
      "tonsil surgery",
    ],
  },
  {
    value: "hysterectomy",
    label: "Hysterectomy",
    searchTerms: [
      "hysterectomy",
      "uterus removal",
      "tah",
      "total abdominal hysterectomy",
      "lap hysterectomy",
      "laparoscopic hysterectomy",
      "vaginal hysterectomy",
      "radical hysterectomy",
    ],
  },
  {
    value: "hysteroscopy",
    label: "Hysteroscopy",
    searchTerms: [
      "hysteroscopy",
      "diagnostic hysteroscopy",
      "operative hysteroscopy",
      "hysteroscopic polypectomy",
      "hysteroscopic myomectomy",
    ],
  },
  {
    value: "tkr",
    label: "Knee replacement",
    searchTerms: [
      "tkr",
      "total knee replacement",
      "knee replacement",
      "knee arthroplasty",
      "arthroplasty knee",
      "total knee arthroplasty",
      "tka",
    ],
  },
  {
    value: "thyroidectomy",
    label: "Thyroidectomy",
    searchTerms: [
      "thyroidectomy",
      "thyroid surgery",
      "thyroid removal",
      "total thyroidectomy",
      "hemithyroidectomy",
      "partial thyroidectomy",
      "thyroid operation",
    ],
  },
  {
    value: "varicose-vein-surgery",
    label: "Varicose vein surgery",
    searchTerms: [
      "varicose vein",
      "varicose veins",
      "varicose vein surgery",
      "vein stripping",
      "evlt",
      "laser varicose",
      "saphenous stripping",
    ],
  },
  {
    value: "fracture-fixation",
    label: "Fracture fixation",
    searchTerms: [
      "fracture fixation",
      "orif",
      "open reduction internal fixation",
      "plating",
      "nailing",
      "intramedullary nailing",
      "bone plating",
      "fracture surgery",
      "implant removal",
    ],
  },
  {
    value: "piles",
    label: "Piles surgery",
    searchTerms: [
      "piles",
      "piles surgery",
      "hemorrhoidectomy",
      "hemorrhoids surgery",
      "hemorrhoids",
      "stapler hemorrhoidectomy",
      "stapler piles",
      "miph",
      "hemorrhoid banding",
    ],
  },
  {
    value: "circumcision",
    label: "Circumcision",
    searchTerms: ["circumcision", "prepuce removal", "foreskin removal"],
  },
  {
    value: "thr",
    label: "Hip replacement",
    searchTerms: [
      "thr",
      "total hip replacement",
      "hip replacement",
      "hip arthroplasty",
      "total hip arthroplasty",
      "tha",
    ],
  },
  {
    value: "shoulder-replacement",
    label: "Shoulder replacement",
    searchTerms: [
      "shoulder replacement",
      "total shoulder replacement",
      "shoulder arthroplasty",
      "reverse shoulder replacement",
      "tsr",
    ],
  },
  {
    value: "arthroscopy",
    label: "Arthroscopy",
    searchTerms: [
      "arthroscopy",
      "knee arthroscopy",
      "shoulder arthroscopy",
      "diagnostic arthroscopy",
      "therapeutic arthroscopy",
      "keyhole joint surgery",
    ],
  },
  {
    value: "acl-reconstruction",
    label: "ACL reconstruction",
    searchTerms: [
      "acl reconstruction",
      "acl repair",
      "anterior cruciate ligament",
      "acl surgery",
      "acl graft",
    ],
  },
  {
    value: "spinal-surgery",
    label: "Spinal surgery",
    searchTerms: [
      "spinal surgery",
      "spine surgery",
      "back surgery",
      "spinal fixation",
      "spinal fusion",
      "vertebral surgery",
    ],
  },
  {
    value: "laminectomy",
    label: "Laminectomy",
    searchTerms: [
      "laminectomy",
      "decompression surgery",
      "spinal decompression",
      "lumbar laminectomy",
      "cervical laminectomy",
    ],
  },
  {
    value: "discectomy",
    label: "Discectomy",
    searchTerms: [
      "discectomy",
      "disc surgery",
      "disc removal",
      "microdiscectomy",
      "lumbar discectomy",
      "slipped disc surgery",
      "herniated disc surgery",
    ],
  },
  {
    value: "amputation",
    label: "Amputation",
    searchTerms: [
      "amputation",
      "limb amputation",
      "below knee amputation",
      "bka",
      "above knee amputation",
      "aka",
      "toe amputation",
      "digit amputation",
    ],
  },
  {
    value: "carpal-tunnel-release",
    label: "Carpal tunnel release",
    searchTerms: [
      "carpal tunnel",
      "carpal tunnel release",
      "carpal tunnel surgery",
      "ctr",
      "median nerve release",
    ],
  },
  {
    value: "laparotomy",
    label: "Laparotomy",
    searchTerms: [
      "laparotomy",
      "exploratory laparotomy",
      "open abdomen",
      "abdominal exploration",
      "emergency laparotomy",
    ],
  },
  {
    value: "laparoscopy",
    label: "Laparoscopy",
    searchTerms: [
      "laparoscopy",
      "diagnostic laparoscopy",
      "therapeutic laparoscopy",
      "laparoscopic surgery",
      "keyhole abdomen",
    ],
  },
  {
    value: "colectomy",
    label: "Colectomy",
    searchTerms: [
      "colectomy",
      "hemicolectomy",
      "right hemicolectomy",
      "left hemicolectomy",
      "colon resection",
      "partial colectomy",
      "total colectomy",
    ],
  },
  {
    value: "gastrectomy",
    label: "Gastrectomy",
    searchTerms: [
      "gastrectomy",
      "partial gastrectomy",
      "total gastrectomy",
      "stomach removal",
      "subtotal gastrectomy",
    ],
  },
  {
    value: "splenectomy",
    label: "Splenectomy",
    searchTerms: ["splenectomy", "spleen removal", "spleen surgery"],
  },
  {
    value: "fundoplication",
    label: "Fundoplication",
    searchTerms: [
      "fundoplication",
      "nissen fundoplication",
      "anti reflux surgery",
      "gerd surgery",
      "hiatus hernia repair",
    ],
  },
  {
    value: "liver-resection",
    label: "Liver resection",
    searchTerms: [
      "liver resection",
      "hepatectomy",
      "partial hepatectomy",
      "liver surgery",
      "segmentectomy liver",
    ],
  },
  {
    value: "whipple",
    label: "Whipple procedure",
    searchTerms: [
      "whipple",
      "whipple procedure",
      "pancreaticoduodenectomy",
      "pancreatoduodenectomy",
      "pancreatic resection",
    ],
  },
  {
    value: "bariatric-surgery",
    label: "Bariatric surgery",
    searchTerms: [
      "bariatric surgery",
      "weight loss surgery",
      "gastric bypass",
      "sleeve gastrectomy",
      "roux en y",
      "rygb",
      "obesity surgery",
    ],
  },
  {
    value: "mastectomy",
    label: "Mastectomy",
    searchTerms: [
      "mastectomy",
      "breast removal",
      "modified radical mastectomy",
      "simple mastectomy",
      "radical mastectomy",
      "breast cancer surgery",
    ],
  },
  {
    value: "lumpectomy",
    label: "Lumpectomy",
    searchTerms: [
      "lumpectomy",
      "breast conservation",
      "breast conserving surgery",
      "wide local excision",
      "bcs",
      "breast lump excision",
    ],
  },
  {
    value: "angioplasty",
    label: "Angioplasty",
    searchTerms: [
      "angioplasty",
      "ptca",
      "pci",
      "coronary angioplasty",
      "stenting",
      "coronary stent",
      "balloon angioplasty",
      "ptca stent",
    ],
  },
  {
    value: "pacemaker",
    label: "Pacemaker",
    searchTerms: [
      "pacemaker",
      "ppm",
      "permanent pacemaker",
      "pacemaker insertion",
      "dual chamber pacemaker",
      "single chamber pacemaker",
    ],
  },
  {
    value: "valve-replacement",
    label: "Valve replacement",
    searchTerms: [
      "valve replacement",
      "avr",
      "mvr",
      "aortic valve replacement",
      "mitral valve replacement",
      "heart valve surgery",
      "valve repair",
    ],
  },
  {
    value: "carotid-endarterectomy",
    label: "Carotid endarterectomy",
    searchTerms: [
      "carotid endarterectomy",
      "cea",
      "carotid surgery",
      "carotid artery surgery",
    ],
  },
  {
    value: "peripheral-bypass",
    label: "Peripheral bypass",
    searchTerms: [
      "peripheral bypass",
      "vascular bypass",
      "fem pop bypass",
      "leg bypass",
      "aorto femoral bypass",
    ],
  },
  {
    value: "nephrectomy",
    label: "Nephrectomy",
    searchTerms: [
      "nephrectomy",
      "kidney removal",
      "radical nephrectomy",
      "partial nephrectomy",
      "nephrectomy surgery",
    ],
  },
  {
    value: "prostatectomy",
    label: "Prostatectomy",
    searchTerms: [
      "prostatectomy",
      "radical prostatectomy",
      "prostate removal",
      "lap prostatectomy",
      "robotic prostatectomy",
    ],
  },
  {
    value: "pcnl",
    label: "PCNL",
    searchTerms: [
      "pcnl",
      "percutaneous nephrolithotomy",
      "kidney stone surgery",
      "renal stone surgery",
      "nephrolithotomy",
    ],
  },
  {
    value: "ureteroscopy",
    label: "Ureteroscopy",
    searchTerms: [
      "ureteroscopy",
      "urs",
      "ureteric stone surgery",
      "ureteroscopy lithotripsy",
      "rigid ureteroscopy",
      "flexible ureteroscopy",
    ],
  },
  {
    value: "vasectomy",
    label: "Vasectomy",
    searchTerms: ["vasectomy", "male sterilization", "male sterilisation", "no scalpel vasectomy"],
  },
  {
    value: "kidney-transplant",
    label: "Kidney transplant",
    searchTerms: [
      "kidney transplant",
      "renal transplant",
      "kidney transplantation",
      "renal transplantation",
      "graft kidney",
    ],
  },
  {
    value: "av-fistula",
    label: "AV fistula",
    searchTerms: [
      "av fistula",
      "arteriovenous fistula",
      "dialysis fistula",
      "dialysis access",
      "fistula creation",
      "vascular access dialysis",
    ],
  },
  {
    value: "turbt",
    label: "TURBT",
    searchTerms: [
      "turbt",
      "transurethral resection bladder tumor",
      "bladder tumor resection",
      "bladder tumour surgery",
    ],
  },
  {
    value: "myomectomy",
    label: "Myomectomy",
    searchTerms: [
      "myomectomy",
      "fibroid removal",
      "fibroid surgery",
      "uterine fibroid surgery",
      "lap myomectomy",
    ],
  },
  {
    value: "oophorectomy",
    label: "Oophorectomy",
    searchTerms: [
      "oophorectomy",
      "ovary removal",
      "ovarian removal",
      "salpingo oophorectomy",
      "bso",
      "bilateral salpingo oophorectomy",
    ],
  },
  {
    value: "tubal-ligation",
    label: "Tubal ligation",
    searchTerms: [
      "tubal ligation",
      "tubectomy",
      "tubal sterilization",
      "family planning sterilization",
      "female sterilization",
      "lap tubal ligation",
    ],
  },
  {
    value: "d-and-c",
    label: "D&C",
    searchTerms: [
      "d&c",
      "d and c",
      "dilation and curettage",
      "dilatation and curettage",
      "uterine curettage",
    ],
  },
  {
    value: "ovarian-cystectomy",
    label: "Ovarian cystectomy",
    searchTerms: [
      "ovarian cystectomy",
      "ovarian cyst removal",
      "cystectomy ovary",
      "lap ovarian cystectomy",
    ],
  },
  {
    value: "adenoidectomy",
    label: "Adenoidectomy",
    searchTerms: [
      "adenoidectomy",
      "adenoid removal",
      "adenoids removed",
      "adenoid surgery",
    ],
  },
  {
    value: "septoplasty",
    label: "Septoplasty",
    searchTerms: [
      "septoplasty",
      "deviated nasal septum",
      "dns surgery",
      "nasal septum surgery",
      "septal correction",
    ],
  },
  {
    value: "fess",
    label: "FESS",
    searchTerms: [
      "fess",
      "functional endoscopic sinus surgery",
      "sinus surgery",
      "endoscopic sinus surgery",
      "sinus operation",
    ],
  },
  {
    value: "tympanoplasty",
    label: "Tympanoplasty",
    searchTerms: [
      "tympanoplasty",
      "ear drum repair",
      "eardrum repair",
      "myringoplasty",
      "middle ear surgery",
    ],
  },
  {
    value: "parotidectomy",
    label: "Parotidectomy",
    searchTerms: ["parotidectomy", "parotid gland removal", "parotid surgery", "parotid tumor"],
  },
  {
    value: "mastoidectomy",
    label: "Mastoidectomy",
    searchTerms: ["mastoidectomy", "mastoid surgery", "modified radical mastoidectomy"],
  },
  {
    value: "tracheostomy",
    label: "Tracheostomy",
    searchTerms: ["tracheostomy", "tracheotomy", "tracheostomy insertion", "neck airway surgery"],
  },
  {
    value: "craniotomy",
    label: "Craniotomy",
    searchTerms: [
      "craniotomy",
      "brain surgery",
      "neurosurgery",
      "burr hole",
      "decompressive craniectomy",
    ],
  },
  {
    value: "vp-shunt",
    label: "VP shunt",
    searchTerms: [
      "vp shunt",
      "ventriculoperitoneal shunt",
      "csf shunt",
      "hydrocephalus shunt",
      "shunt surgery",
    ],
  },
  {
    value: "lipoma-excision",
    label: "Lipoma excision",
    searchTerms: [
      "lipoma excision",
      "lipoma removal",
      "lipoma surgery",
      "excision lipoma",
    ],
  },
  {
    value: "abscess-drainage",
    label: "Abscess drainage",
    searchTerms: [
      "abscess drainage",
      "i&d",
      "incision and drainage",
      "incision drainage",
      "abscess I and D",
      "drainage abscess",
    ],
  },
  {
    value: "skin-graft",
    label: "Skin graft",
    searchTerms: [
      "skin graft",
      "skin grafting",
      "split thickness skin graft",
      "stsg",
      "full thickness skin graft",
    ],
  },
  {
    value: "anal-fistula",
    label: "Anal fistula surgery",
    searchTerms: [
      "anal fistula",
      "fistula in ano",
      "fistulectomy",
      "fistulotomy",
      "fistula surgery",
      "anal fistula repair",
    ],
  },
  {
    value: "pilonidal-sinus",
    label: "Pilonidal sinus surgery",
    searchTerms: [
      "pilonidal sinus",
      "pilonidal cyst",
      "pilonidal surgery",
      "pilonidal excision",
    ],
  },
  {
    value: "hydrocele-repair",
    label: "Hydrocele repair",
    searchTerms: [
      "hydrocele repair",
      "hydrocele surgery",
      "hydrocelectomy",
      "hydrocele operation",
    ],
  },
  {
    value: "varicocele-repair",
    label: "Varicocele repair",
    searchTerms: [
      "varicocele repair",
      "varicocele surgery",
      "varicocelectomy",
      "varicocele ligation",
    ],
  },
  {
    value: "fissure-surgery",
    label: "Anal fissure surgery",
    searchTerms: [
      "fissure surgery",
      "anal fissure surgery",
      "lateral internal sphincterotomy",
      "lis",
      "fissurectomy",
    ],
  },
  {
    value: "thoracotomy",
    label: "Thoracotomy",
    searchTerms: ["thoracotomy", "chest opening", "open chest surgery", "thoracic surgery"],
  },
  {
    value: "lobectomy",
    label: "Lobectomy",
    searchTerms: [
      "lobectomy",
      "lung lobectomy",
      "pulmonary lobectomy",
      "lung resection",
      "segmentectomy",
    ],
  },
  {
    value: "peg-tube",
    label: "PEG tube insertion",
    searchTerms: [
      "peg tube",
      "peg insertion",
      "percutaneous endoscopic gastrostomy",
      "feeding gastrostomy",
      "gastrostomy tube",
    ],
  },
] as const satisfies readonly PastSurgicalProcedureDef[];

export type PastSurgicalCatalogProcedure =
  (typeof PAST_SURGICAL_PROCEDURE_CATALOG)[number]["value"];

const PROCEDURE_BY_VALUE = new Map(
  PAST_SURGICAL_PROCEDURE_CATALOG.map((def) => [def.value, def] as const),
);

const ALIAS_TO_PROCEDURE = new Map<string, PastSurgicalCatalogProcedure>();
for (const def of PAST_SURGICAL_PROCEDURE_CATALOG) {
  for (const term of def.searchTerms) {
    ALIAS_TO_PROCEDURE.set(term.trim().toLowerCase(), def.value);
  }
  ALIAS_TO_PROCEDURE.set(def.value, def.value);
  ALIAS_TO_PROCEDURE.set(def.label.trim().toLowerCase(), def.value);
}

export function pastSurgicalProcedureLabel(value: PastSurgicalCatalogProcedure): string {
  return PROCEDURE_BY_VALUE.get(value)?.label ?? value;
}

export function pastSurgicalProcedureMatchesQuery(
  def: (typeof PAST_SURGICAL_PROCEDURE_CATALOG)[number],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (def.label.toLowerCase().includes(q)) return true;
  if (def.value.includes(q)) return true;
  return def.searchTerms.some((term) => term.toLowerCase().includes(q));
}

export function resolvePastSurgicalCatalogProcedure(
  query: string,
): PastSurgicalCatalogProcedure | undefined {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return undefined;

  const direct = ALIAS_TO_PROCEDURE.get(trimmed);
  if (direct) return direct;

  for (const def of PAST_SURGICAL_PROCEDURE_CATALOG) {
    if (pastSurgicalProcedureMatchesQuery(def, trimmed)) {
      const exact = def.searchTerms.some((term) => term.toLowerCase() === trimmed);
      const exactLabel = def.label.toLowerCase() === trimmed;
      if (exact || exactLabel || def.label.toLowerCase().startsWith(trimmed)) {
        return def.value;
      }
    }
  }

  const singleMatch = PAST_SURGICAL_PROCEDURE_CATALOG.filter((def) =>
    pastSurgicalProcedureMatchesQuery(def, trimmed),
  );
  if (singleMatch.length === 1) return singleMatch[0]!.value;

  return undefined;
}

function sortPastSurgicalProceduresByLabel<T extends { label: string }>(defs: T[]): T[] {
  return [...defs].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function filterPastSurgicalProcedureCatalog(
  query: string,
): (typeof PAST_SURGICAL_PROCEDURE_CATALOG)[number][] {
  const q = query.trim();
  if (!q) return sortPastSurgicalProceduresByLabel(PAST_SURGICAL_PROCEDURE_CATALOG);
  return sortPastSurgicalProceduresByLabel(
    PAST_SURGICAL_PROCEDURE_CATALOG.filter((def) => pastSurgicalProcedureMatchesQuery(def, q)),
  );
}

export const PAST_SURGICAL_QUICK_ADD_VALUES: readonly PastSurgicalCatalogProcedure[] = [
  "appendectomy",
  "lscs",
  "cholecystectomy",
  "hernia-repair",
  "hysterectomy",
] as const;

/** Slugs for backend validation — keep in sync with catalog values. */
export const PAST_SURGICAL_CATALOG_PROCEDURE_SLUGS = PAST_SURGICAL_PROCEDURE_CATALOG.map(
  (def) => def.value,
) as readonly PastSurgicalCatalogProcedure[];
