# FODMAP-tutka

A personal Android app in Finnish: scan a grocery product's barcode and get an instant verdict on whether it is likely to suit a low-FODMAP (IBS) diet.

- 🟢 **Sopii todennäköisesti**: no known high-FODMAP ingredients
- 🟡 **Varo – annoskoko ratkaisee**: moderate or uncertain ingredients, or a high-FODMAP ingredient in a small amount
- 🔴 **Ei sovi – runsas-FODMAP**: a high-FODMAP main ingredient, or one that causes symptoms even in small amounts (onion, garlic, inulin, polyols…)

The app names the problem ingredients and explains why each one was flagged.

## How it works

1. The camera reads the EAN barcode (`expo-camera`).
2. Product data is fetched from [Open Food Facts](https://fi.openfoodfacts.org) (free, no API key) and cached on the phone. The Finnish ingredient list is used first, with Swedish and English as fallbacks.
3. The ingredient list is parsed (sub-ingredients in parentheses, percentages, "voi sisältää" trace warnings removed) and each ingredient is matched against `src/data/ingredients.ts`.
4. Position and percentage are taken into account: EU ingredient lists are in descending order of weight, so wheat as the first ingredient is red while wheat late in the list is yellow.

If Open Food Facts has no ingredient list, the app looks the product up on **S-kaupat, K-Ruoka and Tokmanni** at the same time, in hidden in-app browsers. This is unofficial: the stores have no public APIs, so it can stop working if their sites change. If that fails too, **photograph the ingredient list**. The text is recognised on the phone, and you can check and correct it before analysis. You can also open S-kaupat inside the app and read the ingredients from any product page.

**Sydänmerkki**:
- The app shows whether the product officially has the mark: from the store page, Open Food Facts, or a name match against the official list, which is refreshed from sydanmerkki.fi on every build.
- It also checks whether the product **would meet** the Sydänmerkki criteria for its product group (fat, saturated fat, sugars, fibre, salt per 100 g). The product group is guessed from the name and categories, and you can change it.
- Nutrition values come from Open Food Facts or the store page, or from a photo of the nutrition table.

Lactose-free products are recognised from the name, from labels and from product lines (Eila, PROfeel). If the package says *laktoositon* but the app missed it, tap **Pakkauksessa lukee: laktoositon**. The app remembers it for that product.

If a product is still not found, type the ingredient list from the package. It is saved for that barcode, so the next scan gives the answer straight away. Products you add to Open Food Facts yourself also help other users.

**Personal settings:** in *Asetukset* you can mark FODMAP groups you tolerate (e.g. lactose), and on any product you can tap 👍/👎 to record your own experience.

## Accuracy

The ingredient dataset was compiled from published FODMAP research. It is **not** copied from the Monash University app and is not clinically verified. It is deliberately conservative: borderline foods are rated "uncertain". Ingredient lists don't give amounts, so the result is guidance, not a guarantee. When something looks wrong, edit the entry in `src/data/ingredients.ts`: each ingredient is one line with Finnish search terms.

## Running it

Requirements: Node 20+ and an Android phone.

```bash
npm install
npm test            # analyzer tests
npx expo start      # then scan the QR code with the Expo Go app on your phone
```

### Installable APK (from your phone)

GitHub builds the APK automatically on every push (`.github/workflows/android-apk.yml`):

1. Open the repository on GitHub → **Actions** → the newest **Android APK** run with a green tick.
2. Under **Artifacts**, tap **FODMAP-tutka-apk** to download a zip.
3. Open the zip in the Files app, tap the `.apk` and allow installing from unknown sources.

New versions install over the old one and keep your history.
