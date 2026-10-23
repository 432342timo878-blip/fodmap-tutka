// Kokoaa lisäravinnetietokannan suomalaisten terveyskauppojen verkkokaupoista
// (Shopify: tuotelista /products.json ja tuotesivut) tiedostoon src/data/supplements-db.json.
// Ajetaan APK-käännöksessä enintään kerran viikossa (GitHub Actionsin välimuisti).
//
// Talteen otetaan viivakoodit ja tuotesivun ne rivit, joilla on määriä (esim. "magnesium
// 125 mg (33 % päivittäisestä tarpeesta)"). Rivit tulkitaan sovelluksessa samalla koodilla
// kuin kuvatut etiketit, joten tulkinnan parannukset koskevat myös tätä tietokantaa.
import { writeFileSync } from 'node:fs';

const SHOPS = [
  { host: 'www.ruohonjuuri.fi', name: 'Ruohonjuuri' },
  { host: 'puhdasplus.fi', name: 'Puhdas+', allProducts: true },
  { host: 'www.puhdistamo.fi', name: 'Puhdistamo', allProducts: true },
  { host: 'www.apteekki360.fi', name: 'Apteekki360' },
];
const MAX_PAGES = 40;
const CONCURRENCY = 4;
const SUPPLEMENT_TYPE = /vitamin|supplement|ravintolis|lisäravin|nutrition|protein|sport|urheil|mineral|kivennäis|omega|luontais|magnesium|kalsium/i;
const NUTRIENT_AMOUNT =
  /(vitamiini|vitamin|magnesium|kalsium|sinkki|rauta|jodi|seleeni|kromi|kalium|omega|epa|dha|kreatiini|foolihappo|folaatti|biotiini|b12|b6|tiamiini|riboflaviini|niasiini)[^\n]{0,45}\d[\d,.]*\s*(mg|µg|μg|mcg|g|iu|ky)/i;
const AMOUNT_LINE = /\d[\d,.]*\s*(mg|µg|μg|mcg|ug|g|iu|ky)(?![a-zåäö])|annos|kapseli|tabletti|pastilli|ravintosisältö|sisältää|ravintolisä/i;

const ENTITIES = { auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', uuml: 'ü', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', micro: 'µ', deg: '°', ndash: '–', mdash: '—' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);

function htmlLines(html) {
  const text = decode(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': 'FODMAP-tutka (henkilokohtainen kaytto)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

/** Yksi kauppa saa olla poissa käytöstä: palautetaan oletus. */
async function getOr(url, fallback) {
  try {
    return await get(url, 'json');
  } catch {
    return fallback;
  }
}

async function pool(items, worker) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          const r = await worker(item);
          if (r) results.push(r);
        } catch {
          // Yksittäinen tuotesivu saa epäonnistua.
        }
      }
    }),
  );
  return results;
}

const all = [];
for (const shop of SHOPS) {
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { products: batch } = await getOr(`https://${shop.host}/products.json?limit=250&page=${page}`, { products: [] });
    if (!batch?.length) break;
    products.push(...batch);
  }
  const candidates = products.filter(
    (p) => shop.allProducts || SUPPLEMENT_TYPE.test(`${p.product_type} ${(p.tags ?? []).join(' ')} ${p.title}`),
  );

  const found = await pool(candidates, async (p) => {
    const html = await get(`https://${shop.host}/products/${p.handle}`);
    const lines = htmlLines(html);
    const labelLines = lines.filter((l) => l.length < 300 && AMOUNT_LINE.test(l));
    const labelText = [...new Set(labelLines)].slice(0, 60).join('\n');
    if (!NUTRIENT_AMOUNT.test(labelText)) return null;

    const eans = new Set();
    for (const v of p.variants ?? []) {
      const m = String(v.sku ?? '').match(/(\d{13})$/);
      if (m) eans.add(m[1]);
    }
    for (const m of html.matchAll(/"(?:barcode|gtin13|gtin)"\s*:\s*"(\d{8,14})"/g)) eans.add(m[1]);
    if (eans.size === 0) return null;

    const ingredientsLine = lines.find((l) => /^(ainesosat|ainekset|raaka-aineet)\b/i.test(l));
    return {
      eans: [...eans],
      name: p.title,
      brand: p.vendor || undefined,
      shop: shop.name,
      labelText,
      ingredients: ingredientsLine?.replace(/^(ainesosat|ainekset|raaka-aineet)\s*:?\s*/i, '') || undefined,
    };
  });
  // ::notice näkyy GitHubin ajon yhteenvedossa.
  console.log(`::notice::${shop.name}: ${products.length} tuotetta, ${candidates.length} lisäravinne-ehdokasta, ${found.length} tietokantaan`);
  all.push(...found);
}

if (all.length < 50) throw new Error(`vain ${all.length} lisäravinnetta – sivustojen rakenne muuttunut?`);
writeFileSync(
  new URL('../src/data/supplements-db.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products: all }) + '\n',
);
console.log(`::notice::Lisäravinteita yhteensä: ${all.length}`);
