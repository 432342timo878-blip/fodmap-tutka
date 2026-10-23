import { describe, expect, it } from '@jest/globals';

import { analyzeIngredients } from '../analyze';
import { parseIngredients } from '../parse';

const ids = (text: string, opts = {}) =>
  analyzeIngredients(text, opts).findings.map((f) => `${f.entry.id}:${f.severity}`);

describe('parseIngredients', () => {
  it('splits top-level ingredients and keeps sub-ingredients with the parent position', () => {
    const segs = parseIngredients('Vesi, VEHNÄJAUHO 45 %, mausteet (sipuli, valkosipuli), suola.');
    expect(segs.map((s) => s.text)).toEqual(['vesi', 'vehnäjauho', 'mausteet', 'suola']);
    expect(segs[1].percent).toBe(45);
    expect(segs[2].children.map((c) => [c.text, c.index])).toEqual([['sipuli', 2], ['valkosipuli', 2]]);
  });

  it('keeps decimal commas and reads a percentage in parentheses', () => {
    const segs = parseIngredients('mansikka (2,5 %), sokeri');
    expect(segs[0]).toMatchObject({ text: 'mansikka', percent: 2.5 });
    expect(segs).toHaveLength(2);
  });

  it('drops may-contain warnings and Open Food Facts allergen markup', () => {
    const segs = parseIngredients('_kaura_, suola. Voi sisältää pieniä määriä vehnää ja maitoa.');
    expect(segs.map((s) => s.text)).toEqual(['kaura', 'suola']);
  });
});

describe('analyzeIngredients', () => {
  it('marks rye bread red', () => {
    const r = analyzeIngredients('täysjyväruisjauho, vesi, ruisjauho, suola, hiiva');
    expect(r.verdict).toBe('red');
    expect(ids('täysjyväruisjauho, vesi, suola')).toEqual(['ruis:bad']);
  });

  it('flags garlic even far down the list', () => {
    const r = analyzeIngredients('peruna, rypsiöljy, suola, maltodekstriini, valkosipulijauhe');
    expect(r.verdict).toBe('red');
    expect(r.findings[0].entry.id).toBe('valkosipuli');
  });

  it('treats a small amount of wheat as caution, not red', () => {
    expect(ids('broileri 80 %, vesi, suola, sokeri, vehnäjauho, mustapippuri')).toEqual(['vehna:caution']);
    expect(ids('broileri, vehnäjauho 2 %, suola')).toEqual(['vehna:caution']);
  });

  it('prefers the longest match (wheat starch and glucose syrup are fine)', () => {
    expect(analyzeIngredients('vehnätärkkelys, sokeri, glukoosisiirappi (vehnä)').verdict).toBe('green');
    expect(analyzeIngredients('vehnäglukoosisiirappi, sokeri').verdict).toBe('green');
  });

  it('recognises lactose-free dairy', () => {
    const r = analyzeIngredients('laktoositon maito, maitohappobakteerit, laktaasientsyymi');
    expect(r.lactoseFree).toBe(true);
    expect(r.verdict).toBe('green');
    expect(analyzeIngredients('maito, kerma, sokeri').verdict).toBe('red');
    expect(analyzeIngredients('maito, sokeri', { productName: 'Valio laktoositon maitojuoma' }).verdict).toBe('green');
  });

  it('does not confuse milk derivatives or coconut milk with milk', () => {
    expect(analyzeIngredients('kookosmaito, vesi, maitohappo, maitorasva').verdict).toBe('green');
  });

  it('handles polyols and E-codes', () => {
    expect(ids('makeutusaineet: ksylitoli, sorbitoli, aspartaami')).toEqual(['ksylitoli:bad', 'sorbitoli:bad']);
    expect(ids('sokeri, kostuteaine E 420')).toEqual(['sorbitoli:bad']);
    expect(analyzeIngredients('sokeri, E330, E471').verdict).toBe('green');
  });

  it('does not read phosphate as FOS', () => {
    expect(analyzeIngredients('sianliha, suola, natriumfosfaatti').verdict).toBe('green');
  });

  it('flags inulin and chicory fibre', () => {
    expect(ids('kaura, sikurijuurikuitu, suola')).toEqual(['sikuri:bad']);
    expect(ids('jogurtti (laktoositon), inuliini')).toEqual(['inuliini:bad', 'jogurtti:ok']);
  });

  it('ignores fruit named only in a flavouring but keeps onion flavouring', () => {
    expect(analyzeIngredients('kaura, sokeri, omena-aromi').verdict).toBe('green');
    expect(analyzeIngredients('peruna, rypsiöljy, sipuliaromi').verdict).toBe('red');
  });

  it('marks unspecified spices and stock as caution', () => {
    expect(ids('sianliha, suola, mausteet')).toEqual(['mausteet:caution']);
    expect(ids('vesi, kanaliemi, suola')).toEqual(['liemi:caution']);
  });

  it('distinguishes green beans and pea protein from legumes', () => {
    expect(analyzeIngredients('vihreät pavut, vesi, suola').verdict).toBe('green');
    expect(analyzeIngredients('vesi, herneproteiini, rypsiöljy').verdict).toBe('green');
    expect(analyzeIngredients('härkäpapu, vesi, suola').verdict).toBe('red');
    expect(analyzeIngredients('kikherneet, seesamitahna, sitruunamehu').verdict).toBe('red');
  });

  it('keeps soy lecithin and soy sauce low', () => {
    expect(analyzeIngredients('sokeri, kaakaovoi, emulgointiaine (soijalesitiini)').verdict).toBe('green');
    expect(analyzeIngredients('riisi, soijakastike (vesi, soijapavut, vehnä, suola)').verdict).toBe('green');
  });

  it('reads cheese and quark ingredient lists sensibly', () => {
    const cheese = 'pastöroitu maito, suola, hapate, juoksete, väri (beetakaroteeni)';
    expect(analyzeIngredients(cheese, { productName: 'Edam juusto' }).verdict).toBe('green');
    expect(analyzeIngredients('rasvaton maito, hapate, juoksute', { productName: 'Maitorahka' }).verdict).toBe('yellow');
    // Pizzan juuston ala-ainesosat eivät tee siitä maitotuotetta.
    expect(ids('vehnäjauho, vesi, juusto (maito, suola, hapate, juoksete)')).toEqual(['vehna:bad']);
  });

  it('skips allergen origin notes and unknown mix names whose contents are listed', () => {
    expect(ids('sokeri, kaakaovoi, heraproteiinijauhe (maidosta)')).toEqual(['heraproteiini:caution']);
    expect(ids('peruna, rypsiöljy, mausteseos (suola, paprika)')).toEqual([]);
  });

  it('uses the product name for plant drinks', () => {
    expect(ids('vesi, kaura 10 %, rypsiöljy, suola', { productName: 'Oatly Kaurajuoma' })).toEqual(['kaurajuoma:caution']);
  });

  it('honours tolerated groups', () => {
    const r = analyzeIngredients('maito, sokeri', { tolerated: ['laktoosi'] });
    expect(r.verdict).toBe('green');
    expect(r.findings[0]).toMatchObject({ severity: 'ok', tolerated: true });
  });

  it('returns unknown without ingredients and lists unrecognised words', () => {
    expect(analyzeIngredients('').verdict).toBe('unknown');
    expect(analyzeIngredients('riisi, kvarkkimössö').unrecognized).toEqual(['kvarkkimössö']);
  });

  it('does not read "raising agent" as raisins', () => {
    const bite = 'Milk protein, raising agent (polydextrose), white chocolate coating (sweetener [maltitol], cocoa butter), salt';
    expect(ids(bite)).not.toContain('rusina:caution');
    expect(ids('oats, raisins, sugar')).toContain('rusina:caution');
  });

  it('works on English fallback text', () => {
    expect(analyzeIngredients('wheat flour, sugar, onion powder').verdict).toBe('red');
    expect(analyzeIngredients('pineapple, sugar, rice').verdict).toBe('green');
  });
});
