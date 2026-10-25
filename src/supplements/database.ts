// Sovellukseen rakennettu lisäravinnetietokanta (scripts/fetch-supplements.mjs):
// terveyskauppojen, apteekkien ja urheiluravinnekauppojen tuotteet viivakoodeineen, etiketin
// määrärivit ja ainesosat. Uudempi versio voidaan ladata verkosta (dbUpdate.ts) ilman uutta APK:ta.
import bundled from '../data/supplements-db.json';
import { parseSupplementText, ParsedLabel } from './nutrients';

export interface DbProduct {
  eans: string[];
  name: string;
  brand?: string;
  shop: string;
  /** Vitamiini- ja kivennäisainetaulukon rivit; tyhjä, jos kaupalla oli vain ainesosat. */
  labelText: string;
  ingredients?: string;
}

export interface SupplementDb {
  updated: string | null;
  products: DbProduct[];
}

export interface DbMatch {
  barcode?: string;
  name: string;
  brand?: string;
  shop: string;
  label: ParsedLabel;
  ingredients?: string;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9åäöü+]+/).filter(Boolean);

let current: SupplementDb = bundled as SupplementDb;
let byEan = new Map<string, DbProduct>();
let searchIndex: { p: DbProduct; words: string[] }[] = [];

function index(db: SupplementDb) {
  byEan = new Map();
  for (const p of db.products) for (const ean of p.eans) byEan.set(ean, p);
  searchIndex = db.products.map((p) => ({ p, words: words(`${p.brand ?? ''} ${p.name}`) }));
}
index(current);

/** Onko tiedosto kelvollinen tietokanta (ladattu tai tallennettu)? */
export function isSupplementDb(value: unknown): value is SupplementDb {
  const db = value as SupplementDb;
  return !!db && Array.isArray(db.products) && db.products.every((p) => Array.isArray(p?.eans) && typeof p.name === 'string');
}

/** Ottaa käyttöön uudemman tietokannan. Vanhempaa tai samaa ei vaihdeta (päiväys muotoa 2026-10-25). */
export function adoptDatabaseIfNewer(db: SupplementDb): boolean {
  if (!db.updated || (current.updated && db.updated <= current.updated) || db.products.length === 0) return false;
  current = db;
  index(db);
  return true;
}

export const supplementDbInfo = () => ({ updated: current.updated, size: current.products.length });

const toMatch = (p: DbProduct): DbMatch => ({
  barcode: p.eans[0],
  name: p.name,
  brand: p.brand,
  shop: p.shop,
  label: parseSupplementText(p.labelText ?? ''),
  ingredients: p.ingredients,
});

export function findSupplement(barcode: string): DbMatch | undefined {
  // EAN-13 voi olla luettu UPC-A:na (12 numeroa) tai päinvastoin.
  const p = byEan.get(barcode) ?? byEan.get(`0${barcode}`) ?? byEan.get(barcode.replace(/^0/, ''));
  return p && { ...toMatch(p), barcode };
}

/** Nimihaku: kaikkien hakusanojen on löydyttävä nimen sanojen alusta ("puhdas magn" → "Puhdas+ Magnesium"). */
export function searchSupplements(query: string, limit = 20): DbMatch[] {
  const q = words(query);
  if (q.length === 0) return [];
  return searchIndex
    .filter(({ words: w }) => q.every((t) => w.some((x) => x.startsWith(t))))
    .slice(0, limit)
    .map(({ p }) => toMatch(p));
}
