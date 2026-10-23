# How Finnish stores serve product data

Findings from probes run on GitHub Actions (datacenter IPs) with curl and a real Chromium (Playwright), 10/2026.
S-kaupat, K-Ruoka and Sokos block datacenter traffic; their sections come from a run on a home connection (23.10.2026).

## Tokmanni: works, implemented (`src/api/tokmanni.ts`)
- Search: Klevu JSON API (no auth, works from servers):
  `https://eucs11.ksearchnet.com/cloud-search/n-search/search?ticket=klevu-15488592134928913&term=<EAN>&paginationStartsFrom=0&sortPrice=false&ipAddress=undefined&analyticsApiKey=klevu-15488592134928913&noOfResults=5&responseType=json`
  (without `responseType=json` it answers XML). Each result has `sku` = EAN-13, `url`, `name`, `item_brand_name`, `klevu_category`.
- Product page (plain `fetch`, server-rendered, EAN at the end of the URL):
  `<div class="pb2 bold">Ainesosat/Ingredienser</div><div class="pb1">FI…</div><div class="pb1">SV…</div>`
  `<div class="pb2 bold">Ravintosisältö/Näringsvärde <span class="value">per 100G</span></div><div class="pb1">Rasvaa/Fett <span class="value">20 g</span></div>…`
  Finnish and Swedish paragraphs come in either order.
- Sells groceries ("Elintarvikkeet") and supplements (e.g. Puhdistamo Puru magnesium).

## S-kaupat: GraphQL API, works with plain HTTP from a home connection (implemented: `src/api/groceryApis.ts`)
Tested 23.10.2026 from a home connection in Finland (6/6 test products). Servers/datacenters get a Vercel checkpoint (429).
- `POST https://api.s-kaupat.fi/` with headers `Content-Type: application/json`, `x-client-name: skaupat-web`, body
  `{"query":"query P($ean: ID!) { product(id: $ean) { ean name brandName ingredientStatement allergens { allergenTypeText levelOfContainmentCode } productDetails { nutrients { referenceQuantity nutrients { name value recommendedIntake } } } } }","variables":{"ean":"<EAN>"}}`
- No store ID needed; the variable type must be `ID!`. Unknown EAN → error "Product not found", `product: null`.
- Values are Finnish strings ("3,2 g", "1 004 kJ / 238 kcal"). Several nutrient groups are possible: `referenceQuantity` "100 g", or "1 kpl" for supplements (then `recommendedIntake` is % of the daily value).
- Also returns Sokos-only products (same S-Group product id "sokId").
- Website: search `/hakutulokset?queryString=<EAN>` (`/hakutulos` is a 404), product page `/tuote/<slug>/<EAN>`. Product data is not in the HTML; the page loads it from the API.

## K-Ruoka: API from inside a k-ruoka.fi page (implemented: `src/api/kRuokaLookup.tsx`)
Tested from a home connection (5/6). Plain HTTP gets a 403 Cloudflare "Just a moment..." even from home, so a real browser (WebView) is needed.
- Inside a k-ruoka.fi page: `GET /kr-api/v4/products/<EAN>?storeId=N106` (`Accept: application/json`). The bare EAN works instead of the slug. Not sold or unknown → 404 (e.g. the S-Group own brand "Kotimaista").
- `product.localizedName.finnish`; `productAttributes.productContents.fi` (ingredients); `productAttributes.nutritionalContents[0]` = `{basis:{fi:"100 g"}, nutrients:{energyKj, energyKcal, fat:{amount}, fatSaturated, carbohydrates, carbohydratesSugar, protein, salt, nutritionalFiber, lactose…}, secondaryNutrients:[{name:{fi}, unit, amount, percentageOfDailyIntake}]}`; `productAttributes.vitaminContent`; `localizedAllergens.contains.fi`. Numbers are real numbers.
- `/kauppa/tuote/<EAN>` redirects to the product page. The HTML also contains the data in `<div id="applicationState" data-state="…">` (~2.4 MB).
- Puhdistamo Iltamagnesium on K-Ruoka has ingredients but no vitamin/mineral table.

## Sokos: works without a browser from home, but S-kaupat already covers it (not implemented)
Datacenters get a CloudFront 403. A department store: no bread or dairy (2/6 test products).
- Search: `POST https://api.sokos.fi/products/search?search=<EAN>`, body `{"retailApiVisitorId":"<random uuid>"}` → sokId + slug.
- Product page `https://www.sokos.fi/tuote/<sokId>/<slug>` → `__NEXT_DATA__` `props.pageProps.dehydratedState.queries[queryKey[0]=="product"].state.data` → `eanCode`, `names[0].value`, `ingredientsList` (FI + "\n\n" + SV), `nutritionalContent[]` (`nutrientContentByMeasure` per 100 g, or `nutrientContentByPieces` + `dailyValueIntakeByPieces` for supplements; units GRM/MGM/KJO/E14).
- The website's search parameter is `?hakutermi=`, not `?q=`.

Lookup order in the app: Open Food Facts → S-kaupat API and Tokmanni (direct, in parallel) → K-Ruoka (WebView). Products with ingredients but no nutrition in Open Food Facts get their nutrition from S-kaupat.

## Health stores and pharmacies (supplement database, `scripts/fetch-supplements.mjs`)
- Shopify catalogues: `/products.json?limit=250&page=N` (title, vendor, product_type, tags, body_html, variants[].sku)
  and `/products/<handle>.js` (variants[].barcode). Ruohonjuuri (~4300 products, SKU ends with the EAN),
  Apteekki360 (~7400, SKU is a pharmacy code; EAN via `.js`), Puhdas+ (no barcodes), Puhdistamo.
- Nutrient tables are in `body_html` (Puhdas+, Puhdistamo) or only in the rendered product page (Ruohonjuuri).
- Yliopiston Apteekki: Magento, reachable, sitemap at `/pub/media/sitemap.xml`; not yet used.
- Life (503) and Sokos (403) block servers.
