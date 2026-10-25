// Kokoaa lisäravinnetietokannan suomalaisten terveyskauppojen, apteekkien ja urheiluravinnekauppojen
// verkkokaupoista tiedostoon src/data/supplements-db.json. Kaupoista ja niiden tiedoista: docs/store-data-findings.md.
//
//   node scripts/fetch-supplements.mjs <kauppa>   kerää yhden kaupan → supplement-parts/<kauppa>.json
//   node scripts/fetch-supplements.mjs --merge    yhdistää osat → src/data/supplements-db.json
//   node scripts/fetch-supplements.mjs --list     kauppojen tunnukset (APK-työnkulun rinnakkaiset ajot)
//   node scripts/fetch-supplements.mjs            kaikki kaupat peräkkäin ja yhdistys (hidas, paikalliseen ajoon)
//
// APK-työnkulku kerää jokaisen kaupan omassa rinnakkaisessa ajossaan enintään kerran viikossa.
// Talteen otetaan viivakoodit ja tuotetietojen ne rivit, joilla on määriä (esim. "magnesium
// 125 mg (33 % päivittäisestä tarpeesta)"). Rivit tulkitaan sovelluksessa samalla koodilla
// kuin kuvatut etiketit, joten tulkinnan parannukset koskevat myös tätä tietokantaa.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const SHOPIFY_SUPPLEMENT = /vitamin|supplement|ravintolis|lisäravin|nutrition|protein|sport|urheil|mineral|kivennäis|omega|luontais|magnesium|kalsium/i;

/**
 * Kaupat. Tapa (kind) kertoo, miten tuotteet luetaan:
 * shopify = /products.json, magento = GraphQL-rajapinta, woo = WooCommerce Store API, epages = Vilkas/ePages REST,
 * klevu = Tokmannin hakupalvelu + tuotesivut, sitemap = sivukartan tuotesivut.
 */
const SHOPS = {
  ruohonjuuri: { name: 'Ruohonjuuri', kind: 'shopify', host: 'www.ruohonjuuri.fi' },
  // supplementShop: kauppa myy vain lisäravinteita ja urheiluravinteita, joten ainesosat riittävät tuotteeksi.
  puhdasplus: { name: 'Puhdas+', kind: 'shopify', host: 'puhdasplus.fi', allProducts: true, supplementShop: true },
  puhdistamo: { name: 'Puhdistamo', kind: 'shopify', host: 'www.puhdistamo.fi', allProducts: true, supplementShop: true },
  apteekki360: { name: 'Apteekki360', kind: 'shopify', host: 'www.apteekki360.fi' },
  // /products.json on suljettu, kokoelman kautta sama lista vastaa.
  aminoporssi: { name: 'Aminopörssi', kind: 'shopify', host: 'www.aminoporssi.fi', productsPath: '/collections/all/products.json', supplementShop: true },
  // Vitamiinit ja ravintolisät, lasten ja raskausajan vitamiinit, iho- ja hiusravintolisät.
  yliopistonapteekki: { name: 'Yliopiston Apteekki', kind: 'magento', host: 'www.yliopistonapteekki.fi', categories: ['6412', '4030', '4129', '2887'] },
  minimani: { name: 'Minimani', kind: 'magento', host: 'www.minimani.fi', categories: ['424818'] },
  fiksuapteekki: { name: 'Fiksuapteekki', kind: 'woo', host: 'fiksuapteekki.fi', categories: /vitamiin|kivennäis|hivenaine|ravintolis|omega|magnesium|urheilu|terveys/i },
  // terveyskauppa.fi ohjaa tänne.
  purkauppa: { name: 'PUR-kauppa', kind: 'woo', host: 'pur-kauppa.fi', categories: /ravintolis|vitamiin|kivennäis|urheilu|omega/i },
  apteekkishop: { name: 'ApteekkiShop', kind: 'epages', api: 'https://www.apteekkishop.fi/rs/shops/ApteekkiShop' },
  lisaravinnekauppa: { name: 'Lisäravinnekauppa', kind: 'epages', api: 'https://www.lisaravinnekauppa.fi/rs/shops/lisaravinnekauppa', supplementShop: true },
  tokmanni: {
    name: 'Tokmanni',
    kind: 'klevu',
    terms: ['Terveysravinteet ja -valmisteet', 'Terveysvalmisteet', 'Vitamiinit', 'Urheiluravinteet', 'ravintolisä', 'vitamiini', 'monivitamiini', 'magnesium', 'kalsium', 'sinkki', 'rauta', 'omega', 'kreatiini', 'proteiini', 'D-vitamiini', 'B12'],
    categories: /Terveysravinteet|Terveysvalmisteet|Urheiluravinteet|Vitamiin/,
    // Tuotesivulla on myös muiden tuotteiden nimiä ("Magnesium 250 mg"): luetaan vain tuotetiedot.
    extract: (html) => after(html, '<div class="pb2 bold">', 30000),
  },
  myprotein: {
    name: 'MyProtein',
    supplementShop: true,
    kind: 'sitemap',
    sitemaps: ['https://www.myprotein.fi/sitemapindex-product.xml.gz'],
    urls: /\/p\/(lisaravinteet|vitamins|myvitamins)/,
    // Ravintoainetaulukko, ei sen jälkeisiä "Select this product" -suosituksia ("Kreatiinimonohydraatti - 500g").
    extract: (html) => after(html, 'id="nutritionalinfo"', 30000).split(/Select this product|frequentlyBoughtTogether|class="accordion-item/)[0],
  },
  bodykauppa: {
    name: 'Bodykauppa',
    supplementShop: true,
    kind: 'sitemap',
    sitemaps: ['https://bodykauppa.fi/index_sitemap.xml'],
    urls: /\/product\//,
    // Kuvaus ja ravintosisältö (description3) ovat sivun tilatiedoissa koodattuna, eivät sivun tekstinä.
    extract: (html) => [...html.matchAll(/description\d?&quot;:&quot;([\s\S]*?)&quot;,&quot;/g)].map((m) => decode(m[1])).join('\n'),
  },
};

/** Sivun osa merkkijonosta alkaen (tai koko sivu, jos merkkijonoa ei ole). */
function after(html, marker, length) {
  const i = html.indexOf(marker);
  return i < 0 ? html : html.slice(i + marker.length, i + marker.length + length);
}

const MAX_PAGES = 40;
const CONCURRENCY = 2;
/** Kaupat rajoittavat pyyntötahtia; odotetaan ja yritetään uudelleen. */
const RETRIES = 4;
// Testiajoon: SAMPLE=40 käsittelee vain 40 tuotetta kaupasta ja tulostaa esimerkkejä ohitetuista.
const SAMPLE = Number(process.env.SAMPLE) || 0;
const NUTRIENT_AMOUNT =
  /(vitamiini|vitamin|magnesium|kalsium|sinkki|rauta|jodi|seleeni|kromi|kalium|omega|epa|dha|kreatiini|foolihappo|folaatti|biotiini|b12|b6|tiamiini|riboflaviini|niasiini)[^\n]{0,45}\d[\d,.]*\s*(mg|µg|μg|mcg|mikrog|g|iu|ky)/i;
const AMOUNT_LINE = /\d[\d,.]*\s*(mg|µg|μg|mcg|ug|mikrog|g|iu|ky)(?![a-zåäö])|annos|kapseli|tabletti|pastilli|ravintosisältö|sisältää|ravintolisä/i;
// Lisäravinteen tuntomerkit (pakkauksessa on aina sana "ravintolisä"), ja kosmetiikan INCI-luettelo, jota ei oteta.
const SUPPLEMENT_WORDS = /ravintolisä|kosttillskott|food supplement|lisäravinne|urheiluravinne|proteiinijauhe|kreatiini|aminohappo/i;
const COSMETIC = /\baqua\b|glycerin\b|parfum|sodium laur|cetearyl|dimethicone|tocopheryl acetate/i;

const ENTITIES = { auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', uuml: 'ü', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", micro: 'µ', deg: '°', ndash: '–', mdash: '—' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);

function stripTags(html) {
  return (
    html
      // Taulukon rivi pidetään yhtenä, vaikka solujen välissä olisi rivinvaihtoja tai solussa kappaleita (<td><p>Magnesium</p></td>).
      .replace(/<tr[\s>][\s\S]*?<\/tr>/gi, (row) => row.replace(/<\/?(p|div|br|span|strong|b)(\s[^>]*)?\/?>/gi, ' ').replace(/\s+/g, ' '))
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
  return text.split(/\n|\\n/).map((l) => l.replace(/\s+/g, ' ').trim().replace(/^\|\s*|\s*\|$/g, '').trim()).filter(Boolean);
}

// Pitkät rivit ovat yleensä mainostekstiä, paitsi apteekkien yhden rivin taulukot ("1 tabletti sisältää: B1-vitamiini 12 mg, …").
const labelFrom = (lines) =>
  [...new Set(lines.filter((l) => (l.length < 300 || (l.length < 2000 && NUTRIENT_AMOUNT.test(l))) && AMOUNT_LINE.test(l)))].slice(0, 60).join('\n');
const plain = (s) => (s ? decode(String(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined);
const isEan = (s) => /^\d{8}$|^\d{12,14}$/.test(String(s ?? ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (compatible; FODMAP-tutka; henkilokohtainen kaytto)';
async function get(url, as = 'text', init = {}) {
  for (let attempt = 0; ; attempt++) {
    // Kohtuullinen tahti: lyhyt tauko ennen jokaista pyyntöä.
    await sleep(200);
    let res;
    let body;
    try {
      res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers }, signal: AbortSignal.timeout(30000) });
      if (res.ok) body = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      // Aikakatkaisu tai katkennut yhteys: yritetään uudelleen.
      if (attempt < RETRIES) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw e;
    }
    if (body) {
      // Pakattu sivukartta (.xml.gz) voi tulla pakattuna tai valmiiksi purettuna.
      const text = (body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8');
      return as === 'json' ? JSON.parse(text) : text;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      await sleep(Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt);
      continue;
    }
    const err = new Error(`${url}: ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

let stats = {};
const count = (key) => (stats[key] = (stats[key] ?? 0) + 1);

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
          // Yksittäinen tuote saa epäonnistua; syy kirjataan tilastoon.
          count(`virhe ${e.status ?? e.name}`);
        }
      }
    }),
  );
  return results;
}

const GTIN_KEYS = ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8'];

/** Sivun tuotetiedot (JSON-LD Product, muuten og:title / title): nimi, merkki ja viivakoodit (myös makuvaihtoehtojen). */
function pageMeta(html) {
  const eans = new Set();
  let name;
  let brand;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const o = stack.pop();
      if (Array.isArray(o)) stack.push(...o);
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      const types = [].concat(o['@type'] ?? []);
      if (types.some((t) => /Product|Offer/.test(t))) for (const k of GTIN_KEYS) if (isEan(o[k])) eans.add(String(o[k]));
      if (types.some((t) => /^Product(Group)?$/.test(t))) {
        name ??= o.name;
        brand ??= typeof o.brand === 'string' ? o.brand : o.brand?.name;
      }
      stack.push(o['@graph'], o.hasVariant, o.offers);
    }
  }
  if (eans.size === 0)
    for (const m of html.matchAll(/(?:"|&quot;)(?:barcode|gtin13|gtin|gtin14|gtin8|ean)(?:"|&quot;)\s*:\s*(?:"|&quot;)?(\d{8,14})/g)) if (isEan(m[1])) eans.add(m[1]);
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const title = html.match(/<title[^>]*>([^<]+)/i);
  return { eans, name: plain(name ?? (og?.[1] ?? title?.[1])?.split(' | ')[0]), brand: plain(brand) };
}

/**
 * Tuote tietokantaan: määrärivit tuotekuvauksesta (text) tai tarvittaessa tuotesivulta (page).
 * item = { name, brand, eans, text, page, ingredients, barcodes() }
 */
async function finish(shop, item, examples) {
  let lines = htmlLines(item.text ?? '');
  let labelText = labelFrom(lines);
  let html = '';
  if (!NUTRIENT_AMOUNT.test(labelText) && item.page) {
    html = await get(item.page);
    lines = htmlLines(shop.extract ? shop.extract(html) : html);
    labelText = labelFrom(lines);
  }
  const ingredients = plain(item.ingredients) ?? findIngredients(lines);
  const hasAmounts = NUTRIENT_AMOUNT.test(labelText);
  // Ilman vitamiinitaulukkoa tuote kelpaa, jos siitä on ainesosat (FODMAP-arvio) ja se on lisäravinne, ei esim. voide.
  const keepForIngredients =
    !hasAmounts && ingredients && !COSMETIC.test(ingredients) && (shop.supplementShop || SUPPLEMENT_WORDS.test(`${item.name ?? ''}\n${lines.join('\n')}`));
  if (!hasAmounts && !keepForIngredients) {
    if (SAMPLE && examples.n++ < 3) {
      const amountLines = lines.filter((l) => /\d\s*(mg|µg|μg|mcg|mikrog)/i.test(l)).slice(0, 6);
      console.log(`--- ${shop.name} ei määriä: ${item.name ?? item.page}\n${amountLines.join('\n') || '(ei yhtään mg/µg-riviä)'}`);
    }
    count('ei määriä eikä ainesosia');
    return null;
  }
  if (!hasAmounts) labelText = '';

  const meta = html ? pageMeta(html) : { eans: new Set() };
  const eans = new Set((item.eans ?? []).map(String).filter(isEan));
  if (eans.size === 0) for (const e of meta.eans) eans.add(e);
  if (eans.size === 0 && item.barcodes) for (const e of await item.barcodes()) if (isEan(e)) eans.add(String(e));
  const name = plain(item.name) ?? meta.name;
  if (!name) {
    count('ei nimeä');
    return null;
  }
  // Ilman viivakoodia tuote löytyy sovelluksessa nimihaulla.
  count(eans.size === 0 ? 'vain nimellä' : 'viivakoodilla');
  if (!hasAmounts) count('vain ainesosat');
  return {
    eans: [...eans],
    name,
    brand: plain(item.brand) ?? meta.brand ?? undefined,
    shop: shop.name,
    labelText,
    ingredients: ingredients || undefined,
  };
}

/**
 * Ainesosaluettelo: "Ainesosat: …" rivin alussa tai keskellä (apteekkien yhden rivin kuvaus), tai pelkän
 * otsikon ("Ainesosat/Ingredienser") jälkeinen rivi. Luettelo päättyy ensimmäiseen uuteen virkkeeseen.
 */
function findIngredients(lines) {
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(ainesosat|ainekset|raaka-aineet)(\/[a-zåäö]+)?\s*:?\s*$/i);
    const inline = lines[i].match(/(?:^|[\s.:])(?:ainesosat|ainekset|raaka-aineet)\s*:\s*(.{10,})/i);
    const text = heading ? lines[i + 1] : inline?.[1];
    if (text && text.length >= 10) return text.split(/\.\s+(?=[A-ZÅÄÖ])/)[0].replace(/\.$/, '').slice(0, 800).trim();
  }
  return undefined;
}

// ---- Tuotelistat kaupoittain: palauttavat { total, items } ----

async function shopifyItems(shop) {
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let batch;
    try {
      ({ products: batch } = await get(`https://${shop.host}${shop.productsPath ?? '/products.json'}?limit=250&page=${page}`, 'json'));
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    if (!batch?.length) break;
    products.push(...batch);
  }
  const items = products
    .filter((p) => shop.allProducts || SHOPIFY_SUPPLEMENT.test(`${p.product_type} ${(p.tags ?? []).join(' ')} ${p.title}`))
    .map((p) => ({
      name: p.title,
      brand: p.vendor,
      eans: (p.variants ?? []).map((v) => String(v.sku ?? '').match(/(\d{13})$/)?.[1]).filter(Boolean),
      text: p.body_html,
      // Tuotesivu vain, jos taulukko ei ole kuvauksessa (esim. Ruohonjuuri näyttää sen erillisestä kentästä).
      page: `https://${shop.host}/products/${p.handle}`,
      // Shopifyn tuotekohtainen JSON sisältää variaatioiden viivakoodit.
      barcodes: async () => ((await get(`https://${shop.host}/products/${p.handle}.js`, 'json')).variants ?? []).map((v) => v.barcode),
    }));
  return { total: products.length, items };
}

async function magentoItems(shop) {
  const items = new Map();
  let total = 0;
  for (let page = 1; page <= 100; page++) {
    const query = `{ products(filter: {category_id: {in: ${JSON.stringify(shop.categories)}}}, pageSize: 50, currentPage: ${page}) {
      total_count page_info { total_pages }
      items { sku name url_key url_suffix custom_attributesV2 { items { code ... on AttributeValue { value } ... on AttributeSelectedOptions { selected_options { label } } } } } } }`;
    const res = await get(`https://${shop.host}/graphql`, 'json', { method: 'POST', headers: { 'Content-Type': 'application/json', Store: 'default' }, body: JSON.stringify({ query }) });
    if (!res.data?.products) throw new Error(`${shop.host}: ${JSON.stringify(res.errors ?? res).slice(0, 200)}`);
    const { products } = res.data;
    total = products.total_count;
    for (const p of products.items) {
      const a = Object.fromEntries((p.custom_attributesV2?.items ?? []).map((x) => [x.code, x.value ?? x.selected_options?.map((o) => o.label).join(', ')]));
      items.set(p.sku, {
        name: p.name,
        brand: a.brand ?? a.manufacturer,
        // Yliopiston Apteekissa EAN on omassa kentässään, Minimanissa tuotekoodi on EAN.
        eans: [a.ean_barcode, p.sku].filter(isEan),
        // Yliopiston Apteekin "composition_description" = pakkauksen määrätiedot ja ainesosat.
        text: [a.composition_description, a.description, a.short_description].filter(Boolean).join('\n'),
        ingredients: a.ingredient_statement,
      });
    }
    if (page >= (products.page_info?.total_pages ?? 1)) break;
    await sleep(300);
  }
  return { total, items: [...items.values()] };
}

async function wooItems(shop) {
  const all = [];
  for (let page = 1; page <= 200; page++) {
    const batch = await get(`https://${shop.host}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, 'json');
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
    await sleep(300);
  }
  const items = all
    .filter((p) => (p.categories ?? []).some((c) => shop.categories.test(decode(c.name))))
    .map((p) => ({
      name: p.name,
      brand: p.brands?.[0]?.name,
      eans: [p.sku],
      text: `${p.description ?? ''}\n${p.short_description ?? ''}`,
      page: p.permalink,
    }));
  return { total: all.length, items };
}

async function epagesItems(shop) {
  const all = [];
  for (let page = 1; page <= 300; page++) {
    const res = await get(`${shop.api}/products?resultsPerPage=100&page=${page}`, 'json', { headers: { Accept: 'application/vnd.epages.v1+json' } });
    all.push(...(res.items ?? []));
    if (!res.items?.length || page * 100 >= res.results) break;
    await sleep(300);
  }
  // Apteekissa on myös lääkkeitä ja kosmetiikkaa: vain tuotteet, joiden kuvauksessa on vitamiinien tai kivennäisaineiden määriä.
  const items = all.map((p) => ({ name: p.name, brand: p.manufacturer, eans: [p.ean, p.productCode, p.upc], text: `${p.description ?? ''}\n${p.shortDescription ?? ''}` }));
  return { total: all.length, items };
}

async function klevuItems(shop) {
  const found = new Map();
  for (const term of shop.terms) {
    for (let start = 0; start < 2000; start += 100) {
      const url =
        'https://eucs11.ksearchnet.com/cloud-search/n-search/search?ticket=klevu-15488592134928913&analyticsApiKey=klevu-15488592134928913' +
        `&term=${encodeURIComponent(term)}&paginationStartsFrom=${start}&noOfResults=100&sortPrice=false&ipAddress=undefined&responseType=json`;
      const res = await get(url, 'json');
      for (const r of res.result ?? []) {
        if (!isEan(r.sku) || !r.url || !shop.categories.test(r.klevu_category ?? '') || /Lemmik|Koira|Kissa/.test(r.klevu_category ?? '')) continue;
        found.set(r.sku, { name: r.name, brand: r.item_brand_name, eans: [r.sku], page: r.url });
      }
      if (start + 100 >= Number(res.meta?.totalResultsFound ?? 0)) break;
      await sleep(200);
    }
  }
  return { total: found.size, items: [...found.values()] };
}

async function sitemapItems(shop) {
  const urls = new Set();
  const visit = async (sitemap, depth = 0) => {
    const xml = await get(sitemap);
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
    if (/<sitemapindex/i.test(xml) && depth < 2) {
      for (const loc of locs) await visit(loc, depth + 1);
    } else for (const loc of locs) if (shop.urls.test(loc)) urls.add(loc);
  };
  for (const s of shop.sitemaps) await visit(s);
  // Bodykauppa: EAN on osoitteen lopussa (/fi/product/<nimi>/<EAN>).
  const items = [...urls].map((url) => ({ eans: [url.match(/\/(\d{8,14})\/?$/)?.[1]].filter(Boolean), page: url }));
  return { total: urls.size, items };
}

const LISTERS = { shopify: shopifyItems, magento: magentoItems, woo: wooItems, epages: epagesItems, klevu: klevuItems, sitemap: sitemapItems };

const PARTS = new URL('../supplement-parts/', import.meta.url);

async function collect(id) {
  const shop = SHOPS[id];
  if (!shop) throw new Error(`tuntematon kauppa ${id}; tunnetut: ${Object.keys(SHOPS).join(', ')}`);
  stats = {};
  const started = Date.now();
  const { total, items } = await LISTERS[shop.kind](shop);
  const todo = SAMPLE ? items.filter((_, i) => i % Math.max(1, Math.floor(items.length / SAMPLE)) === 0).slice(0, SAMPLE) : items;
  const examples = { n: 0 };
  const found = await pool(todo, (item) => finish(shop, item, examples));
  const reasons = Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ');
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  // ::notice näkyy GitHubin ajon yhteenvedossa.
  console.log(`::notice::${shop.name}: ${total} tuotetta, ${items.length} ehdokasta, ${found.length} tietokantaan (${reasons}; ${minutes} min)`);
  mkdirSync(PARTS, { recursive: true });
  writeFileSync(new URL(`${id}.json`, PARTS), JSON.stringify({ id, shop: shop.name, products: found }));
  return found;
}

function merge() {
  let files = [];
  try {
    files = readdirSync(PARTS).filter((f) => f.endsWith('.json'));
  } catch {
    // Ei yhtään osaa.
  }
  const parts = files.map((f) => JSON.parse(readFileSync(new URL(f, PARTS), 'utf8')));
  const missing = Object.keys(SHOPS).filter((id) => !parts.some((p) => p.id === id));
  if (missing.length) console.log(`::warning::Ei tietoja kaupoista: ${missing.map((id) => SHOPS[id].name).join(', ')}`);
  const all = parts.flatMap((p) => p.products);
  if (all.length < 50) throw new Error(`vain ${all.length} lisäravinnetta – sivustojen rakenne muuttunut?`);
  const products = dedupe(all);
  writeFileSync(
    new URL('../src/data/supplements-db.json', import.meta.url),
    JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products }) + '\n',
  );
  const eans = new Set(products.flatMap((p) => p.eans));
  const perShop = parts.map((p) => `${p.shop} ${p.products.length}`).join(', ');
  console.log(`::notice::Lisäravinteita yhteensä: ${products.length} eri tuotetta, ${eans.size} viivakoodia (kaupoittain: ${perShop})`);
}

/**
 * Sama tuote useasta kaupasta yhdeksi: yhteinen viivakoodi (tai ilman viivakoodia sama merkki + nimi).
 * Etiketiksi valitaan se, jossa on eniten määrärivejä; viivakoodit ja kaupat yhdistetään.
 */
function dedupe(all) {
  const groupOf = new Map();
  const groups = [];
  const key = (p) => `${p.brand ?? ''} ${p.name}`.toLowerCase().replace(/[^a-z0-9åäö]+/g, ' ').trim();
  for (const p of all) {
    const keys = p.eans.length ? p.eans : [`name:${key(p)}`];
    const found = [...new Set(keys.map((k) => groupOf.get(k)).filter(Boolean))];
    let group = found[0] ?? [];
    if (!found.length) groups.push(group);
    // Tuote voi yhdistää kaksi aiempaa ryhmää (eri kaupoissa eri viivakoodit samalle tuotteelle).
    for (const other of found.slice(1)) {
      group.push(...other);
      other.length = 0;
    }
    group.push(p);
    for (const q of group) for (const k of q.eans.length ? q.eans : [`name:${key(q)}`]) groupOf.set(k, group);
  }
  const score = (p) => p.labelText.split('\n').filter((l) => NUTRIENT_AMOUNT.test(l)).length * 1000 + Math.min(p.labelText.length, 999);
  return groups
    .filter((g) => g.length)
    .map((g) => {
      const best = [...g].sort((a, b) => score(b) - score(a))[0];
      return {
        ...best,
        eans: [...new Set(g.flatMap((p) => p.eans))],
        shop: [...new Set([best.shop, ...g.map((p) => p.shop)])].join(', '),
        brand: best.brand ?? g.find((p) => p.brand)?.brand,
        ingredients: best.ingredients ?? g.find((p) => p.ingredients)?.ingredients,
      };
    });
}

const arg = process.argv[2];
if (arg === '--list') console.log(JSON.stringify(Object.keys(SHOPS)));
else if (arg === '--page') {
  // Vianetsintä: node scripts/fetch-supplements.mjs --page <kauppa> <tuotesivun osoite>
  const shop = SHOPS[process.argv[3]];
  stats = {};
  const html = await get(process.argv[4]);
  console.log(htmlLines(shop.extract ? shop.extract(html) : html).filter((l) => AMOUNT_LINE.test(l)).slice(0, 40).map((l) => l.slice(0, 200)).join('\n'));
  console.log('---', pageMeta(html), await finish(shop, { page: process.argv[4] }, { n: 0 }));
}
else if (arg === '--merge') merge();
else if (arg) await collect(arg);
else {
  for (const id of Object.keys(SHOPS)) {
    try {
      await collect(id);
    } catch (e) {
      console.log(`::warning::${SHOPS[id].name}: ${e.message}`);
    }
  }
  if (!SAMPLE) merge();
}
