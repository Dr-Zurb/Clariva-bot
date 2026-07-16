# Plan investigations library — 12 Jul 2026 program

> **Why this exists.** Plan investigations are a flat semicolon string with a small chip list. Doctors need a real OPD order library, package expand (LFT → members with select-all / partial), custom free-text, and later catalog-constrained AI resolve — without forking Objective’s lab library.

---

## The one-sentence goal

> **Grow one shared static lab/imaging library and let Plan orders pick panels (expand → select members) or singles/custom into the existing `investigations_orders` string — full panel commits the package name; partial commits member names — AI resolve and structured JSON later.**

---

## Decision lock

- **INV-D1 — Flat string v1.** Keep `investigations_orders`; no migration. Structured JSON is Wave 4+.
- **INV-D2 — One library.** Extend `lab-test-library.ts` (+ imaging list). Plan and Objective share vocabulary.
- **INV-D3 — Panel commit rule.** All members selected → store **panel name** (`LFT`). Partial → store **selected analyte names**.
- **INV-D4 — Custom always allowed.** Combobox free-text `Add "…"`.
- **INV-D5 — AI v1 = catalog resolve only.** Suggestion-only, never auto-commit (Wave 3). Suggest-from-Assessment deferred.
- **INV-D6 — Imaging expand is view-gated.** Plain films with `viewIds` expand like panels (named basket of views: PA / Lateral / …). Other imaging (ECG, USG, CT, MRI, …) stays atomic. Untouched X-ray prints the study name only; customized prints `Title: view1, view2, …` (same INV-D11 flat TEXT rule).
- **INV-D7 — Curated OPD set.** Hundreds of static entries OK; not a LOINC dump. Ranges stay provisional until clinical review.
- **INV-D8 — Structured JSON is additive; flat string stays authoritative (W4).** Migration 167 adds `investigations_orders_json` (`{ id, label, kind: panel|analyte|imaging|custom }`). The cockpit form derives it from the chip labels on save; the legacy `investigations_orders` TEXT is still what every reader (PDF / SMS / public API) uses, byte-identical for equal orders. Empty array = passthrough. Structured stays a derived write-side artifact in v1 — a later wave can promote it to the interactive source.
- **INV-D9 — Immediate panel commit; expand to trim.** Tapping a panel quick-pick / catalog hit commits the **full package** immediately (no staging “Add to orders”). Expand the committed panel chip to deselect members (INV-D3 rewrite). “Add another order” inside the editor adds a **sibling** chip — never folds unrelated tests into the package name.
- **INV-D10 — Curated commons + paper order list.** Common-order chips are a fixed ~11 OPD set (~2 rows); the combobox owns the long tail. Committed orders render as a 1–2 column paper-style row list (not wrapping badges).
- **INV-D11 — Named baskets, doctor owns the package.** Expanded panels are editable named baskets: add any test inside, rename the title anytime. Catalog membership is a seed, not a gate. Soft rename nudge when membership leaves the template but the title is still the catalog name. Untouched catalog panels still print the panel name only (INV-D3); customized baskets print `Title: member1, member2, …` in the flat TEXT (and structured JSON keeps `members`).

### Library enrichment

| Wave | Scope | Status |
|---|---|---|
| **E1** | Deepen CBC+diff / LFT / KFT / lipid / thyroid / urine / diabetes (+ ~24 analytes, aliases) | **Shipped** (`LAB_TEST_LIBRARY_VERSION = 2`) |
| **E2** | Fever / serology / cardiac / hormones + imaging pad | **Shipped** (`LAB_TEST_LIBRARY_VERSION = 3`) |
| **E3** | Specialty packs (obgyn / peds / rheum) | **Shipped** (`LAB_TEST_LIBRARY_VERSION = 4`) |

---

## Phasing

| Wave | Task | Scope | Migration? |
|---|---|---|---|
| **W0** | `inv-lib-01` | Grow analytes / panels / imaging + aliases | No |
| **W1** | `inv-lib-02` | Panel expand checklist + commit rule + search panels+analytes | No |
| **W2** | `inv-lib-03` | Alias dedupe polish | No |
| **W3** | `inv-lib-04` | AI catalog resolve — W3a local suggest + W3b gated LLM resolve | No* |
| **W4** | `inv-lib-05` | Structured orders JSON + derived text | **Yes (167)** |
| **W5** | investigations templates | Scoped Rx templates (`investigations_orders`) — save/apply order lists | **Yes (168)** |

---

**Created:** 2026-07-12. **Status:** W0–W4 shipped. W4 (migration 167, Opus) added the additive `investigations_orders_json` column, tolerant Zod validator, service persist, and the frontend save-boundary derivation (INV-D8). Readers untouched — PDF/SMS/public-API parity verified.

### W4 — structured orders JSON (shipped, Opus · migration 167)

- **Additive column, mirrors `diagnoses_json` (161).** `investigations_orders_json JSONB NOT NULL DEFAULT '[]'` + array CHECK; RLS inherited (migration 026, doctor-only); no backfill; documented drop-column rollback.
- **Tolerant validator.** `investigationsOrdersJsonSchema` drops malformed rows (missing id/label), defaults an unknown `kind` to `custom`, dedupes by `kind:id`, caps at 40 — never rejects the save. Wired into the shared `structuredSoapFieldsSchema` (create + update).
- **Derived at the save boundary (INV-D8).** `deriveInvestigationOrdersJson` resolves each chip label to its catalog entry (`kind` + stable id) or a `custom:<norm>` order; `buildRxPayload` sends it alongside the still-authoritative flat `investigations` string. Labels join back byte-identical → readers unchanged.

### W3b — gated AI resolve (shipped, Opus)

- **Backend normalizer, not a catalog owner.** The order catalog is a FRONTEND static library (unlike `diagnosis_catalog`), so `POST /api/v1/investigations/parse` only NORMALIZES messy/vernacular/typo order text into clean English order TERMS. It returns terms, never catalog ids.
- **Client-side catalog constraint.** The frontend re-resolves every returned term against the static catalog (`mapResolvedTermsToCatalog`) — the model can never surface an order the catalog does not know. No local near-miss → gated AI fires; results reuse the same `InvestigationSuggestPanel` (loading/error/ready).
- **Same safety contract as asmt-07.** PHI redacted before the prompt; audit metadata-only; fail-soft (empty/truncated/malformed/abort → keep typed text). Mini model tier (`getOpenAIInvestigationResolveConfig`), flagship on explicit refine.
- **Token-gated.** The row only calls AI when a `token` is passed (PlanSection + InvestigationsPane); AutoMerge / composition-root mounts degrade to local-only suggest.
