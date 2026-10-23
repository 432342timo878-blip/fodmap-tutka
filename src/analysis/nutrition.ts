// Ravintosisältö (per 100 g) ja sen lukeminen tekstistä.
//
// Teksti voi tulla verkkokaupan sivulta tai kuvatusta ravintoarvotaulukosta, esim.
//   "Energia 1557 kJ / 329 kcal Rasva 11 g josta tyydyttyneitä rasvahappoja 4,6 g
//    Hiilihydraatti 30 g josta sokereita 3,7 g Ravintokuitu 12 g Proteiini 32 g Suola 0,73 g"

export interface Nutrition {
  energyKj?: number;
  fat?: number;
  saturatedFat?: number;
  sugars?: number;
  fiber?: number;
  salt?: number;
}

export type NutrientKey = keyof Nutrition;

// Otsikon ja luvun välissä saa olla enintään tämän verran muuta tekstiä (esim. "josta").
const MAX_GAP = 40;
const NUMBER = /(<|alle\s*)?(\d+(?:[.,]\d+)?)\s*(kj|kcal|mg|g)?/;

const LABELS: Record<Exclude<NutrientKey, 'energyKj'>, RegExp> = {
  saturatedFat: /tyydyttyn|saturate|mättat/,
  // "rasva" mutta ei "rasvahappoja", "rasvaton" eikä "tyydyttynyt rasva".
  fat: /(^|[^a-zåäö])(rasva|rasvaa|fat|fett)([^a-zåäö]|$)/,
  sugars: /sokere|sokeri(?!ton)|sugars|sockerarter/,
  fiber: /kuitu|fibre|fiber|kostfiber/,
  salt: /(^|[^a-zåäö])(suola|suolaa|salt)([^a-zåäö]|$)/,
};

function numberAfter(text: string, from: number, unit?: 'kj'): number | undefined {
  const tail = text.slice(from, from + MAX_GAP + 20);
  const re = new RegExp(NUMBER.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail))) {
    if (m.index > MAX_GAP) return undefined;
    const value = parseFloat(m[2].replace(',', '.'));
    const found = m[3];
    if (unit === 'kj') {
      if (found === 'kj') return value;
      continue;
    }
    if (found === 'kj' || found === 'kcal') continue;
    return found === 'mg' ? value / 1000 : value;
  }
  return undefined;
}

export function parseNutritionText(raw: string): Nutrition {
  const text = raw.toLowerCase().replace(/\s+/g, ' ');
  const result: Nutrition = {};

  const energy = text.search(/energia|energy|energi/);
  if (energy >= 0) {
    const kj = numberAfter(text, energy, 'kj');
    if (kj !== undefined) result.energyKj = kj;
  }

  const satAt = text.search(LABELS.saturatedFat);
  if (satAt >= 0) result.saturatedFat = numberAfter(text, satAt + 5);

  for (const key of ['fat', 'sugars', 'fiber', 'salt'] as const) {
    const m = LABELS[key].exec(text);
    if (!m) continue;
    // Rasvaotsikon on oltava ennen "tyydyttyneitä", muuten se on osa tyydyttyneen rasvan riviä.
    if (key === 'fat' && satAt >= 0 && m.index > satAt) continue;
    const value = numberAfter(text, m.index + m[0].length);
    if (value !== undefined) result[key] = value;
  }

  if (result.salt === undefined) {
    const sodium = text.search(/natrium|sodium/);
    if (sodium >= 0) {
      const na = numberAfter(text, sodium + 6);
      if (na !== undefined) result.salt = Math.round(na * 2.5 * 100) / 100;
    }
  }
  if (result.saturatedFat === undefined) delete result.saturatedFat;
  return result;
}

/** Open Food Facts -kentät (nutriments) → Nutrition. */
export function nutritionFromOff(nutriments: Record<string, unknown> | undefined): Nutrition | undefined {
  if (!nutriments) return undefined;
  const pick = (key: string) => {
    const v = nutriments[`${key}_100g`];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const n: Nutrition = {
    energyKj: pick('energy-kj') ?? pick('energy'),
    fat: pick('fat'),
    saturatedFat: pick('saturated-fat'),
    sugars: pick('sugars'),
    fiber: pick('fiber'),
    salt: pick('salt'),
  };
  for (const k of Object.keys(n) as NutrientKey[]) if (n[k] === undefined) delete n[k];
  return Object.keys(n).length > 0 ? n : undefined;
}

export function hasNutrition(n: Nutrition | undefined): n is Nutrition {
  return !!n && (n.fat !== undefined || n.salt !== undefined || n.sugars !== undefined);
}
