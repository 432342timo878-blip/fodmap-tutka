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

## Health stores, pharmacies and sports shops (supplement database, `scripts/fetch-supplements.mjs`)
Checked 24.10.2026 from a home connection (curl + the collector's sample mode, `SAMPLE=25`); reachability from GitHub Actions
is in "From GitHub Actions" below. Each shop is collected in its own parallel job in the APK workflow (`supplements` matrix);
the build job merges the parts. Collecting all shops one after another took >30 min with only four shops.

| Shop | Platform | Product list | Barcode | Vitamin/mineral table |
|---|---|---|---|---|
| Ruohonjuuri | Shopify | `/products.json` (~4300) | SKU ends with the EAN | rendered product page only |
| Apteekki360 | Shopify | `/products.json` (~7400) | `/products/<handle>.js` `variants[].barcode` | `body_html` or page |
| Puhdas+ | Shopify | `/products.json` (~230) | none (name search) | `body_html` |
| Puhdistamo | Shopify | `/products.json` (~170) | SKU | `body_html` |
| Aminopörssi | Shopify | `/products.json` is closed (429 `local_rate_limited`), but `/collections/all/products.json` works (~4700) | `.js` `barcode` / page `gtin13` | `body_html` ("Ravintosisältö … Per annos … % NRV") |
| Yliopiston Apteekki | Magento 2, Cloudflare | GraphQL `POST /graphql`: `products(filter:{category_id:{in:[…]}})`; category 6412 "Vitamiinit ja ravintolisät" (1087), 4030 lasten, 4129 raskaus, 2887 iho- ja hiusravintolisät | `custom_attributesV2` → `ean_barcode` | `composition_description` ("Vuorokausiannos, 1 tabletti sisältää: … D3-vitamiini 20 mikrog (400 %*)", one line, units "mikrog") |
| Minimani | Magento 2 | GraphQL, category 424818 "Terveystuotteet ja urheilu" (885) | SKU = EAN | only `description` prose (the page is rendered in the browser; no table in the HTML) |
| Fiksuapteekki | WooCommerce | Store API `/wp-json/wc/store/v1/products?per_page=100&page=N` (~1800, no auth) | SKU = EAN | `description` ("D3-vitamiini (kolekalsiferoli) 50 µg – 1000 %*") |
| PUR-kauppa (terveyskauppa.fi redirects here) | WooCommerce | Store API (~2500), category "Ravintolisät" | SKU = EAN | `description`, else product page |
| ApteekkiShop | Vilkas (ePages) | REST `https://www.apteekkishop.fi/rs/shops/ApteekkiShop/products?resultsPerPage=100&page=N` (~9900, header `Accept: application/vnd.epages.v1+json`) | `ean` | `description` |
| Lisäravinnekauppa | Vilkas (ePages) | REST `/rs/shops/lisaravinnekauppa` (152; the address is in the page as `"RESTAPIURL"`) | mostly empty | `description` |
| Tokmanni | Magento + Klevu | Klevu search (see Tokmanni above) with category words ("Terveysravinteet ja -valmisteet" 457, "Urheiluravinteet" 189, …), kept when `klevu_category` is a health/sports category (~630) | Klevu `sku` = EAN | product page, "Käyttöohjeet" block ("1 TABL SISÄLTÄÄ: D3-vitamiini 50 µg 1000% RI"); many pages have no amounts |
| MyProtein | THG (Astro) | `sitemapindex-product.xml.gz` → `/p/lisaravinteet|vitamins|myvitamins/` (~270 of 1418; the rest is clothing) | JSON-LD `gtin13` (every flavour) | `<div id="nutritionalinfo">` table; cut before "Select this product" recommendations |
| Bodykauppa | own platform | `index_sitemap.xml` → `product_sitemap_part_*_fi.xml` (~2600) | EAN at the end of the URL, JSON-LD `gtin` | HTML-encoded in the page state (`description3&quot;:&quot;&lt;p&gt;…`), not in the visible text |

### From GitHub Actions (first run in the own repository, 24.10.2026)
All 14 shops answer GitHub's servers. Products in the database / time of the shop's job:
Aminopörssi 911 (22.5 min), Bodykauppa 883 (15.6), Fiksuapteekki 785 (3.3), Yliopiston Apteekki 631 (3.4), Apteekki360 542 (17.0),
Ruohonjuuri 474 (9.6), ApteekkiShop 192 (4.3), MyProtein 135 (1.0), Minimani 112 (2.6), PUR-kauppa 103 (8.7), Puhdas+ 83 (2.1),
Puhdistamo 78 (4.8), Tokmanni 59 (3.1; 6 product pages 404), Lisäravinnekauppa 38 (0.1). Merged: 3350 different products,
3102 barcodes (products sold in several shops are combined). The whole run took ~35 min with the APK build.

Not collected:
- **Verkkoapteekki** (Vilkas/ePages): the label text is on the product page ("Yksi tabletti sisältää: D3-vitamiinia 20 mikrog"),
  but the REST API is switched off (`/rs/shops/verkkoapteekki` → 500), the page has no barcode and the sitemap has ~18 000 URLs.
- **Fitnesstukku** (Salesforce Commerce Cloud, same group as Gymgrossisten/Bodystore): ~5400 product URLs in `sitemap_0.xml`, tables
  on the page (cells as `<td><p>…</p></td>`), but no barcode anywhere → only name search; too heavy for that. Could be added later.
- **Life**: "Offline for maintenance" (503) also from a home connection 24.10.2026; earlier 503 to servers.
- **Benu**: no answer (connection fails) 24.10.2026.
- **Apteekki.fi**: a pharmacy finder of the pharmacists' association, not a shop. **Avainapteekit**: WordPress info site, no shop found.
- **Apotek / Apteekkituote / Proteiinikauppa**: no such Finnish domains answer (apotek.fi, apteekkituote.fi, proteiinikauppa.fi/.com).
- **Verkkokauppa.com**: sells a few supplements, 56 product sitemaps × 5000 URLs without categories in the URL; no open API found.
- Small or not supplement shops: Gymstore (equipment), Foodin (food), Elixi (oils), Bioteekki (49 own products, no barcodes),
  Terveyspuoti (Quickbutik, no barcodes found), Vitabalans (manufacturer site, no EAN), Fitshop (equipment), Sokos (403 to servers).
