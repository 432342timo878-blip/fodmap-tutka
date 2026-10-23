// Väliaikainen tutkimus: avaa kauppojen sivut oikealla selaimella ja kirjaa, mistä tuotetiedot tulevat.
import { chromium } from 'playwright';

const EAN = process.env.EAN || '6413467446900';
const TARGETS = [
  ['S-kaupat', `https://www.s-kaupat.fi/hakutulos?queryString=${EAN}`],
  ['K-Ruoka', `https://www.k-ruoka.fi/haku?q=${EAN}`],
  ['Sokos', `https://www.sokos.fi/haku?q=${EAN}`],
  ['Tokmanni', `https://www.tokmanni.fi/search/?q=${EAN}`],
];

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: 'fi-FI',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
});

for (const [name, url] of TARGETS) {
  console.log(`\n########## ${name}: ${url}`);
  const page = await context.newPage();
  const apiCalls = [];
  page.on('response', async (res) => {
    const req = res.request();
    const type = req.resourceType();
    if (!['xhr', 'fetch', 'document'].includes(type)) return;
    let body = '';
    try { body = await res.text(); } catch {}
    const interesting = body.includes(EAN) || /ainesosat|ingredient|nutrition|ravinto/i.test(body);
    apiCalls.push({ status: res.status(), method: req.method(), url: req.url().slice(0, 200), post: (req.postData() || '').slice(0, 400), size: body.length, interesting, sample: interesting ? body.slice(Math.max(0, body.indexOf(EAN) - 300), body.indexOf(EAN) + 500) : '' });
  });
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('first status', resp?.status());
    await page.waitForTimeout(9000);
    console.log('final url', page.url(), '| title', await page.title());
    const links = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.href))].filter((h) => /tuote|product|\/p\//i.test(h)).slice(0, 8));
    console.log('product-ish links:', links);
    const target = links.find((h) => h.includes(EAN)) || links[0];
    if (target && !page.url().includes(EAN)) {
      console.log('opening', target);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(8000);
      console.log('product url', page.url(), '| title', await page.title());
    }
    const text = await page.evaluate(() => document.body.innerText);
    const at = text.search(/ainesosat/i);
    console.log('page text length', text.length, '| ainesosat at', at);
    if (at >= 0) console.log('INGREDIENTS >>>', text.slice(at, at + 600).replace(/\n+/g, ' | '));
    const nut = text.search(/ravintosisältö|ravintoarvot/i);
    if (nut >= 0) console.log('NUTRITION >>>', text.slice(nut, nut + 500).replace(/\n+/g, ' | '));
    if (at < 0 && nut < 0) console.log('TEXT HEAD >>>', text.slice(0, 600).replace(/\n+/g, ' | '));
    const nextData = await page.evaluate(() => document.getElementById('__NEXT_DATA__')?.textContent?.length ?? 0);
    console.log('__NEXT_DATA__ length', nextData);
  } catch (e) {
    console.log('ERROR', e.message);
  }
  console.log('--- requests (xhr/fetch/document):');
  for (const c of apiCalls.slice(0, 40)) console.log(`${c.status} ${c.method} ${c.url} size=${c.size}${c.interesting ? ' *INTERESTING*' : ''}${c.post ? ` post=${c.post}` : ''}`);
  for (const c of apiCalls.filter((c) => c.interesting && c.sample).slice(0, 3)) console.log(`>>> SAMPLE ${c.url}\n${c.sample}`);
  await page.close();
}
await browser.close();
