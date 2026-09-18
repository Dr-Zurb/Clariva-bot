/**
 * Content-sanity test for migration 230 (drug_master FDC + programme expand).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/230_drug_master_seed_expand_combos.sql'
);

describe('230_drug_master_seed_expand_combos.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('inserts into drug_master with the canonical column set', () => {
    expect(sql).toMatch(
      /INSERT INTO drug_master \(generic_name, brand_names, strength, form, route_default\)/
    );
  });

  it('guards inserts on generic_name + form + strength', () => {
    expect(sql).toMatch(
      /WHERE lower\(dm\.generic_name\) = lower\(seed\.generic_name\)\s+AND lower\(coalesce\(dm\.form/
    );
    expect(sql).toMatch(/lower\(coalesce\(dm\.strength/);
  });

  it('ships a large curated FDC / programme expand (≥130 VALUE rows)', () => {
    const insertBlock = sql.slice(sql.indexOf('INSERT INTO drug_master'));
    const rows = insertBlock.match(/^\s+\('/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(130);
  });

  it('cleans up brand-as-generic and true-duplicate qualifier rows', () => {
    expect(sql).toMatch(/Pheniramine Maleate/);
    expect(sql).toMatch(/Etofylline \+ Theophylline/);
    expect(sql).toMatch(/Beclomethasone \+ Clotrimazole \+ Chloramphenicol \+ Lidocaine/);
    expect(sql).toMatch(/Levonorgestrel \+ Ethinylestradiol/);
    expect(sql).toMatch(/Aluminium Hydroxide \+ Magnesium Hydroxide \+ Simethicone/);
    expect(sql).toMatch(/DELETE FROM drug_master/);
    expect(sql).toMatch(/Rifaximin \(hepatic\)/);
    expect(sql).toMatch(/Baclofen \(neuro\)/);
    expect(sql).toMatch(/Hydroxychloroquine \(rheum\)/);
    expect(sql).toMatch(/Sulfasalazine \(rheum\)/);
    expect(sql).toMatch(/Sodium Bicarbonate \(alkaline\)/);
    expect(sql).toMatch(/Hyoscine \(injection\)/);
    expect(sql).toMatch(/Nifedipine \(tocolytic\)/);
    expect(sql).toMatch(/Hydrocortisone \(injection\)/);
  });

  it('strips route parentheticals and keeps insulin / vitamin INN labels out of the strip list', () => {
    expect(sql).toMatch(
      /SET generic_name = 'Ofloxacin'\s+WHERE lower\(generic_name\) = lower\('Ofloxacin \(eye\)'\)/
    );
    expect(sql).toMatch(
      /SET generic_name = 'Diclofenac'\s+WHERE lower\(generic_name\) = lower\('Diclofenac \(topical\)'\)/
    );
    expect(sql).not.toMatch(/Insulin \(Glargine\)/);
    expect(sql).not.toMatch(/Vitamin D3 \(Cholecalciferol\)/);
    expect(sql).not.toMatch(/Vitamin B12 \(Methylcobalamin\)/);
  });

  it('includes high-volume Indian OPD FDCs and programme drugs', () => {
    expect(sql).toMatch(/'Aceclofenac \+ Paracetamol \+ Serratiopeptidase'/);
    expect(sql).toMatch(/'Ofloxacin \+ Ornidazole'/);
    expect(sql).toMatch(/'Rabeprazole \+ Levosulpiride'/);
    expect(sql).toMatch(/'Telmisartan \+ Chlorthalidone'/);
    expect(sql).toMatch(/'Ferrous Ascorbate \+ Folic Acid'/);
    expect(sql).toMatch(/'Formoterol \+ Glycopyrronium \+ Budesonide'/);
    expect(sql).toMatch(/'Bedaquiline'/);
    expect(sql).toMatch(/'Miltefosine'/);
    expect(sql).toMatch(/'Artesunate'/);
    expect(sql).toMatch(/'Snake Antivenom \(Polyvalent\)'/);
    expect(sql).toMatch(/'Deflazacort'/);
  });

  it('omits CDSCO / rationality-contested FDCs pending review', () => {
    expect(sql).not.toMatch(/Cefixime \+ Ofloxacin/);
    expect(sql).not.toMatch(/Cefixime \+ Clavulan/);
    expect(sql).not.toMatch(/Azithromycin \+ Cefixime/);
    expect(sql).not.toMatch(/Nimesulide \+ Paracetamol/);
    expect(sql).not.toMatch(/Hydroquinone \+ Tretinoin/);
    expect(sql).not.toMatch(/Clobetasol \+ Ofloxacin \+ Ornidazole/);
    expect(sql).not.toMatch(/Aspirin \+ Clopidogrel \+ Atorvastatin/);
  });

  it('does not rewrite schema or RLS', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});
