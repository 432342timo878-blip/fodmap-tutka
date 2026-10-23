import { FodmapGroup, GENERIC_E_CODE, INGREDIENTS, IngredientEntry } from '../data/ingredients';
import { normalize, parseIngredients, Segment } from './parse';

export type Severity = 'ok' | 'caution' | 'bad';
export type Verdict = 'green' | 'yellow' | 'red' | 'unknown';

export interface Finding {
  entry: IngredientEntry;
  severity: Severity;
  reason: string;
  /** Ainesosa sellaisena kuin se luki luettelossa. */
  matchedText: string;
  index: number;
  percent?: number;
  /** Käyttäjä on merkinnyt ryhmän sietämäkseen. */
  tolerated?: boolean;
}

export interface Analysis {
  verdict: Verdict;
  /** Huomioitavat löydökset, vakavin ensin. */
  findings: Finding[];
  /** Tunnistetut vähä-FODMAP-ainesosat. */
  safe: Finding[];
  unrecognized: string[];
  ingredientCount: number;
  lactoseFree: boolean;
  /** Valmistaja tai sertifikaatti ilmoittaa tuotteen vähä-FODMAP:ksi. */
  certifiedLowFodmap: boolean;
}

export interface AnalysisOptions {
  /** FODMAP-ryhmät, joita käyttäjä sietää. */
  tolerated?: FodmapGroup[];
  /** Tuotteen nimi ja merkinnät: kertovat esim. laktoosittomuudesta ja tuotetyypistä. */
  productName?: string;
}

/** Päätason sijainti, jota pienemmät lasketaan tuotteen pääainesosiksi. */
const MAIN_INGREDIENT_POSITIONS = 3;
/** Prosenttiosuus, jota pienempi runsas-FODMAP-ainesosa katsotaan pieneksi määräksi. */
const SMALL_AMOUNT_PERCENT = 5;

type Mode = 'sub' | 'start' | 'whole';
interface CompiledPattern {
  entry: IngredientEntry;
  text: string;
  mode: Mode;
}

const COMPILED: CompiledPattern[] = INGREDIENTS.flatMap((entry) =>
  entry.patterns.map((p): CompiledPattern => {
    if (p.startsWith('=')) return { entry, text: p.slice(1), mode: 'whole' };
    if (p.startsWith('^')) return { entry, text: p.slice(1), mode: 'start' };
    return { entry, text: p, mode: 'sub' };
  }),
);

const LETTER = /[a-z0-9åäöéèüæø]/;
const isLetter = (ch: string | undefined) => ch !== undefined && LETTER.test(ch);

interface Match {
  entry: IngredientEntry;
  start: number;
  end: number;
}

export function matchText(text: string): IngredientEntry[] {
  const candidates: Match[] = [];
  for (const p of COMPILED) {
    let from = 0;
    while (true) {
      const at = text.indexOf(p.text, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + p.text.length;
      if (p.mode !== 'sub' && isLetter(text[at - 1])) continue;
      if (p.mode === 'whole' && isLetter(text[end])) continue;
      candidates.push({ entry: p.entry, start: at, end });
    }
  }
  // Pisin osuma voittaa: "vehnätärkkelys" ohittaa "vehnä".
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: Match[] = [];
  for (const c of candidates) {
    if (taken.some((t) => c.start < t.end && t.start < c.end)) continue;
    taken.push(c);
  }
  taken.sort((a, b) => a.start - b.start);

  let entries = unique(taken.map((t) => t.entry));

  // Aromit ovat pieniä määriä: "mansikka-aromi" ei ole mansikkaa. Vain voimakkaat
  // ainesosat (esim. sipuliaromi) jätetään voimaan.
  if (entries.some((en) => en.id === 'aromi')) {
    entries = entries.filter((en) => en.level === 'low' || en.potent);
  }
  // "sikurijuurikuitu": tunnistettu ongelma-aine tekee yleisnimestä ("kuitu") tarpeettoman.
  if (entries.some((en) => en.level === 'high' || en.level === 'moderate')) {
    entries = entries.filter((en) => en.level !== 'unknown');
  }
  // Johdannaiset kuten glukoosisiirappi tai tärkkelys eivät sisällä raaka-aineensa FODMAPeja.
  if (entries.some((en) => en.absorbsChildren)) {
    entries = entries.filter((en) => en.level === 'low' || en.potent);
  }
  return entries;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, caution: 1, bad: 2 };

function formatPercent(p: number): string {
  return `${String(p).replace('.', ',')} %`;
}

function judge(entry: IngredientEntry, index: number, percent: number | undefined): { severity: Severity; reason: string } {
  switch (entry.level) {
    case 'low':
      return { severity: 'ok', reason: 'Vähä-FODMAP.' };
    case 'unknown':
      return { severity: 'caution', reason: 'Koostumus ei selviä luettelosta.' };
    case 'moderate':
      return { severity: 'caution', reason: 'Kohtalainen FODMAP – annoskoko ratkaisee.' };
    case 'high': {
      if (entry.potent) return { severity: 'bad', reason: 'Haitallinen jo pieninä määrinä.' };
      if (percent !== undefined) {
        return percent >= SMALL_AMOUNT_PERCENT
          ? { severity: 'bad', reason: `Osuus ${formatPercent(percent)} – runsas määrä.` }
          : { severity: 'caution', reason: `Osuus vain ${formatPercent(percent)} – pieni määrä voi olla siedetty.` };
      }
      return index < MAIN_INGREDIENT_POSITIONS
        ? { severity: 'bad', reason: 'Tuotteen pääainesosia.' }
        : { severity: 'caution', reason: 'Myöhemmin luettelossa – pieni määrä voi olla siedetty.' };
    }
  }
}

// Laktoosittomuus voi lukea nimessä, merkinnöissä (OFF: en:lactose-free) tai tuotesarjassa (Valio Eila, PROfeel).
// Ainesosaluettelo ei kerro valmistustavasta: entsyymit ja pitkä hapatus hajottavat vehnän
// fruktaaneja (esim. Fazerin Vatsaystävälliset leivät). Merkintä ohittaa luettelon perusteella tehdyn arvion.
const LOW_FODMAP_CLAIM = /vatsaystävällinen|vatsaystävälli|low[- ]?fodmap|fodmap[- ]?friendly|fodmap[- ]?ystävällinen|vähä[- ]?fodmap|monash/;
const LACTOSE_FREE = /laktoositon|laktoosittom|laktaasi|vähälaktoosi|lactose[- ]free|no-lactose|laktosfri|lactofree|zero lactose|(^|[^a-zåäö])(eila|profeel)([^a-zåäö]|$)/;
/** Juoksete päätason luettelossa tarkoittaa, että tuote on juustoa tai rahkaa. */
const RENNET_MARKERS = ['juoksete', 'juoksute', 'juoksutin', 'rennet', 'löpe'];
const MILK_ENTRY_IDS = new Set(['maito', 'maitojauhe']);
/** Kasvijuomien luettelo on usein vain "vesi, kaura" – tuotetyyppi selviää nimestä. */
const PRODUCT_TYPE_IDS = new Set(['kaurajuoma', 'riisijuoma', 'soijajuoma']);

/** "heraproteiini (maidosta)" – sulkeissa oleva alkuperämerkintä, ei erillinen ainesosa. */
const isOriginNote = (text: string) => /^[a-zåäö]+(sta|stä)$/.test(text);

export function analyzeIngredients(ingredientText: string | undefined | null, options: AnalysisOptions = {}): Analysis {
  const tolerated = new Set(options.tolerated ?? []);
  const segments = ingredientText ? parseIngredients(ingredientText) : [];

  const haystack = normalize(`${options.productName ?? ''} ${ingredientText ?? ''}`);
  const lactoseFree = LACTOSE_FREE.test(haystack);
  const certifiedLowFodmap = LOW_FODMAP_CLAIM.test(normalize(options.productName ?? ''));
  const isCheeseOrQuark = segments.some((seg) => RENNET_MARKERS.some((m) => seg.text.includes(m)));
  const isHardCheese =
    isCheeseOrQuark && matchText(normalize(options.productName ?? '')).some((en) => en.id === 'juusto');

  const all: Finding[] = [];
  const unrecognized: string[] = [];

  const visit = (segment: Segment, inheritedPercent: number | undefined) => {
    const percent = segment.percent ?? inheritedPercent;
    let entries = segment.text ? matchText(segment.text) : [];
    // "mausteseos (sipuli, paprika)": sisältö on eritelty, joten yleisnimi ei ole epävarma.
    if (segment.children.length > 0) entries = entries.filter((en) => en.level !== 'unknown');

    const looksLikeIngredient = segment.text.length > 3 && /[a-zåäö]/.test(segment.text) && !GENERIC_E_CODE.test(segment.text);
    if (entries.length === 0 && looksLikeIngredient && segment.children.length === 0) {
      unrecognized.push(segment.text);
    }

    for (const entry of entries) {
      let { severity, reason } = judge(entry, segment.index, percent);
      let isTolerated = false;
      if (severity !== 'ok' && certifiedLowFodmap) {
        severity = 'ok';
        reason = 'Tuote on merkitty vähä-FODMAP-tuotteeksi – valmistustapa vähentää FODMAPeja.';
      } else if (severity !== 'ok' && lactoseFree && entry.groups.length > 0 && entry.groups.every((g) => g === 'laktoosi')) {
        severity = 'ok';
        reason = 'Tuote on laktoositon.';
      } else if (severity !== 'ok' && isCheeseOrQuark && MILK_ENTRY_IDS.has(entry.id)) {
        severity = isHardCheese ? 'ok' : 'caution';
        reason = isHardCheese
          ? 'Kypsytetty juusto – laktoosi on lähes kokonaan hajonnut.'
          : 'Juustoksi tai rahkaksi juoksutettua maitoa – laktoosia on vähemmän, annoskoko ratkaisee.';
      } else if (severity !== 'ok' && entry.groups.length > 0 && entry.groups.every((g) => tolerated.has(g))) {
        severity = 'ok';
        reason = 'Merkitty sietämäksesi asetuksissa.';
        isTolerated = true;
      }
      all.push({
        entry,
        severity,
        reason,
        matchedText: segment.text,
        index: segment.index,
        ...(percent !== undefined ? { percent } : {}),
        ...(isTolerated ? { tolerated: true } : {}),
      });
    }

    if (!entries.some((en) => en.absorbsChildren)) {
      for (const child of segment.children) {
        if (entries.length > 0 && child.children.length === 0 && isOriginNote(child.text)) continue;
        visit(child, percent);
      }
    }
  };
  segments.forEach((s) => visit(s, undefined));

  if (segments.length > 0) {
    for (const entry of matchText(normalize(options.productName ?? ''))) {
      if (!PRODUCT_TYPE_IDS.has(entry.id) || all.some((f) => f.entry.id === entry.id)) continue;
      const isTolerated = entry.groups.every((g) => tolerated.has(g));
      all.push({
        entry,
        severity: isTolerated ? 'ok' : 'caution',
        reason: isTolerated ? 'Merkitty sietämäksesi asetuksissa.' : 'Tuotetyyppi – annoskoko ratkaisee.',
        matchedText: options.productName ?? '',
        index: 0,
        ...(isTolerated ? { tolerated: true } : {}),
      });
    }
  }

  // Sama ainesosa voi esiintyä monesti – pidetään vakavin.
  const byEntry = new Map<string, Finding>();
  for (const f of all) {
    const prev = byEntry.get(f.entry.id);
    if (!prev || SEVERITY_RANK[f.severity] > SEVERITY_RANK[prev.severity]) byEntry.set(f.entry.id, f);
  }
  const deduped = [...byEntry.values()];
  const findings = deduped
    // Myös laktoosittomuuden tai asetusten vuoksi hyväksytyt näytetään, jotta syy näkyy.
    .filter((f) => f.severity !== 'ok' || f.entry.level !== 'low')
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.index - b.index);
  const safe = deduped.filter((f) => !findings.includes(f));

  let verdict: Verdict;
  if (segments.length === 0) verdict = 'unknown';
  else if (findings.some((f) => f.severity === 'bad')) verdict = 'red';
  else if (findings.some((f) => f.severity === 'caution')) verdict = 'yellow';
  else verdict = 'green';

  return {
    verdict,
    findings,
    safe,
    unrecognized: unique(unrecognized),
    ingredientCount: segments.length,
    lactoseFree,
    certifiedLowFodmap,
  };
}
