// Open Food Facts -tuotehaku viivakoodilla. Avoin tietokanta, ei API-avainta.
// https://openfoodfacts.github.io/openfoodfacts-server/api/

export interface Product {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  ingredientsText?: string;
  /** Mistä ainesosaluettelo on: Open Food Facts vai käyttäjän itse kirjoittama. */
  source: 'off' | 'manual';
  fetchedAt: number;
}

const FIELDS = [
  'product_name_fi',
  'product_name',
  'generic_name_fi',
  'brands',
  'image_front_small_url',
  'ingredients_text_fi',
  'ingredients_text_sv',
  'ingredients_text_en',
  'ingredients_text',
].join(',');

export class NotFoundError extends Error {}

export async function fetchProduct(barcode: string): Promise<Product> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': 'FODMAP-tutka/1.0 (henkilokohtainen kaytto)' },
  });
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
    source: 'off',
    fetchedAt: Date.now(),
  };
}
