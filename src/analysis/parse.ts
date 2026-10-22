// Ainesosaluettelon jäsentäminen.
//
// "Vesi, vehnäjauho 45 %, mausteet (sipuli, valkosipuli), suola."
// → [{ text: 'vesi', index: 0 }, { text: 'vehnäjauho', index: 1, percent: 45 },
//    { text: 'mausteet', index: 2, children: [{ text: 'sipuli' }, ...] }, ...]

export interface Segment {
  text: string;
  /** Sijainti päätason luettelossa (0 = suurin määrä). Ala-ainesosat perivät vanhemman sijainnin. */
  index: number;
  percent?: number;
  children: Segment[];
}

const OPEN = '([{';
const CLOSE = ')]}';

// Lauseet, jotka eivät kuvaa tuotteen ainesosia (ristikontaminaatiovaroitukset,
// ravintosisältö yms.). Poistetaan ennen jäsentämistä.
const NOISE_PATTERNS: RegExp[] = [
  /(voi|saattaa) sisältää[^.]*(\.|$)/g,
  /valmistettu[^.]*(käsitellään|jossa)[^.]*(\.|$)/g,
  /may contain[^.]*(\.|$)/g,
  /kan innehålla[^.]*(\.|$)/g,
  /kann spuren[^.]*(\.|$)/g,
];

const CUT_MARKERS = [
  'ravintosisältö', 'ravintoarvo', 'säilytys', 'säilytä ', 'valmistusmaa', 'alkuperämaa', 'valmistaja:', 'pakkaaja:',
  'käyttöohje', 'allergeenit:', 'ingredienser', 'ingredients:', 'nutrition',
];

export function normalize(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/[_*•·]/g, ' ');
  s = s.replace(/[–—]/g, '-');
  // "E 420" / "E-420" → "e420"
  s = s.replace(/\be[\s-]?(\d{3,4}[a-z]?)\b/g, 'e$1');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function cleanIngredientText(text: string): string {
  let s = normalize(text);
  s = s.replace(/^(ainesosat|ainekset|ingredients|ingredienser)\s*:\s*/, '');
  for (const marker of CUT_MARKERS) {
    const at = s.indexOf(marker);
    if (at > 0) s = s.slice(0, at);
  }
  for (const re of NOISE_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const PERCENT_RE = /(\d+(?:[.,]\d+)?)\s*%/;

function extractPercent(text: string): { text: string; percent?: number } {
  const m = text.match(PERCENT_RE);
  if (!m) return { text };
  const percent = parseFloat(m[1].replace(',', '.'));
  return { text: text.replace(PERCENT_RE, ' ').replace(/\s+/g, ' ').trim(), percent };
}

/** Pilkkoo tekstin päätason osiin; sulkujen sisältö säilyy osana. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);

    const isDecimal = (ch === ',' || ch === '.') && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '');
    if (depth === 0 && !isDecimal && (ch === ',' || ch === ';' || ch === ':' || ch === '.')) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts
    .flatMap((p) => p.split(/ (?:ja|sekä|and|och) (?![^(]*\))/))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Erottaa "mausteet (sipuli, valkosipuli)" → "mausteet" + ["sipuli, valkosipuli"]. */
function splitParens(text: string): { head: string; inner: string[] } {
  let head = '';
  const inner: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (OPEN.includes(ch)) {
      if (depth > 0) buf += ch;
      depth++;
    } else if (CLOSE.includes(ch)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        inner.push(buf);
        buf = '';
      } else buf += ch;
    } else if (depth > 0) buf += ch;
    else head += ch;
  }
  if (buf) inner.push(buf);
  return { head: head.replace(/\s+/g, ' ').trim(), inner };
}

function parseList(text: string, parentIndex: number | null): Segment[] {
  const segments: Segment[] = [];
  splitTopLevel(text).forEach((raw) => {
    const { head, inner } = splitParens(raw);
    const index = parentIndex ?? segments.length;
    const { text: headText, percent: headPercent } = extractPercent(head);
    const segment: Segment = { text: headText, index, children: [] };
    if (headPercent !== undefined) segment.percent = headPercent;

    for (const part of inner) {
      const children = parseList(part, index);
      for (const child of children) {
        // "(12 %)" on vanhemman prosenttiosuus, ei ainesosa.
        if (child.text === '' && child.percent !== undefined) {
          if (segment.percent === undefined) segment.percent = child.percent;
        } else if (child.text !== '' || child.children.length > 0) {
          segment.children.push(child);
        }
      }
    }
    if (segment.text === '' && segment.children.length === 0 && segment.percent === undefined) return;
    segments.push(segment);
  });
  return segments;
}

export function parseIngredients(text: string): Segment[] {
  return parseList(cleanIngredientText(text), null);
}
