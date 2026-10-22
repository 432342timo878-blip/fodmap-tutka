// Hakee Sydänmerkki-tuotteiden nimet sydanmerkki.fi-sivustolta tiedostoon
// src/data/sydanmerkki.json. Ajetaan APK-käännöksessä (GitHub Actions), jolloin
// lista päivittyy jokaisen uuden version mukana. Sivustolla ei ole viivakoodeja,
// joten sovellus vertaa tuotenimiä.
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.sydanmerkki.fi/tuotteet';
const MAX_REQUESTS = 400;
const LINK = /href="https:\/\/www\.sydanmerkki\.fi\/tuotteet\/([^"?#]+)"/g;
const CATEGORY = /href="https:\/\/www\.sydanmerkki\.fi\/tuotteet\?(cat=[^"]*?)&amp;page=\d+"/g;

let requests = 0;
async function get(url) {
  if (++requests > MAX_REQUESTS) throw new Error('liian monta pyyntöä');
  const res = await fetch(url, { headers: { 'User-Agent': 'FODMAP-tutka (henkilokohtainen kaytto)' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const slugs = new Set();
const collect = (html) => {
  let added = 0;
  for (const m of html.matchAll(LINK)) {
    const slug = decodeURIComponent(m[1]);
    if (!slugs.has(slug)) {
      slugs.add(slug);
      added++;
    }
  }
  return added;
};

async function crawl(query) {
  for (let page = 1; page < 100; page++) {
    const added = collect(await get(`${BASE}?${query}${query ? '&' : ''}page=${page}`));
    if (added === 0) break;
  }
}

const first = await get(BASE);
collect(first);
const categories = [...new Set([...first.matchAll(CATEGORY)].map((m) => m[1].replace(/&amp;/g, '&')))];
await crawl('');
for (const cat of categories) await crawl(cat);

const products = [...slugs].sort();
if (products.length < 20) throw new Error(`vain ${products.length} tuotetta – sivuston rakenne muuttunut?`);
writeFileSync(
  new URL('../src/data/sydanmerkki.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products }, null, 0) + '\n',
);
console.log(`Sydänmerkki-tuotteita: ${products.length} (${requests} pyyntöä, ${categories.length} kategoriaa)`);
