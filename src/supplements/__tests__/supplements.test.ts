import { describe, expect, it } from '@jest/globals';

import { assessStack, daysLeft, Supplement } from '../assess';
import { isSupplementLabel, parseSupplementText } from '../nutrients';

describe('parseSupplementText', () => {
  it('reads a Finnish multivitamin label and ignores ingredient-list mentions and percentages', () => {
    const label =
      'Ainesosat: kalsiumkarbonaatti, magnesiumoksidi, täyteaine (mikrokiteinen selluloosa), kalsium-D-pantotenaatti, kaliumjodidi. ' +
      'Päiväannos (2 tablettia) sisältää: D3-vitamiini 25 µg 500 %*, C-vitamiini 80 mg 100 %*, B12-vitamiini 2,5 µg, ' +
      'B6-vitamiini 1,4 mg, Foolihappo 200 µg, Pantoteenihappo (kalsium-D-pantotenaattina) 6 mg, Kalsium 200 mg, ' +
      'Magnesium 100 mg, Sinkki 10 mg, Jodi (kaliumjodidina) 150 µg, Seleeni 55 µg';
    const r = parseSupplementText(label);
    expect(r.doseUnits).toBe(2);
    expect(r.amounts).toEqual({
      vitD: 25, vitC: 80, b12: 2.5, b6: 1.4, b9: 200, b5: 6, calcium: 200, magnesium: 100, zinc: 10, iodine: 150, selenium: 55,
    });
  });

  it('reads the lines collected from a health-store product page', () => {
    const lines = [
      'Suositeltu vuorokausiannos: 1 - 4 kapselia tarvittaessa noin tunti ennen nukkumaanmenoa.',
      'Life Magnesium Boost on vahva magnesiumvalmiste, josta saat 350 mg helposti imeytyvää magnesiumia',
      'magnesium 125 mg (33% päivittäisestä tarpeesta)',
      'magnesium 125 mg (33% av daglig rekommenderad dos)',
      'L-tryptofaani 50 mg',
    ].join('\n');
    expect(parseSupplementText(lines).amounts).toEqual({ magnesium: 125 });
  });

  it('reads shop tables with dose ranges as the upper end', () => {
    const table = 'Ravintosisältö | 2–6 mittalusikallista\nMagnesium | 76–228 mg (20–60 %*)\nKalium | 386–1158 mg\nKalsium / Kalcium | 148–444 mg';
    expect(parseSupplementText(table)).toEqual({ amounts: { magnesium: 228, potassium: 1158, calcium: 444 }, doseUnits: 6 });
  });

  it('converts IU and units, and sums EPA and DHA', () => {
    expect(parseSupplementText('Vitamin D3 2000 IU').amounts.vitD).toBe(50);
    expect(parseSupplementText('Magnesium 0,3 g').amounts.magnesium).toBe(300);
    expect(parseSupplementText('Kalaöljy 1000 mg, josta EPA 330 mg ja DHA 220 mg').amounts.omega3).toBe(550);
    expect(parseSupplementText('Kreatiinimonohydraatti 3 g').amounts.creatine).toBe(3);
  });
});

describe('assessStack', () => {
  const base = (s: Partial<Supplement>): Supplement => ({ id: s.name ?? 'x', name: 'x', amounts: {}, doseUnits: 1, unitsPerDay: 1, ...s });

  it('adds up doses across products and flags upper limits and duplicates', () => {
    const stack = [
      base({ name: 'D-vitamiini 100', amounts: { vitD: 100 } }),
      base({ name: 'Monivitamiini', amounts: { vitD: 25, zinc: 10 }, doseUnits: 2, unitsPerDay: 1 }),
    ];
    const r = assessStack(stack);
    expect(r.totals.find((t) => t.id === 'vitD')).toMatchObject({ total: 112.5, status: 'over' });
    expect(r.totals.find((t) => t.id === 'zinc')).toMatchObject({ total: 5, status: 'low' });
    expect(r.warnings[0].level).toBe('bad');
    expect(r.warnings.some((w) => w.text.startsWith('D-vitamiini tulee 2 valmisteesta'))).toBe(true);
  });

  it('warns about IBS-unfriendly ingredients and laxative doses', () => {
    const r = assessStack([
      base({ name: 'Purutabletti', amounts: { magnesium: 300 }, ingredientsText: 'makeutusaine (ksylitoli, sorbitoli), magnesiumsitraatti' }),
    ]);
    expect(r.warnings.map((w) => w.text).join(' ')).toMatch(/löysätä vatsaa/);
    expect(r.warnings.map((w) => w.text).join(' ')).toMatch(/ksylitoli.*IBS/);
  });

  it('predicts when a pack runs out', () => {
    const day = 24 * 60 * 60 * 1000;
    const s = base({ name: 'Omega', unitsPerDay: 2, packSize: 60, packStartedAt: 0 });
    expect(daysLeft(s, 25 * day)).toBe(5);
    expect(assessStack([s], 25 * day).warnings[0].text).toMatch(/Omega loppuu/);
  });
});

describe('isSupplementLabel', () => {
  it('tells supplement labels from food nutrition tables', () => {
    expect(isSupplementLabel('Ravintolisä. Päiväannos (1 tabletti): D3-vitamiini 50 µg')).toBe(true);
    expect(isSupplementLabel('Magnesium Citrate 200 mg per capsule. Food supplement.')).toBe(true);
    expect(
      isSupplementLabel('Valio rasvaton maito. Ravintosisältö 100 g: Energia 140 kJ, Rasva 0,1 g, Hiilihydraatit 4,9 g, Kalsium 120 mg, D-vitamiini 1 µg'),
    ).toBe(false);
    expect(isSupplementLabel('Ainesosat: vesi, vehnäjauho, suola')).toBe(false);
  });
});
