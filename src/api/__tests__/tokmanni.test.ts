import { describe, expect, it } from '@jest/globals';

import { analyzeIngredients } from '../../analysis/analyze';
import { parseNutritionText } from '../../analysis/nutrition';
import { parseTokmanniPage } from '../tokmanni';

// Lyhennetty Tokmannin tuotesivun rakenne (haettu 10/2026).
const page = (ingredientParts: string[]) => `
<h1 class="page-title"><span>Kulta Muro 225 g keksi</span></h1>
<div class="mt2 mb1"> <div class="pb2 bold">Ainesosat/Ingredienser</div>
${ingredientParts.map((p) => `<div class="pb1">${p}</div> <br>`).join('\n')}
</div>
<div class="pb2 bold">Ravintosisältö/Näringsvärde <span class="value">per 100G</span> </div>
<div class="pb1">Energia/Energi <span class="value">2008 kJ, 478 kcal</span> </div>
<div class="pb1">Rasvaa/Fett <span class="value">20 g</span> </div>
<div class="pb1">josta tyydyttyneitä rasvoja/varav mättat fett <span class="value">2,1 g</span> </div>
<div class="pb1">Hiilihydraatit/Kolhydrat <span class="value">68 g</span> </div>
<div class="pb1">josta sokereita/varav sockerarter <span class="value">25 g</span> </div>
<div class="pb1">Ravintokuitu/Kostfiber <span class="value">2,4 g</span> </div>
<div class="pb1">Suola/Salt <span class="value">0,76 g</span> </div>
<div class="pb2 bold">Valmistaja</div>`;

describe('parseTokmanniPage', () => {
  it('reads the Finnish ingredient list and the nutrition table', () => {
    const r = parseTokmanniPage(
      page([
        'VEHN&Auml;JAUHO, sokeri, auringonkukka&ouml;ljy, VEHN&Auml;T&Auml;RKKELYS, siirappi, suola, aromi.',
        'VETEMJÖL, socker, solrosolja, VETESTÄRKELSE, sirap, salt, arom.',
      ]),
    );
    expect(r.name).toBe('Kulta Muro 225 g keksi');
    expect(r.ingredients).toBe('VEHNÄJAUHO, sokeri, auringonkukkaöljy, VEHNÄTÄRKKELYS, siirappi, suola, aromi.');
    expect(parseNutritionText(r.nutritionText!)).toEqual({ energyKj: 2008, fat: 20, saturatedFat: 2.1, sugars: 25, fiber: 2.4, salt: 0.76 });
  });

  it('picks the Finnish text even when the Swedish one comes first', () => {
    const r = parseTokmanniPage(page(['HAVRE (33 %), socker, salt och mjölk', 'KAURA (33 %), sokeri, suola ja maito']));
    expect(r.ingredients).toBe('KAURA (33 %), sokeri, suola ja maito');
    expect(analyzeIngredients(r.ingredients).findings.map((f) => f.entry.id)).toEqual(['maito']);
  });
});
