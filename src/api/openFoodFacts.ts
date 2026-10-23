// Open Food Facts -tuotehaku viivakoodilla. Avoin tietokanta, ei API-avainta.
// https://openfoodfacts.github.io/openfoodfacts-server/api/
import { Nutrition, nutritionFromOff } from '../analysis/nutrition';
import type { StoreId } from './stores';

export interface Product {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  ingredientsText?: string;
  /** Open Food Facts -merkinnät, esim. "en:lactose-free". */
  labels?: string[];
  /** Open Food Facts -luokat yleisestä tarkkaan, esim. ["en:breads", "en:rye-breads"]. */
  categories?: string[];
  /** Ravintosisältö per 100 g. */
  nutrition?: Nutrition;
  /** Käyttäjän valitsema Sydänmerkki-tuoteryhmä (HEART_GROUPS id). */
  heartGroup?: string;
  /** Kaupan tuotesivulla näkyi Sydänmerkki. */
  heartSymbol?: boolean;
  /** Käyttäjä on vahvistanut pakkauksesta, että tuote on laktoositon. */
  lactoseFree?: boolean;
  /** Mistä ainesosaluettelo on: Open Food Facts, verkkokauppa vai käyttäjän kirjoittama/kuvaama. */
  source: 'off' | StoreId | 'manual';
  fetchedAt: number;
}

const FIELDS = [
  'product_name_fi',
  'product_name',
  'generic_name_fi',
  'brands',
  'image_front_small_url',
  'labels_tags',
  'categories_tags',
  'nutriments',
  'ingredients_text_fi',
  'ingredients_text_sv',
  'ingredients_text_en',
  'ingredients_text',
].join(',');

export class NotFoundError extends Error {}

/** Kaupassa yhteys voi olla heikko – ei jäädä odottamaan loputtomiin. */
const TIMEOUT_MS = 15000;

export async function fetchProduct(barcode: string): Promise<Product> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': 'FODMAP-tutka/1.0 (henkilokohtainen kaytto)' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new NotFoundError(barcode);
  if (!res.ok) throw new Error(`Open Food Facts vastasi ${res.status}`);
  const json = await res.json();
  if (json.status !== 1 || !json.product) throw new NotFoundError(barcode);

  const p = json.product;
  const pick = (...values: (string | undefined)[]) => values.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim();
  return {
    barcode,
    name: pick(p.product_name_fi, p.product_name, p.generic_name_fi) ?? 'Nimetön tuote',
    brand: pick(p.brands?.split(',')[0]),
    imageUrl: pick(p.image_front_small_url),
    // Suomenkielinen luettelo ensin; ruotsi ja englanti varalla.
    ingredientsText: pick(p.ingredients_text_fi, p.ingredients_text_sv, p.ingredients_text_en, p.ingredients_text),
    labels: Array.isArray(p.labels_tags) ? p.labels_tags : undefined,
    categories: Array.isArray(p.categories_tags) ? p.categories_tags : undefined,
    nutrition: nutritionFromOff(p.nutriments),
    source: 'off',
    fetchedAt: Date.now(),
  };
}
