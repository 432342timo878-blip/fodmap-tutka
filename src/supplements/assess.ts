// Lisäravinnepinon yhteenveto: päiväsaanti, ylärajat, päällekkäisyydet, vatsalle hankalat
// aineet ja pakkauksen loppuminen. Kaikki säännöt ovat kiinteitä – ei tekoälyä.

import { analyzeIngredients } from '../analysis/analyze';
import { formatAmount, NUTRIENT_BY_ID, NutrientAmounts, NutrientId, NUTRIENTS } from './nutrients';

export interface Supplement {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  /** Etiketin arvot `doseUnits` kappaleesta. */
  amounts: NutrientAmounts;
  doseUnits: number;
  /** Montako kappaletta käyttäjä ottaa päivässä. */
  unitsPerDay: number;
  packSize?: number;
  /** Milloin nykyinen pakkaus aloitettiin (ms). */
  packStartedAt?: number;
  ingredientsText?: string;
}

export type Level = 'bad' | 'caution' | 'info';

export interface Warning {
  level: Level;
  text: string;
}

export interface NutrientTotal {
  id: NutrientId;
  total: number;
  /** Mistä valmisteista ravintoaine tulee. */
  sources: string[];
  status: 'over' | 'ok' | 'low' | 'none';
}

export interface StackAssessment {
  totals: NutrientTotal[];
  warnings: Warning[];
}

export const dailyAmount = (s: Supplement, id: NutrientId) => ((s.amounts[id] ?? 0) * s.unitsPerDay) / Math.max(s.doseUnits, 1);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Päiviä jäljellä nykyisessä pakkauksessa, tai undefined jos ei tiedetä. */
export function daysLeft(s: Supplement, now = Date.now()): number | undefined {
  if (!s.packSize || s.packStartedAt === undefined || s.unitsPerDay <= 0) return undefined;
  const totalDays = s.packSize / s.unitsPerDay;
  return Math.floor(totalDays - (now - s.packStartedAt) / DAY_MS);
}

const dateFormat = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric' });

export function assessStack(stack: Supplement[], now = Date.now()): StackAssessment {
  const totals: NutrientTotal[] = [];
  for (const def of NUTRIENTS) {
    const sources = stack.filter((s) => (s.amounts[def.id] ?? 0) > 0);
    if (sources.length === 0) continue;
    const total = sources.reduce((sum, s) => sum + dailyAmount(s, def.id), 0);
    let status: NutrientTotal['status'] = 'none';
    if (def.ul !== undefined && total > def.ul) status = 'over';
    else if (def.ri !== undefined) status = total >= def.ri ? 'ok' : 'low';
    totals.push({ id: def.id, total, sources: sources.map((s) => s.name), status });
  }

  const warnings: Warning[] = [];
  const total = (id: NutrientId) => totals.find((t) => t.id === id)?.total ?? 0;

  for (const t of totals) {
    const def = NUTRIENT_BY_ID[t.id];
    if (t.status === 'over') {
      warnings.push({
        level: 'bad',
        text: `${def.name}: ${formatAmount(t.total, def.unit)}/vrk ylittää turvallisen saannin ylärajan (${formatAmount(def.ul!, def.unit)}).${def.note ? ` ${def.note}` : ''}`,
      });
    } else if (def.ul !== undefined && t.total > def.ul * 0.8) {
      warnings.push({ level: 'caution', text: `${def.name}: ${formatAmount(t.total, def.unit)}/vrk on lähellä ylärajaa (${formatAmount(def.ul, def.unit)}). Ruoasta tulee lisäksi.` });
    }
    if (t.sources.length >= 2) {
      warnings.push({ level: 'info', text: `${def.name} tulee ${t.sources.length} valmisteesta: ${t.sources.join(', ')}.` });
    }
  }

  // Vatsa ja IBS
  if (total('magnesium') > 250) {
    warnings.push({ level: 'caution', text: 'Yli 250 mg magnesiumia lisäravinteista voi löysätä vatsaa (erityisesti oksidi ja sitraatti).' });
  }
  if (total('vitC') >= 1000) warnings.push({ level: 'caution', text: 'Gramman C-vitamiiniannokset voivat aiheuttaa ripulia ja vatsavaivoja.' });
  if (total('iron') > 20) warnings.push({ level: 'info', text: 'Rautavalmisteet voivat aiheuttaa ummetusta tai vatsavaivoja – ota ruoan kanssa, jos vatsa oireilee.' });
  for (const s of stack) {
    if (!s.ingredientsText) continue;
    const bad = analyzeIngredients(s.ingredientsText).findings.filter((f) => f.severity === 'bad');
    if (bad.length > 0) {
      warnings.push({ level: 'caution', text: `${s.name} sisältää: ${bad.map((f) => f.entry.name.toLowerCase()).join(', ')} – voi aiheuttaa IBS-oireita.` });
    }
  }

  // Yhteisvaikutukset
  if (total('calcium') >= 300 && total('iron') > 0) {
    warnings.push({ level: 'info', text: 'Kalsium heikentää raudan imeytymistä – ota ne eri aikaan (vähintään 2 tunnin väli).' });
  }
  if (total('zinc') >= 25 && total('copper') === 0) {
    warnings.push({ level: 'info', text: 'Suuret sinkkiannokset pitkään voivat aiheuttaa kuparin puutetta.' });
  }

  // Pakkausten loppuminen
  for (const s of stack) {
    const left = daysLeft(s, now);
    if (left === undefined) continue;
    if (left <= 0) warnings.push({ level: 'bad', text: `${s.name} on todennäköisesti loppunut.` });
    else if (left <= 7) warnings.push({ level: 'caution', text: `${s.name} loppuu n. ${dateFormat.format(new Date(now + left * DAY_MS))} (${left} pv).` });
  }

  const order: Record<Level, number> = { bad: 0, caution: 1, info: 2 };
  warnings.sort((a, b) => order[a.level] - order[b.level]);
  return { totals, warnings };
}
