import { describe, expect, it } from '@jest/globals';

import { analyzeIngredients } from '../../analysis/analyze';
import { parseNutritionText } from '../../analysis/nutrition';
import { parseSupplementText } from '../../supplements/nutrients';
import { kRuokaToProduct, sKaupatToProduct } from '../groceryApis';

describe('sKaupatToProduct', () => {
  it('maps ingredients and the per-100 g group (Finnish strings, thousands with a space)', () => {
    const p = sKaupatToProduct({
      ean: '6413467446900',
      name: 'Vatsaystävällinen Pehmeä vehnä-kaura-pellava leipä',
      brandName: 'Fazer',
      ingredientStatement: 'vehnäjauho, vesi, kaurahiutale, pellavansiemen, rypsiöljy, hiiva, suola',
      productDetails: {
        nutrients: [
          {
            referenceQuantity: '100 g',
            nutrients: [
              { name: 'Energia', value: '1 004 kJ / 238 kcal' },
              { name: 'Rasva', value: '3,2 g' },
              { name: 'josta tyydyttyneitä rasvahappoja', value: '0,4 g' },
              { name: 'Hiilihydraatit', value: '40 g' },
              { name: 'josta sokereita', value: '2,1 g' },
              { name: 'Ravintokuitu', value: '6,5 g' },
              { name: 'Proteiini', value: '9 g' },
              { name: 'Suola', value: '0,95 g' },
            ],
          },
        ],
      },
    });
    expect(p.name).toBe('Fazer Vatsaystävällinen Pehmeä vehnä-kaura-pellava leipä');
    expect(parseNutritionText(p.nutritionText!)).toEqual({ energyKj: 1004, fat: 3.2, saturatedFat: 0.4, sugars: 2.1, fiber: 6.5, salt: 0.95 });
    expect(analyzeIngredients(p.ingredients, { productName: p.name }).verdict).toBe('green');
  });

  it('turns a per-piece supplement group into a readable label', () => {
    const p = sKaupatToProduct({
      name: 'Iltamagnesium 120 kps',
      productDetails: { nutrients: [{ referenceQuantity: '1 kpl', nutrients: [{ name: 'Magnesium', value: '125 mg', recommendedIntake: '33' }] }] },
    });
    expect(p.nutritionText).toBeUndefined();
    expect(parseSupplementText(p.pageText!)).toEqual({ amounts: { magnesium: 125 }, doseUnits: 1 });
  });
});

describe('kRuokaToProduct', () => {
  it('maps numeric nutrients, ingredients and secondary (vitamin) nutrients', () => {
    const p = kRuokaToProduct({
      product: {
        localizedName: { finnish: 'Valio jogurtti mansikka 200 g' },
        productAttributes: {
          productContents: { fi: 'maito, mansikka (10 %), sokeri, maitohappobakteerit' },
          nutritionalContents: [
            {
              basis: { fi: '100 g' },
              nutrients: { energyKj: 350, fat: { amount: 2.5 }, fatSaturated: { amount: 1.6 }, carbohydratesSugar: { amount: 11 }, salt: { amount: 0.1 } },
              secondaryNutrients: [{ name: { fi: 'D-vitamiini' }, unit: 'µg', amount: 1 }],
            },
          ],
        },
      },
    });
    expect(p.name).toBe('Valio jogurtti mansikka 200 g');
    expect(parseNutritionText(p.nutritionText!)).toEqual({ energyKj: 350, fat: 2.5, saturatedFat: 1.6, sugars: 11, salt: 0.1 });
    expect(p.pageText).toBe('D-vitamiini 1 µg');
    expect(analyzeIngredients(p.ingredients).verdict).toBe('red');
  });
});
