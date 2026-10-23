# How Finnish stores serve product data

Findings from probes run on GitHub Actions (datacenter IPs) with curl and a real Chromium (Playwright), 10/2026.
S-kaupat, K-Ruoka and Sokos block datacenter traffic, so their sections need a run from a home connection.

## Tokmanni: works, implemented (`src/api/tokmanni.ts`)
- Search: Klevu JSON API (no auth, works from servers):
  `https://eucs11.ksearchnet.com/cloud-search/n-search/search?ticket=klevu-15488592134928913&term=<EAN>&paginationStartsFrom=0&sortPrice=false&ipAddress=undefined&analyticsApiKey=klevu-15488592134928913&noOfResults=5&responseType=json`
  (without `responseType=json` it answers XML). Each result has `sku` = EAN-13, `url`, `name`, `item_brand_name`, `klevu_category`.
- Product page (plain `fetch`, server-rendered, EAN at the end of the URL):
  `<div class="pb2 bold">Ainesosat/Ingredienser</div><div class="pb1">FI…</div><div class="pb1">SV…</div>`
  `<div class="pb2 bold">Ravintosisältö/Näringsvärde <span class="value">per 100G</span></div><div class="pb1">Rasvaa/Fett <span class="value">20 g</span></div>…`
  Finnish and Swedish paragraphs come in either order.
- Sells groceries ("Elintarvikkeet") and supplements (e.g. Puhdistamo Puru magnesium).

## S-kaupat: blocked from servers
- `https://www.s-kaupat.fi/hakutulos?queryString=<EAN>` → HTTP 429 "Vercel Security Checkpoint" (WASM challenge at
  `/.well-known/vercel/security/request-challenge`). Headless Chromium from a datacenter fails it ("Failed to verify your browser, Code 10").
- On the phone the hidden WebView also lands on this checkpoint first; `extractionScript` now waits for it to finish.
- Unknown (needs a home-connection run): whether search by EAN works, the product URL pattern, and the GraphQL/JSON API the web app uses.

## K-Ruoka: blocked from servers
- `https://www.k-ruoka.fi/haku?q=<EAN>` → HTTP 403 Cloudflare "Pyyntö estetty (CF/WB)", also for real Chromium from a datacenter.
- Unknown: search, product URLs, API.

## Sokos: blocked from servers
- `https://www.sokos.fi/haku?q=<EAN>` → HTTP 403 from CloudFront.

## Health stores and pharmacies (supplement database, `scripts/fetch-supplements.mjs`)
- Shopify catalogues: `/products.json?limit=250&page=N` (title, vendor, product_type, tags, body_html, variants[].sku)
  and `/products/<handle>.js` (variants[].barcode). Ruohonjuuri (~4300 products, SKU ends with the EAN),
  Apteekki360 (~7400, SKU is a pharmacy code; EAN via `.js`), Puhdas+ (no barcodes), Puhdistamo.
- Nutrient tables are in `body_html` (Puhdas+, Puhdistamo) or only in the rendered product page (Ruohonjuuri).
- Yliopiston Apteekki: Magento, reachable, sitemap at `/pub/media/sitemap.xml`; not yet used.
- Life (503) and Sokos (403) block servers.
