import AsyncStorage from '@react-native-async-storage/async-storage';

import { Verdict } from './analysis/analyze';
import { fetchProduct, NotFoundError, Product } from './api/openFoodFacts';
import { FodmapGroup } from './data/ingredients';
import type { Supplement } from './supplements/assess';

export type Override = 'ok' | 'bad';

export interface HistoryItem {
  barcode: string;
  name: string;
  brand?: string;
  verdict: Verdict;
  scannedAt: number;
}

export interface Settings {
  tolerated: FodmapGroup[];
}

const KEYS = {
  product: (barcode: string) => `product:${barcode}`,
  history: 'history',
  settings: 'settings',
  overrides: 'overrides',
  supplements: 'supplements',
};

const HISTORY_LIMIT = 300;
/** Välimuistissa olevaa Open Food Facts -tietoa käytetään tämän ajan ennen uutta hakua. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

export type LookupResult = { product: Product; offline?: boolean } | { notFound: true };

/** Hakee tuotteen: omat merkinnät ja tuore välimuisti ensin, sitten Open Food Facts. */
export async function lookupProduct(barcode: string): Promise<LookupResult> {
  const cached = await readJson<Product | null>(KEYS.product(barcode), null);
  if (cached && (cached.source === 'manual' || Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS)) {
    return { product: cached };
  }
  try {
    const fetched = await fetchProduct(barcode);
    // Aiemmin S-kaupoista haettu luettelo on parempi kuin Open Food Factsin tyhjä.
    const product: Product =
      !fetched.ingredientsText && cached?.ingredientsText
        ? { ...cached, fetchedAt: Date.now() }
        : {
            ...fetched,
            lactoseFree: cached?.lactoseFree,
            heartGroup: cached?.heartGroup,
            nutrition: fetched.nutrition ?? cached?.nutrition,
          };
    await writeJson(KEYS.product(barcode), product);
    return { product };
  } catch (err) {
    if (err instanceof NotFoundError) return cached ? { product: cached } : { notFound: true };
    if (cached) return { product: cached, offline: true };
    throw err;
  }
}

export async function getCachedProduct(barcode: string): Promise<Product | null> {
  return readJson<Product | null>(KEYS.product(barcode), null);
}

export async function saveProduct(product: Product): Promise<void> {
  await writeJson(KEYS.product(product.barcode), product);
}

/** Tallentaa käyttäjän kirjoittaman tai kuvaaman ainesosaluettelon. Aiemmat tiedot (kuva, merkki) säilyvät. */
export async function saveManualProduct(barcode: string, name: string, ingredientsText: string): Promise<Product> {
  const previous = await getCachedProduct(barcode);
  const product: Product = {
    ...previous,
    barcode,
    name: name.trim() || previous?.name || 'Oma tuote',
    ingredientsText,
    source: 'manual',
    fetchedAt: Date.now(),
  };
  await saveProduct(product);
  return product;
}

export async function getHistory(): Promise<HistoryItem[]> {
  return readJson<HistoryItem[]>(KEYS.history, []);
}

export async function addToHistory(item: HistoryItem): Promise<void> {
  const history = (await getHistory()).filter((h) => h.barcode !== item.barcode);
  await writeJson(KEYS.history, [item, ...history].slice(0, HISTORY_LIMIT));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.history);
}

export async function getSettings(): Promise<Settings> {
  return readJson<Settings>(KEYS.settings, { tolerated: [] });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeJson(KEYS.settings, settings);
}

export async function getOverrides(): Promise<Record<string, Override>> {
  return readJson<Record<string, Override>>(KEYS.overrides, {});
}

export async function setOverride(barcode: string, value: Override | null): Promise<void> {
  const overrides = await getOverrides();
  if (value) overrides[barcode] = value;
  else delete overrides[barcode];
  await writeJson(KEYS.overrides, overrides);
}

export async function getSupplements(): Promise<Supplement[]> {
  return readJson<Supplement[]>(KEYS.supplements, []);
}

export async function saveSupplements(supplements: Supplement[]): Promise<void> {
  await writeJson(KEYS.supplements, supplements);
}
