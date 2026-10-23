// Väliaikainen: Tokmannin Klevu-haku ja tuotesivujen sisältö.
import { chromium } from 'playwright';

const KLEVU = (term) =>
  `https://eucs11.ksearchnet.com/cloud-search/n-search/search?ticket=klevu-15488592134928913&term=${encodeURIComponent(term)}&paginationStartsFrom=0&sortPrice=false&ipAddress=undefined&analyticsApiKey=klevu-15488592134928913&noOfResults=5`;

for (const term of ['fazer leipä', 'magnesium', 'valio jogurtti']) {
  const data = await (await fetch(KLEVU(term))).json();
  console.log(`\n=== Klevu "${term}": ${data.meta.totalResultsFound} tulosta`);
  const r = data.result?.[0];
  if (r) {
    console.log('keys:', Object.keys(r).join(', '));
    for (const k of Object.keys(r)) if (/ean|gtin|barcode|sku|url|name|ainesos|ingred|ravinto/i.test(k)) console.log(`  ${k}: ${String(r[k]).slice(0, 150)}`);
    const ean = Object.values(r).find((v) => /^\d{13}$/.test(String(v)));
    console.log('13-digit value in result:', ean);
  }
}

const data = await (await fetch(KLEVU('fazer leipä'))).json();
const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'fi-FI' });
for (const r of (data.result ?? []).slice(0, 2)) {
  console.log(`\n### product page ${r.url}`);
  const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  console.log('status', resp?.status());
  const html = await page.content();
  console.log('EAN-like in html:', [...new Set(html.match(/\b64\d{11}\b/g) ?? [])].slice(0, 5), '| gtin:', (html.match(/"gtin1?3?"\s*:\s*"\d+"/g) ?? []).slice(0, 2));
  const text = await page.evaluate(() => document.body.innerText);
  for (const word of ['Ainesosat', 'Ravintosisältö', 'Ravintoarvot', 'EAN']) {
    const at = text.search(new RegExp(word, 'i'));
    console.log(`${word} at ${at}:`, at >= 0 ? text.slice(at, at + 350).replace(/\n+/g, ' | ') : '');
  }
  // Toimiiko tavallinen fetch (ilman selainta) – sovellus voisi käyttää sitä suoraan.
  const plain = await fetch(r.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' } });
  const plainHtml = await plain.text();
  console.log('plain fetch status', plain.status, '| contains Ainesosat:', /ainesosat/i.test(plainHtml), '| Ravintosisältö:', /ravintosisältö|ravintoarvot/i.test(plainHtml));
}
await browser.close();
