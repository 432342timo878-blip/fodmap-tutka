// S-kaupat ja K-Ruoka: tuotetiedot kauppojen omista rajapinnoista.
//
// Selvitetty kotiyhteydeltä 23.10.2026 (docs/store-data-findings.md):
// - S-kaupat vastaa tavalliseen pyyntöön (GraphQL, ei kauppatunnusta). Kattaa myös Sokoksen tuotteet.
// - K-Ruoka on Cloudflaren takana: rajapintaa kutsutaan k-ruoka.fi-sivun sisältä (kRuokaLookup.tsx).
import type { StoreProduct } from './stores';

const S_KAUPAT_API = 'https://api.s-kaupat.fi/';
const S_KAUPAT_QUERY =
  'query P($ean: ID!) { product(id: $ean) { ean name brandName ingredientStatement ' +
  'productDetails { nutrients { referenceQuantity nutrients { name value recommendedIntake } } } } }';
const TIMEOUT_MS = 12000;

// "1 004 kJ" → "1004 kJ": tuhaterottimena välilyönti.
const joinThousands = (s: string) => s.replace(/(\d)[  ](?=\d{3}(?!\d))/g, '$1');

interface SNutrientGroup {
  referenceQuantity?: string | null;
  nutrients?: { name?: string | null; value?: string | null; recommendedIntake?: string | null }[] | null;
}
export interface SKaupatProductData {
  ean?: string;
  name?: string | null;
  brandName?: string | null;
  ingredientStatement?: string | null;
  productDetails?: { nutrients?: SNutrientGroup[] | null } | null;
}

/** S-kaupat-tuote → sovelluksen muoto. Ravintoryhmät ovat per 100 g tai lisäravinteilla per kappale ("1 kpl"). */
export function sKaupatToProduct(p: SKaupatProductData): Omit<StoreProduct, 'url'> & { store: 'skaupat' } {
  const groups = p.productDetails?.nutrients ?? [];
  const lines = (g: SNutrientGroup) =>
    (g.nutrients ?? []).filter((n) => n.name && n.value).map((n) => `${n.name} ${joinThousands(n.value!)}`);
  const per100 = groups.find((g) => /100/.test(g.referenceQuantity ?? ''));
  // Lisäravinteen annos: "1 kpl", "2 tablettia" → luetaan etiketin tapaan ("annos (1 kpl)").
  const supplementText = groups
    .filter((g) => g !== per100)
    .map((g) => [`annos (${g.referenceQuantity ?? '1 kpl'})`, ...lines(g)].join('\n'))
    .join('\n');
  return {
    store: 'skaupat',
    name: [p.brandName, p.name].filter(Boolean).join(' ').trim() || undefined,
    ingredients: p.ingredientStatement?.trim() || undefined,
    nutritionText: per100 ? `Ravintosisältö per 100 g\n${lines(per100).join('\n')}` : undefined,
    pageText: supplementText || undefined,
    heartSymbol: false,
  };
}

async function post(url: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Hakee tuotteen S-kaupoista viivakoodilla, tai null jos tuotetta ei ole. */
export async function fetchSKaupat(ean: string): Promise<StoreProduct | null> {
  const res = await post(
    S_KAUPAT_API,
    { query: S_KAUPAT_QUERY, variables: { ean } },
    { 'Content-Type': 'application/json', 'x-client-name': 'skaupat-web' },
  );
  if (!res.ok) throw new Error(`S-kaupat ${res.status}`);
  const json = await res.json();
  const product = json?.data?.product as SKaupatProductData | null | undefined;
  if (!product) return null;
  return { ...sKaupatToProduct(product), url: `https://www.s-kaupat.fi/tuote/-/${ean}` };
}

// --- K-Ruoka

type KNumber = number | { amount?: number | null } | null | undefined;
const num = (v: KNumber) => (typeof v === 'number' ? v : v && typeof v.amount === 'number' ? v.amount : undefined);

interface KNutritional {
  basis?: { fi?: string };
  nutrients?: Record<string, KNumber>;
  secondaryNutrients?: { name?: { fi?: string }; unit?: string; amount?: number | null }[];
}
export interface KRuokaProductData {
  localizedName?: { finnish?: string };
  brand?: { name?: string } | string;
  productAttributes?: {
    productContents?: { fi?: string };
    nutritionalContents?: KNutritional[];
    vitaminContent?: unknown;
  };
}

const K_NUTRIENT_LABELS: [string, string, string][] = [
  ['energyKj', 'Energia', 'kJ'],
  ['fat', 'Rasva', 'g'],
  ['fatSaturated', 'josta tyydyttyneitä rasvahappoja', 'g'],
  ['carbohydrates', 'Hiilihydraatit', 'g'],
  ['carbohydratesSugar', 'josta sokereita', 'g'],
  ['nutritionalFiber', 'Ravintokuitu', 'g'],
  ['protein', 'Proteiini', 'g'],
  ['salt', 'Suola', 'g'],
];

/** K-Ruoka /kr-api/v4/products/<EAN> -vastaus → sovelluksen muoto. Luvut ovat valmiiksi numeroita. */
export function kRuokaToProduct(json: { product?: KRuokaProductData } & KRuokaProductData): Omit<StoreProduct, 'url'> & { store: 'kruoka' } {
  const p = json.product ?? json;
  const attrs = p.productAttributes ?? {};
  const groups = attrs.nutritionalContents ?? [];
  const per100 = groups.find((g) => /100/.test(g.basis?.fi ?? '')) ?? groups[0];
  const mainLines = per100
    ? K_NUTRIENT_LABELS.flatMap(([key, label, unit]) => {
        const v = num(per100.nutrients?.[key]);
        return v === undefined ? [] : [`${label} ${String(v).replace('.', ',')} ${unit}`];
      })
    : [];
  const secondary = groups.flatMap((g) =>
    (g.secondaryNutrients ?? []).filter((n) => n.name?.fi && typeof n.amount === 'number').map((n) => `${n.name!.fi} ${n.amount} ${n.unit ?? ''}`.trim()),
  );
  const vitamins = typeof attrs.vitaminContent === 'string' ? attrs.vitaminContent : attrs.vitaminContent ? JSON.stringify(attrs.vitaminContent) : '';
  const basis = per100?.basis?.fi ?? '100 g';
  return {
    store: 'kruoka',
    name: p.localizedName?.finnish,
    ingredients: attrs.productContents?.fi?.trim() || undefined,
    nutritionText: mainLines.length > 0 && /100/.test(basis) ? `Ravintosisältö per ${basis}\n${mainLines.join('\n')}` : undefined,
    pageText: [/100/.test(basis) ? '' : `annos (${basis})`, ...secondary, vitamins].filter(Boolean).join('\n') || undefined,
    heartSymbol: false,
  };
}
