// Sovellukseen rakennettu lisäravinnetietokanta (scripts/fetch-supplements.mjs):
// terveyskauppojen tuotteet viivakoodeineen ja etiketin määrärivit.
import db from '../data/supplements-db.json';
import { parseSupplementText, ParsedLabel } from './nutrients';

interface DbProduct {
  eans: string[];
  name: string;
  brand?: string;
  shop: string;
  labelText: string;
  ingredients?: string;
}

const BY_EAN = new Map<string, DbProduct>();
for (const p of db.products as DbProduct[]) for (const ean of p.eans) BY_EAN.set(ean, p);

export const supplementDbUpdated: string | null = db.updated;
export const supplementDbSize = (db.products as DbProduct[]).length;

export interface DbMatch {
  name: string;
  brand?: string;
  shop: string;
  label: ParsedLabel;
  ingredients?: string;
}

export function findSupplement(barcode: string): DbMatch | undefined {
  // EAN-13 voi olla luettu UPC-A:na (12 numeroa) tai päinvastoin.
  const p = BY_EAN.get(barcode) ?? BY_EAN.get(`0${barcode}`) ?? BY_EAN.get(barcode.replace(/^0/, ''));
  if (!p) return undefined;
  return { name: p.name, brand: p.brand, shop: p.shop, label: parseSupplementText(p.labelText), ingredients: p.ingredients };
}
