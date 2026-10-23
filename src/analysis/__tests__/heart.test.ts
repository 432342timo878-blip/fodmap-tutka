import { describe, expect, it } from '@jest/globals';

import { assessHeartSymbol, classifyHeartGroup, HEART_GROUP_BY_ID } from '../heartCriteria';
import { parseNutritionText } from '../nutrition';

const group = (id: string) => HEART_GROUP_BY_ID.get(id)!;

describe('parseNutritionText', () => {
  it('reads a Finnish nutrition table', () => {
    const n = parseNutritionText(
      'Ravintosisältö 100 g Energia 1557 kJ / 329 kcal Rasva 11 g josta tyydyttyneitä rasvahappoja 4,6 g ' +
        'Hiilihydraatti 30 g josta sokereita 3,7 g Ravintokuitu 12 g Proteiini 32 g Suola 0,73 g',
    );
    expect(n).toEqual({ energyKj: 1557, fat: 11, saturatedFat: 4.6, sugars: 3.7, fiber: 12, salt: 0.73 });
  });

  it('copes with OCR line breaks, "<" values and sodium', () => {
    const n = parseNutritionText('Rasva\n1,5 g\n- josta tyydyttyneet\n<0,1 g\nSokerit 2 g\nNatrium 400 mg');
    expect(n).toMatchObject({ fat: 1.5, saturatedFat: 0.1, sugars: 2, salt: 1 });
  });

  it('reads English labels', () => {
    expect(parseNutritionText('Fat 3.0 g of which saturates 0.3 g Carbohydrate 6 g of which sugars 4 g Fibre 0.8 g Salt 0.1 g')).toEqual({
      fat: 3,
      saturatedFat: 0.3,
      sugars: 4,
      fiber: 0.8,
      salt: 0.1,
    });
  });
});

describe('classifyHeartGroup', () => {
  it('prefers specific Open Food Facts categories over the name', () => {
    expect(classifyHeartGroup('Bite Protein Cheesecake', ['en:snacks', 'en:bars', 'en:protein-bars'])?.id).toBe('biscuit');
    expect(classifyHeartGroup('Bite Protein Cheesecake')?.id).toBe('excluded-pastries');
  });

  it('recognises common Finnish product names', () => {
    const cases: [string, string][] = [
      ['Vaasan Ruispalat 660 g', 'bread'],
      ['Finn Crisp näkkileipä', 'crispbread'],
      ['Oatly kaurajuoma 1 l', 'plant-drink'],
      ['Valio rasvaton maito', 'milk'],
      ['Valio Eila jogurtti mansikka', 'yogurt'],
      ['Arla raejuusto', 'cottage-cheese'],
      ['Oltermanni juusto 17 %', 'cheese'],
      ['Pirkka kinkkupizza', 'savory-pastry'],
      ['HK Kabanossi grillimakkara', 'sausage'],
      ['Atria broilerin rintafilee', 'meat'],
      ['Härkis kasvispihvi', 'plant-protein'],
      ['Findus kalapuikot', 'fish-dish'],
      ['Felix ketsuppi', 'ketchup'],
      ['Pirkka paseerattu tomaatti', 'vegetables'],
      ['Coca-Cola Zero', 'excluded-drinks'],
    ];
    expect(cases.map(([name]) => [name, classifyHeartGroup(name)?.id])).toEqual(cases);
  });
});

describe('assessHeartSymbol', () => {
  it('fails the protein bar on saturated fat share', () => {
    const r = assessHeartSymbol(group('biscuit'), { fat: 11, saturatedFat: 4.6, sugars: 3.7, fiber: 12, salt: 0.73 });
    expect(r.status).toBe('notEligible');
    expect(r.results.filter((x) => x.status === 'fail').map((x) => x.label)).toEqual(['Tyydyttynyt rasva']);
  });

  it('applies the "fat X, or up to Y if saturated is low" rule', () => {
    const bread = group('bread');
    const ok = assessHeartSymbol(bread, { fat: 7, saturatedFat: 1.2, sugars: 2, fiber: 9, salt: 0.8 });
    expect(ok.status).toBe('eligible');
    const tooSaturated = assessHeartSymbol(bread, { fat: 7, saturatedFat: 2.5, sugars: 2, fiber: 9, salt: 0.8 });
    expect(tooSaturated.status).toBe('notEligible');
    const tooFat = assessHeartSymbol(bread, { fat: 12, saturatedFat: 1, sugars: 2, fiber: 9, salt: 0.8 });
    expect(tooFat.status).toBe('notEligible');
  });

  it('is unknown when a needed value is missing, and checks added ingredients', () => {
    expect(assessHeartSymbol(group('bread'), { fat: 2, sugars: 2, salt: 0.8 }).status).toBe('unknown');
    const veg = group('vegetables');
    expect(assessHeartSymbol(veg, {}, 'tomaatti, tomaattimehu').status).toBe('eligible');
    expect(assessHeartSymbol(veg, {}, 'tomaatti, suola, sokeri').status).toBe('notEligible');
    expect(assessHeartSymbol(group('milk'), {}, 'rasvaton maito').results.some((r) => r.label === 'Ei lisättyä rasvaa')).toBe(false);
  });

  it('marks discontinued groups as excluded', () => {
    expect(assessHeartSymbol(group('excluded-icecream'), { fat: 1 }).status).toBe('excluded');
  });
});
