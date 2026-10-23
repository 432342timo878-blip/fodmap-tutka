// Kaupat, joihin saa yhteyden tavallisella pyynnöllä: S-kaupat (kattaa myös Sokoksen) ja Tokmanni.
// Haetaan yhtä aikaa; S-kaupat on ensisijainen, koska sen valikoima on laajin.
import { fetchSKaupat } from './groceryApis';
import type { StoreProduct } from './stores';
import { fetchTokmanni } from './tokmanni';

const SOURCES: [string, (ean: string) => Promise<StoreProduct | null>][] = [
  ['S-kaupat', fetchSKaupat],
  ['Tokmanni', fetchTokmanni],
];

export interface DirectResult {
  product?: StoreProduct;
  /** Miksi muista ei löytynyt, esim. "S-kaupat: ei valikoimissa". */
  reasons: string[];
}

export async function directLookup(ean: string, accept: (p: StoreProduct) => boolean): Promise<DirectResult> {
  const results = await Promise.all(SOURCES.map(([, fetcher]) => fetcher(ean).then((p) => ({ p }), (e: unknown) => ({ error: String(e) }))));
  const reasons: string[] = [];
  for (let i = 0; i < SOURCES.length; i++) {
    const r = results[i];
    if ('p' in r && r.p && accept(r.p)) return { product: r.p, reasons };
    reasons.push(`${SOURCES[i][0]}: ${'error' in r ? 'yhteysvirhe' : r.p ? 'ei tarvittavia tietoja' : 'ei valikoimissa'}`);
  }
  return { reasons };
}

/** Lyhyt aikaraja täydentäville hauille (esim. ravintosisältö Open Food Factsin tuotteelle). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}
