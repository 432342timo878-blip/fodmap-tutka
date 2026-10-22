// Android-asetukset, joita viivakoodinluku tarvitsee release-käännöksessä.
//
// 1. R8-pienennys poistaa ML Kit -luokan, jonka olemassaolon expo-camera tarkistaa
//    nimellä (Class.forName). Silloin sekä oma kamera että Googlen lukija ilmoittavat,
//    ettei viivakoodinluku ole käytettävissä. Pienennys pois päältä.
// 2. Android 11+ piilottaa muut sovellukset, joten expo-camera ei näe Play Kauppaa
//    (com.android.vending) ja päättelee, ettei Google Play -palveluita ole.
// 3. Viivakoodinlukijan ja tekstintunnistuksen mallit ladataan Play-palveluista jo
//    asennuksen yhteydessä, jottei ensimmäinen käyttö kaupassa jää odottamaan latausta.
const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

const PLAY_STORE = 'com.android.vending';
const MLKIT_DEPENDENCIES = 'com.google.mlkit.vision.DEPENDENCIES';

const withScannerFixes = (config) => {
  config = withGradleProperties(config, (cfg) => {
    const key = 'android.enableMinifyInReleaseBuilds';
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === key));
    cfg.modResults.push({ type: 'property', key, value: 'false' });
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [];
    const hasPackage = manifest.queries.some((q) => (q.package ?? []).some((p) => p.$['android:name'] === PLAY_STORE));
    if (!hasPackage) manifest.queries.push({ package: [{ $: { 'android:name': PLAY_STORE } }] });

    const application = manifest.application[0];
    application['meta-data'] = (application['meta-data'] ?? []).filter((m) => m.$['android:name'] !== MLKIT_DEPENDENCIES);
    application['meta-data'].push({ $: { 'android:name': MLKIT_DEPENDENCIES, 'android:value': 'barcode_ui,ocr' } });
    return cfg;
  });

  return config;
};

module.exports = withScannerFixes;
