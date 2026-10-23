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
const CONCURRENCY = 2;
/** Shopify rajoittaa pyyntötahtia; odotetaan ja yritetään uudelleen. */
const RETRIES = 4;
// Testiajoon: SAMPLE=40 käsittelee vain 40 tuotetta kaupasta ja tulostaa esimerkkejä ohitetuista.
const SAMPLE = Number(process.env.SAMPLE) || 0;
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

function stripTags(html) {
  return (
    html
      // Taulukon solut samalle riville ("Magnesium | 125 mg"), rivit omilleen.
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/table)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function htmlLines(html) {
  const withoutScripts = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Osa kaupoista tallentaa taulukon koodattuna (&lt;table&gt;): puretaan ja siistitään toiseen kertaan.
  const text = stripTags(decode(stripTags(withoutScripts)).replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim().replace(/^\|\s*|\s*\|$/g, '').trim()).filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'text') {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'FODMAP-tutka (henkilokohtainen kaytto)' }, signal: AbortSignal.timeout(20000) });
    if (res.ok) return as === 'json' ? res.json() : res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      await sleep(Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt);
      continue;
    }
    const err = new Error(`${url}: ${res.status}`);
    err.status = res.status;
    throw err;
  }
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
        } catch (e) {
          // Yksittäinen tuotesivu saa epäonnistua; syy kirjataan tilastoon.
          count(`virhe ${e.status ?? e.name}`);
        }
        await sleep(250);
      }
    }),
  );
  return results;
}

let stats = {};
const count = (key) => (stats[key] = (stats[key] ?? 0) + 1);

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

  stats = {};
  let examples = 0;
  const todo = SAMPLE ? candidates.filter((_, i) => i % Math.max(1, Math.floor(candidates.length / SAMPLE)) === 0).slice(0, SAMPLE) : candidates;
  const found = await pool(todo, async (p) => {
    // Tuotekuvaus (body_html) on jo tuotelistassa; tuotesivu haetaan vain, jos taulukko ei ole siinä
    // (esim. Ruohonjuuri näyttää taulukon erillisestä kentästä).
    const labelFrom = (ls) => [...new Set(ls.filter((l) => l.length < 300 && AMOUNT_LINE.test(l)))].slice(0, 60).join('\n');
    let html = '';
    let lines = htmlLines(p.body_html ?? '');
    let labelText = labelFrom(lines);
    if (!NUTRIENT_AMOUNT.test(labelText)) {
      html = await get(`https://${shop.host}/products/${p.handle}`);
      lines = htmlLines(html);
      labelText = labelFrom(lines);
    }
    if (!NUTRIENT_AMOUNT.test(labelText)) {
      if (SAMPLE && examples++ < 3) {
        const amountLines = lines.filter((l) => /\d\s*(mg|µg|μg|mcg)/i.test(l)).slice(0, 6);
        console.log(`--- ${shop.name} ei määriä: ${p.handle}\n${amountLines.join('\n') || '(ei yhtään mg/µg-riviä sivulla)'}`);
      }
      count('ei määriä');
      return null;
    }

    const eans = new Set();
    for (const v of p.variants ?? []) {
      const m = String(v.sku ?? '').match(/(\d{13})$/);
      if (m) eans.add(m[1]);
    }
    for (const m of html.matchAll(/"(?:barcode|gtin13|gtin)"\s*:\s*"(\d{8,14})"/g)) eans.add(m[1]);
    if (eans.size === 0) {
      // Shopifyn tuotekohtainen JSON sisältää variaatioiden viivakoodit.
      const js = await get(`https://${shop.host}/products/${p.handle}.js`, 'json');
      for (const v of js.variants ?? []) if (/^\d{8,14}$/.test(String(v.barcode ?? ''))) eans.add(String(v.barcode));
    }
    // Ilman viivakoodia tuote löytyy sovelluksessa nimihaulla.
    count(eans.size === 0 ? 'vain nimellä' : 'viivakoodilla');

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
  const reasons = Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`::notice::${shop.name}: ${products.length} tuotetta, ${candidates.length} ehdokasta, ${found.length} tietokantaan (${reasons})`);
  all.push(...found);
}

if (!SAMPLE && all.length < 50) throw new Error(`vain ${all.length} lisäravinnetta – sivustojen rakenne muuttunut?`);
writeFileSync(
  new URL('../src/data/supplements-db.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products: all }) + '\n',
);
console.log(`::notice::Lisäravinteita yhteensä: ${all.length}`);
