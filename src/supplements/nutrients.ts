// Lisäravinteiden vitamiinit ja kivennäisaineet: viitearvot, ylärajat ja etiketin lukeminen.
//
// Viitearvo (ri): EU:n pakkausmerkintöjen saannin vertailuarvo (asetus 1169/2011, liite XIII),
// D-vitamiinille Suomen ravitsemussuositus aikuisille. Yläraja (ul): EFSA:n aikuisten
// turvallisen saannin yläraja. Arvot ovat yleisiä aikuisten arvoja – eivät henkilökohtaisia.

export type NutrientId =
  | 'vitD' | 'vitA' | 'vitE' | 'vitK' | 'vitC'
  | 'b1' | 'b2' | 'b3' | 'b5' | 'b6' | 'b7' | 'b9' | 'b12'
  | 'calcium' | 'magnesium' | 'iron' | 'zinc' | 'copper' | 'selenium' | 'iodine'
  | 'manganese' | 'chromium' | 'molybdenum' | 'potassium'
  | 'omega3' | 'creatine';

export type Unit = 'µg' | 'mg' | 'g';

export interface NutrientDef {
  id: NutrientId;
  name: string;
  unit: Unit;
  ri?: number;
  ul?: number;
  /** Lisätieto ylärajasta tai annoksesta. */
  note?: string;
  /** Etiketin nimet (pienet kirjaimet). */
  label: RegExp;
  /** Kansainvälisen yksikön (IU, KY) muunnos tämän ravintoaineen yksikköön. */
  perIU?: number;
}

const B = '(^|[^a-zåäö0-9])';

export const NUTRIENTS: NutrientDef[] = [
  { id: 'vitD', name: 'D-vitamiini', unit: 'µg', ri: 10, ul: 100, perIU: 0.025, label: new RegExp(`${B}d3?-?vitamiini|vitamiini d|kolekalsiferoli|ergokalsiferoli|vitamin d|d-vitamin`) },
  { id: 'vitA', name: 'A-vitamiini', unit: 'µg', ri: 800, ul: 3000, perIU: 0.3, note: 'Yläraja koskee retinolia (ei beetakaroteenia).', label: new RegExp(`${B}a-vitamiini|vitamiini a|retinoli|vitamin a|a-vitamin`) },
  { id: 'vitE', name: 'E-vitamiini', unit: 'mg', ri: 12, ul: 300, perIU: 0.67, label: new RegExp(`${B}e-vitamiini|vitamiini e|tokoferoli|vitamin e|e-vitamin`) },
  { id: 'vitK', name: 'K-vitamiini', unit: 'µg', ri: 75, note: 'Kerro K-vitamiinista lääkärille, jos käytät verenohennuslääkettä.', label: new RegExp(`${B}k[12]?-?vitamiini|vitamiini k|menakinoni|fyllokinoni|vitamin k|k-vitamin`) },
  { id: 'vitC', name: 'C-vitamiini', unit: 'mg', ri: 80, label: new RegExp(`${B}c-vitamiini|vitamiini c|askorbiini|vitamin c|c-vitamin`) },
  { id: 'b1', name: 'Tiamiini (B1)', unit: 'mg', ri: 1.1, label: /tiamiini|thiamin|b1(?!\d)/ },
  { id: 'b2', name: 'Riboflaviini (B2)', unit: 'mg', ri: 1.4, label: /riboflaviini|riboflavin|b2(?!\d)/ },
  { id: 'b3', name: 'Niasiini (B3)', unit: 'mg', ri: 16, ul: 900, note: 'Yläraja koskee nikotiiniamidia; nikotiinihapolle se on 10 mg.', label: /niasiini|niacin|nikotiiniamidi|nicotinamide|b3(?!\d)/ },
  { id: 'b5', name: 'Pantoteenihappo (B5)', unit: 'mg', ri: 6, label: /pantoteeni|pantothen|b5(?!\d)/ },
  { id: 'b6', name: 'B6-vitamiini', unit: 'mg', ri: 1.4, ul: 12, label: /pyridoksiini|pyridoxin|b6(?!\d)/ },
  { id: 'b7', name: 'Biotiini', unit: 'µg', ri: 50, label: /biotiini|biotin|b7(?!\d)/ },
  { id: 'b9', name: 'Foolihappo', unit: 'µg', ri: 200, ul: 1000, label: /foolihappo|folaatti|folic|folate|metyylifolaatti|b9(?!\d)/ },
  { id: 'b12', name: 'B12-vitamiini', unit: 'µg', ri: 2.5, label: /b12|kobalamiini|cobalamin/ },
  { id: 'calcium', name: 'Kalsium', unit: 'mg', ri: 800, ul: 2500, note: 'Yläraja koskee koko ruokavaliota, myös maitotuotteita.', label: /kalsium(?!-?[dl]?-?(pantot|metyyl))|calcium(?! ?[dl]?-?(pantot|methyl))/ },
  { id: 'magnesium', name: 'Magnesium', unit: 'mg', ri: 375, ul: 250, note: 'Yläraja (250 mg) koskee vain lisäravinteita; ruoan magnesium ei kuulu siihen.', label: /magnesium/ },
  { id: 'iron', name: 'Rauta', unit: 'mg', ri: 14, ul: 40, note: 'EFSA:n turvallinen saanti 40 mg/vrk.', label: new RegExp(`${B}rauta|${B}raudan|${B}iron|ferro`) },
  { id: 'zinc', name: 'Sinkki', unit: 'mg', ri: 10, ul: 25, label: /sinkki|zinc/ },
  { id: 'copper', name: 'Kupari', unit: 'mg', ri: 1, ul: 5, label: /kupari|copper/ },
  { id: 'selenium', name: 'Seleeni', unit: 'µg', ri: 55, ul: 255, label: /seleeni|selenium|selen(?![a-z])/ },
  { id: 'iodine', name: 'Jodi', unit: 'µg', ri: 150, ul: 600, label: new RegExp(`${B}jodi|iodine|${B}jod(?![a-z])`) },
  { id: 'manganese', name: 'Mangaani', unit: 'mg', ri: 2, label: /mangaani|manganese|mangan(?![a-z])/ },
  { id: 'chromium', name: 'Kromi', unit: 'µg', ri: 40, label: new RegExp(`${B}kromi|chromium|${B}krom(?![a-z])`) },
  { id: 'molybdenum', name: 'Molybdeeni', unit: 'µg', ri: 50, ul: 600, label: /molybdeeni|molybdenum|molybden/ },
  { id: 'potassium', name: 'Kalium', unit: 'mg', ri: 2000, label: /kalium(?!jod)|potassium(?! iodide)/ },
  { id: 'omega3', name: 'Omega-3 (EPA + DHA)', unit: 'mg', ri: 250, ul: 5000, note: 'EFSA: enintään 5 g EPA+DHA päivässä on turvallista.', label: /epa\s*\+\s*dha|omega-?3/ },
  { id: 'creatine', name: 'Kreatiini', unit: 'g', note: 'Tavallinen annos on 3–5 g päivässä.', label: /kreatiini|creatine/ },
];

export const NUTRIENT_BY_ID = Object.fromEntries(NUTRIENTS.map((n) => [n.id, n])) as Record<NutrientId, NutrientDef>;

export type NutrientAmounts = Partial<Record<NutrientId, number>>;

// "1 000 mg", "2,5 µg", "1000 IU". Prosenttiluvut (viitearvosta) ohitetaan.
const AMOUNT = /(\d{1,3}(?:[  ]\d{3})+|\d+(?:[.,]\d+)?)\s*(µg|μg|mcg|ug|mg|g|iu|ky|ie)(?![a-zåäö])/g;
const MAX_GAP = 45;

function convert(value: number, unit: string, def: NutrientDef): number | undefined {
  const u = unit === 'μg' || unit === 'mcg' || unit === 'ug' ? 'µg' : unit;
  if (u === 'iu' || u === 'ky' || u === 'ie') return def.perIU !== undefined ? value * def.perIU : undefined;
  const toMg: Record<string, number> = { 'µg': 0.001, mg: 1, g: 1000 };
  const fromMg: Record<Unit, number> = { 'µg': 1000, mg: 1, g: 0.001 };
  if (!(u in toMg)) return undefined;
  return Math.round(value * toMg[u] * fromMg[def.unit] * 1000) / 1000;
}

function amountAfter(text: string, from: number, def: NutrientDef): number | undefined {
  const tail = text.slice(from, from + MAX_GAP + 25);
  AMOUNT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT.exec(tail))) {
    if (m.index > MAX_GAP) return undefined;
    const value = parseFloat(m[1].replace(/[  ]/g, '').replace(',', '.'));
    const converted = convert(value, m[2], def);
    if (converted !== undefined) return converted;
  }
  return undefined;
}

export interface ParsedLabel {
  amounts: NutrientAmounts;
  /** Kuinka monesta tabletista/kapselista arvot on ilmoitettu (esim. "2 tablettia sisältää"). */
  doseUnits?: number;
}

/** Lukee lisäravinteen etiketin vitamiini- ja kivennäisainetaulukon. */
export function parseSupplementText(raw: string): ParsedLabel {
  const text = raw.toLowerCase().replace(/[ \t\u00a0]+/g, ' ');
  const amounts: NutrientAmounts = {};

  for (const def of NUTRIENTS) {
    // Ensin taulukkorivit, joissa nimi aloittaa rivin tai luettelon kohdan ("magnesium 125 mg");
    // vasta sitten vapaa teksti ("magnesiumvalmiste, josta saat 350 mg" on mainosteksti).
    const patterns = [new RegExp(`(?:^|\\n|[,;:|•(])\\s*(?:${def.label.source})`, 'g'), new RegExp(def.label.source, 'g')];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        // Ainesosaluettelossa nimi esiintyy ilman määrää ("magnesiumsitraatti, ...") – kokeillaan seuraavaa.
        const value = amountAfter(text, m.index + m[0].length, def);
        if (value !== undefined) {
          amounts[def.id] = value;
          break;
        }
      }
      if (amounts[def.id] !== undefined) break;
    }
  }

  // EPA ja DHA voi olla eritelty erikseen.
  if (amounts.omega3 === undefined) {
    const epa = /(^|[^a-z])epa([^a-z]|$)/.exec(text);
    const dha = /(^|[^a-z])dha([^a-z]|$)/.exec(text);
    const def = NUTRIENT_BY_ID.omega3;
    const e = epa ? amountAfter(text, epa.index + epa[0].length, def) : undefined;
    const d = dha ? amountAfter(text, dha.index + dha[0].length, def) : undefined;
    if (e !== undefined || d !== undefined) amounts.omega3 = (e ?? 0) + (d ?? 0);
  }

  const dose = text.match(/(päivä(?:annos|ittäis(?:annos)?)|annos|vuorokausiannos|daily dose|per)\s*\(?\s*(\d+)\s*(tabletti|tablettia|kapseli|kapselia|pastilli|pastillia|purutabletti|purutablettia|annospussi|mittalusikallinen|tippa|tippaa|tabs?|caps|softgels?|gummies|kumi)/);
  return { amounts, doseUnits: dose ? parseInt(dose[2], 10) : undefined };
}

export function formatAmount(value: number, unit: Unit): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  return `${String(rounded).replace('.', ',')} ${unit}`;
}

// EU:ssa lisäravinteen pakkauksessa on aina sana "ravintolisä" (sv. kosttillskott).
const SUPPLEMENT_WORDS = /ravintolisä|lisäravinne|food supplement|dietary supplement|kosttillskott|vitamiini|vitamin|kivennäis|multivit|tabletti|kapseli|kreatiini|omega/;

/**
 * Onko jaettu teksti lisäravinteen etiketti eikä ruoan? Ruoan ravintoarvotaulukossa voi
 * olla kalsiumia tai D-vitamiinia (maito), joten pelkkä ravintoaine ei riitä.
 */
export function isSupplementLabel(text: string, label: ParsedLabel = parseSupplementText(text)): boolean {
  const found = Object.keys(label.amounts).length;
  if (found === 0) return false;
  const lower = text.toLowerCase();
  const looksLikeFood = /hiilihydraat|carbohydrate|kolhydrat/.test(lower) && !/ravintolisä|food supplement|kosttillskott/.test(lower);
  return !looksLikeFood && (SUPPLEMENT_WORDS.test(lower) || found >= 3);
}
