This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `npm test` and `npm run typecheck` before declaring any task done.

## Project layout

- `App.tsx` – tab bar (Skannaa / Historia / Tarkista / Asetukset) and result overlay. No router: the app is small enough for plain state.
- `src/data/ingredients.ts` – the FODMAP ingredient dataset (Finnish, with Swedish/English fallbacks). Edit entries here.
- `src/analysis/` – ingredient-list parser and analyzer (pure TypeScript, covered by `npm test`).
- `src/api/openFoodFacts.ts`, `src/storage.ts` – product lookup and on-device storage.
- `src/api/tokmanni.ts` – Tokmanni lookup by EAN via its Klevu search API and server-rendered product pages (plain fetch; tested).
- `src/api/groceryApis.ts` – S-kaupat GraphQL API (plain fetch from a phone/home IP; also covers Sokos products) and the K-Ruoka response mapper. `src/api/kRuokaLookup.tsx` calls K-Ruoka's `/kr-api/v4/products/<EAN>` from inside a hidden k-ruoka.fi WebView (Cloudflare blocks plain requests). `src/api/directLookup.ts` runs S-kaupat and Tokmanni in parallel. None of these stores can be reached from CI or the cloud session (datacenter IPs are blocked); the request shapes were verified from a home connection.
- `src/api/stores.tsx` – reading store pages by their text ("Ainesosat" / "Ravintosisältö" headings): the in-app store browser (S-kaupat / K-Ruoka / Tokmanni tabs) and pages shared to the app.
- `docs/store-data-findings.md` – what is known about each store's data and blocking. Update it when you learn more.
- `src/analysis/heartCriteria.ts` – Sydänmerkki product-group criteria transcribed from sydanmerkki.fi (10/2026); `nutrition.ts` parses nutrition tables (store pages, OCR).
- `modules/text-recognition/` – local Expo module wrapping ML Kit on-device OCR for photographing ingredient lists.
- `modules/share-intent/` – local Expo module receiving Android "Share" intents (text/URL or image). Shared pages are read with `SharedPageReader` (`src/api/stores.tsx`); supplement labels go to the stack preview, food to the FODMAP result.
- `src/data/sydanmerkki.json` – Sydänmerkki product names, refreshed by `scripts/fetch-sydanmerkki.mjs` in the APK workflow (the site has no barcodes, so products are matched by name).
- `plugins/withScannerFixes.js` – Android config: R8 off (expo-camera looks up ML Kit by class name), Play Store package query, ML Kit model preload.
- The APK is built by `.github/workflows/android-apk.yml`; the user installs it from the run's artifacts.
- `src/data/supplements-db.json` – supplement barcodes + label lines from Finnish health-store Shopify catalogues (Ruohonjuuri, Apteekki360, Puhdas+, Puhdistamo; ~1000 products as of 10/2026), collected by `scripts/fetch-supplements.mjs` in the APK workflow (Actions cache, keyed by ISO week + script hash; counts are printed as `::notice` annotations). Products without barcodes are found by name search. Parsed at runtime by `parseSupplementText`, so parser fixes apply to it. Shops that block datacenter IPs (see `docs/store-data-findings.md`) can't be collected in CI.
- `src/supplements/` – supplement stack: nutrient reference intakes (EU RI) and upper limits (EFSA UL), label parsing (store pages, OCR), and rule-based stack checks (no AI, by the user's choice: no pay-per-use APIs).
- UI text is Finnish.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
