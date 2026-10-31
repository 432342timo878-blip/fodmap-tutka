import { describe, expect, it } from '@jest/globals';

import { analyzeIngredients } from '../analyze';
import { createHeartSymbolMatcher, nameTokens } from '../heartSymbol';
import { ingredientsFromOcrLines } from '../ocrText';

describe('other IBS triggers (not FODMAPs)', () => {
  it('lists caffeine, carbonation and emulsifiers separately without changing the verdict', () => {
    const energyDrink = 'vesi, sokeri, hiilidioksidi, happamuudensäätöaine (sitruunahappo), kofeiini, aromit, väri (E150d)';
    const r = analyzeIngredients(energyDrink);
    expect(r.verdict).toBe('green');
    expect(r.otherTriggers.map((f) => f.entry.id)).toEqual(['hiilihappo', 'kofeiini']);
    const cream = analyzeIngredients('kerma, stabilointiaine (karrageeni)', { productName: 'laktoositon kerma' });
    expect(cream.otherTriggers.map((f) => f.entry.id)).toEqual(['emulgointiaineet-ibs']);
    expect(analyzeIngredients('tomaatti, chili, suola').otherTriggers.map((f) => f.entry.id)).toEqual(['tulinen']);
  });

  it('flags hydrogenated starch hydrolysate as a polyol', () => {
    expect(analyzeIngredients('makeutusaine (hydrogenoitu tärkkelyshydrolysaatti), kaakaovoi').verdict).toBe('red');
  });
});

describe('lactose-free detection', () => {
  const yoghurt = 'maito, kerma, mansikka 10 %, sokeri, maitohappobakteerit';

  it('reads lactose-free product lines and Open Food Facts labels', () => {
    expect(analyzeIngredients(yoghurt).verdict).toBe('red');
    expect(analyzeIngredients(yoghurt, { productName: 'Valio Eila mansikkajogurtti' }).lactoseFree).toBe(true);
    expect(analyzeIngredients(yoghurt, { productName: 'Valio PROfeel rahka' }).lactoseFree).toBe(true);
    expect(analyzeIngredients(yoghurt, { productName: 'Jogurtti en:lactose-free en:no-gluten' }).lactoseFree).toBe(true);
    expect(analyzeIngredients(yoghurt, { productName: 'Jogurtti fi:laktoositon' }).verdict).toBe('green');
  });

  it('does not treat words merely containing "eila" as lactose-free', () => {
    expect(analyzeIngredients(yoghurt, { productName: 'Keilaranta jogurtti' }).lactoseFree).toBe(false);
  });
});

describe('heart symbol name matching', () => {
  const isHeart = createHeartSymbolMatcher([
    'pirkka-luomu-paseerattu-tomaatti-500-g',
    'juustoportti-kaurajuoma-1-l',
    'pirkka-suomalainen-kevyt-kermajuustoviipale-17',
  ]);

  it('ignores sizes and punctuation', () => {
    expect(nameTokens('Juustoportti Kaurajuoma 1l')).toEqual(['juustoportti', 'kaurajuoma']);
    expect(isHeart('Pirkka Luomu paseerattu tomaatti 500g')).toBe(true);
    expect(isHeart('Juustoportti kaurajuoma 1 l')).toBe(true);
  });

  it('requires every word of the listed product', () => {
    expect(isHeart('Pirkka paseerattu tomaatti 500g')).toBe(false);
    expect(isHeart('Juustoportti kaurajogurtti')).toBe(false);
  });
});

describe('ingredientsFromOcrLines', () => {
  it('starts at "Ainesosat", joins hyphenated lines and leaves the Swedish list to the parser', () => {
    const text = ingredientsFromOcrLines([
      'Valio jogurtti',
      'Ainesosat: maito, man-',
      'sikka (10 %), sokeri.',
      'Ingredienser: mjölk, jordgubb',
    ]);
    expect(text.startsWith('maito, mansikka (10 %), sokeri.')).toBe(true);
    expect(analyzeIngredients(text).findings.map((f) => f.entry.id)).toEqual(['maito']);
  });
});

describe('low-FODMAP claims', () => {
  const bread = 'vehnäjauho, vesi, kaurahiutale, pellavansiemen, rypsiöljy, durumvehnä, hiiva, ohramallasuute, suola, merileväjauhe';

  it('trusts a low-FODMAP product line over the ingredient list', () => {
    expect(analyzeIngredients(bread).verdict).toBe('red');
    const r = analyzeIngredients(bread, { productName: 'Fazer Vatsaystävällinen Pehmeä vehnä-kaura-pellava leipä' });
    expect(r.certifiedLowFodmap).toBe(true);
    expect(r.verdict).toBe('green');
    expect(r.unrecognized).toEqual([]);
    expect(analyzeIngredients(bread, { productName: 'Leipä en:low-fodmap' }).verdict).toBe('green');
  });
});
