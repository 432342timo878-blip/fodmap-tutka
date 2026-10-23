// Tokmanni: viivakoodihaku Klevu-hakupalvelusta ja tiedot tuotesivun HTML:stä.
//
// Toisin kuin S-kaupat ja K-Ruoka, Tokmanni ei estä tavallisia pyyntöjä, joten tiedot
// haetaan suoraan ilman piilotettua selainta. Klevu palauttaa viivakoodin kentässä `sku`.
import type { StoreProduct } from './stores';

const KLEVU =
  'https://eucs11.ksearchnet.com/cloud-search/n-search/search?ticket=klevu-15488592134928913' +
  '&paginationStartsFrom=0&sortPrice=false&ipAddress=undefined&analyticsApiKey=klevu-15488592134928913' +
  '&noOfResults=5&responseType=json&term=';
const TIMEOUT_MS = 12000;

const ENTITIES: Record<string, string> = { auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', micro: 'µ' };
export const decodeHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);

const text = (html: string) => decodeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Otsikon ("pb2 bold") jälkeiset "pb1"-kappaleet seuraavaan otsikkoon asti. */
function section(html: string, heading: RegExp): string[] {
  const m = heading.exec(html);
  if (!m) return [];
  const rest = html.slice(m.index + m[0].length);
  const end = rest.search(/class="pb2 bold"/);
  const body = end >= 0 ? rest.slice(0, end) : rest.slice(0, 5000);
  return [...body.matchAll(/<div class="pb1">([\s\S]*?)<\/div>/g)].map((x) => text(x[1])).filter(Boolean);
}

// Suomenkielinen kappale tunnistetaan yleisistä sanoista ja ä/ö-kirjaimista.
const finnishScore = (s: string) => (s.match(/\b(ja|sisältää|saattaa|jauho\w*|sokeri\w*|suola|maito\w*|öljy\w*|aromi\w*|vesi)\b|[äö]/gi) ?? []).length;
const swedishScore = (s: string) => (s.match(/\b(och|innehåller|kan|mjöl|socker|salt|mjölk|olja|vatten)\b|å/gi) ?? []).length;

export function parseTokmanniPage(html: string): Omit<StoreProduct, 'store' | 'url'> {
  const ingredientParts = section(html, /class="pb2 bold">\s*Ainesosat[^<]*<\/div>/i);
  const ingredients = ingredientParts.sort((a, b) => finnishScore(b) - swedishScore(b) - (finnishScore(a) - swedishScore(a)))[0];
  const nutritionParts = section(html, /class="pb2 bold">\s*Ravintosisältö[\s\S]*?<\/div>/i);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const start = h1 ? h1.index : 0;
  const pageText = text(html.slice(start, start + 80000).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')).slice(0, 20000);
  return {
    name: h1 ? text(h1[1]) : undefined,
    ingredients,
    nutritionText: nutritionParts.length > 0 ? `Ravintosisältö per 100 g\n${nutritionParts.join('\n')}` : undefined,
    pageText,
    heartSymbol: /sydänmerkki/i.test(pageText),
  };
}

async function get(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Hakee tuotteen Tokmannista viivakoodilla, tai null jos Tokmanni ei myy sitä. */
export async function fetchTokmanni(ean: string): Promise<StoreProduct | null> {
  const search = await (await get(KLEVU + encodeURIComponent(ean))).json();
  const hit = (search?.result ?? []).find((r: { sku?: string; url?: string }) => r.sku === ean && r.url);
  if (!hit) return null;
  const html = await (await get(hit.url)).text();
  const page = parseTokmanniPage(html);
  return { ...page, name: page.name ?? decodeHtml(hit.name ?? ''), store: 'tokmanni', url: hit.url };
}
