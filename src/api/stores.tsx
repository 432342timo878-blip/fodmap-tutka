// Tuotetiedot suomalaisista verkkokaupoista: S-kaupat, K-Ruoka ja Tokmanni.
//
// Kaupoilla ei ole julkisia rajapintoja, ja niiden palvelimet torjuvat suorat palvelinkutsut.
// Siksi sivut avataan puhelimessa näkymättömään selaimeen (WebView) kuten tavallisessa
// selaimessa, ja ainesosat ja ravintosisältö luetaan sivun tekstistä. Epävirallinen tapa:
// jos kauppa muuttaa sivujaan, haku voi lakata toimimasta – silloin tuote kuvataan.
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

export type StoreId = 'skaupat' | 'kruoka' | 'tokmanni';

export interface Store {
  id: StoreId;
  name: string;
  host: string;
  searchUrl: (query: string) => string;
  /** Tuotesivun polku. Tokmannin tuotesivuilla ei ole tunnistettavaa polkua. */
  productPath?: RegExp;
  /** CSS-valitsin hakutulosten tuotelinkeille. */
  resultLinks: string;
}

export const STORES: Store[] = [
  {
    id: 'skaupat',
    name: 'S-kaupat',
    host: 'www.s-kaupat.fi',
    searchUrl: (q) => `https://www.s-kaupat.fi/hakutulos?queryString=${encodeURIComponent(q)}`,
    productPath: /\/tuote\//,
    resultLinks: 'a[href*="/tuote/"]',
  },
  {
    id: 'kruoka',
    name: 'K-Ruoka',
    host: 'www.k-ruoka.fi',
    searchUrl: (q) => `https://www.k-ruoka.fi/haku?q=${encodeURIComponent(q)}`,
    productPath: /\/tuote\//,
    resultLinks: 'a[href*="/tuote/"]',
  },
  {
    id: 'tokmanni',
    name: 'Tokmanni',
    host: 'www.tokmanni.fi',
    searchUrl: (q) => `https://www.tokmanni.fi/search/?q=${encodeURIComponent(q)}`,
    // Haku tehdään Klevu-palvelulla, joka piirtää tulokset sivulle vasta selaimessa.
    resultLinks: 'a.klevuProductClick, .klevuProduct a[href], [class*="kuProd"] a[href], a.product-item-link',
  },
];

export const STORE_BY_ID = Object.fromEntries(STORES.map((s) => [s.id, s])) as Record<StoreId, Store>;

export interface StoreProduct {
  store: StoreId;
  name?: string;
  ingredients?: string;
  nutritionText?: string;
  heartSymbol: boolean;
  url: string;
}

export type StoreMessage = ({ type: 'product' } & StoreProduct) | { type: 'notFound'; store: StoreId; reason: string };

/**
 * Sivulle ajettava skripti. Hakutulossivulta avataan tuote (viivakoodi osoitteessa, tai
 * ensimmäinen tulos, jonka sivulta viivakoodi tarkistetaan). Tyhjällä `ean`:lla luetaan vain
 * nykyinen sivu (käyttäjä selaa itse).
 */
export function extractionScript(store: Store, ean: string): string {
  const config = { id: store.id, productPath: store.productPath?.source ?? null, links: store.resultLinks };
  return `(function () {
  if (window.__fodmapTutka) return; window.__fodmapTutka = true;
  var STORE = ${JSON.stringify(config)};
  var EAN = ${JSON.stringify(ean)};
  var started = Date.now();
  var expanded = false;
  function post(o) { o.store = STORE.id; window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }
  function session(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  var HEADINGS = /^(ainesosat|ainekset|raaka-aineet|ravintosisältö|ravintoarvot|ravintoarvo|tuotetiedot|valmistusmaa|alkuperämaa|säilytys|käyttöohje|allergeenit|valmistaja|lisätiedot|tuotekuvaus|pakkaus|kuvaus|hinta)/i;
  var INGREDIENTS = /^(ainesosat|ainekset|raaka-aineet|ainesosaluettelo)\\s*:?\\s*(.*)$/i;
  var NUTRITION = /^(ravintosisältö|ravintoarvot|ravintoarvo|ravintoaineet)/i;

  function lines() { return (document.body.innerText || '').split('\\n').map(clean).filter(Boolean); }

  function ingredientsFromText(ls) {
    for (var i = 0; i < ls.length; i++) {
      var m = ls[i].match(INGREDIENTS);
      if (!m) continue;
      if (m[2].length > 8) return m[2];
      var out = [];
      for (var j = i + 1; j < ls.length && out.length < 4; j++) { if (HEADINGS.test(ls[j])) break; out.push(ls[j]); }
      if (out.join(' ').length > 8) return out.join(' ');
    }
    return null;
  }

  function ingredientsFromDom() {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,button,dt,summary,strong,b,span,p,div');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!/^(ainesosat|ainekset|raaka-aineet):?$/i.test(clean(el.textContent))) continue;
      var sib = el.nextElementSibling;
      if (sib && clean(sib.textContent).length > 8) return clean(sib.textContent);
      var p = el.parentElement;
      for (var d = 0; d < 3 && p; d++, p = p.parentElement) {
        var t = clean(p.textContent).replace(/^.*?(ainesosat|ainekset|raaka-aineet):?\\s*/i, '');
        if (t.length > 8 && t.length < 4000) return t;
      }
    }
    return null;
  }

  function nutritionFromText(ls) {
    for (var i = 0; i < ls.length; i++) {
      if (!NUTRITION.test(ls[i])) continue;
      var out = [ls[i]];
      for (var j = i + 1; j < ls.length && out.length < 40; j++) {
        if (HEADINGS.test(ls[j]) && !NUTRITION.test(ls[j])) break;
        out.push(ls[j]);
      }
      if (out.length > 2) return out.join('\\n');
    }
    return null;
  }

  function expandSections() {
    var nodes = document.querySelectorAll('button,[role="button"],summary,[aria-expanded="false"]');
    for (var i = 0; i < nodes.length; i++) {
      var t = clean(nodes[i].textContent);
      if (t.length < 40 && /ainesosat|ainekset|tuotetiedot|ravinto/i.test(t)) { try { nodes[i].click(); } catch (e) {} }
    }
  }

  function productArea() {
    var el = document.querySelector('h1');
    for (var d = 0; d < 6 && el && el.parentElement; d++) el = el.parentElement;
    return el || document.body;
  }

  function isProductPage() {
    if (!EAN) return true;
    if (STORE.productPath && new RegExp(STORE.productPath).test(location.pathname)) return true;
    return session('__fodmapStage') === 'product' && !/search|haku|hakutulos/i.test(location.pathname);
  }

  function tick() {
    var elapsed = Date.now() - started;
    if (isProductPage()) {
      if (!expanded && elapsed > 1500) { expanded = true; expandSections(); }
      var ls = lines();
      var ingredients = ingredientsFromText(ls) || (expanded ? ingredientsFromDom() : null);
      var needsCheck = EAN && session('__fodmapVerify') === '1';
      var verified = !needsCheck || document.documentElement.innerHTML.indexOf(EAN) >= 0;
      if ((ingredients && verified && elapsed > 2500) || elapsed > 9000) {
        if (!verified) { post({ type: 'notFound', reason: 'viivakoodi ei täsmää' }); return; }
        var area = productArea();
        var h1 = document.querySelector('h1');
        post({
          type: 'product',
          name: h1 ? clean(h1.innerText) : undefined,
          ingredients: ingredients || undefined,
          nutritionText: nutritionFromText(ls) || undefined,
          heartSymbol: /sydänmerkki/i.test(area.innerText || '') || !!area.querySelector('img[alt*="ydänmerk"], img[alt*="ydanmerk"]'),
          url: location.href,
        });
        return;
      }
    } else {
      var links = document.querySelectorAll(STORE.links);
      var hrefs = [];
      for (var i = 0; i < links.length; i++) if (links[i].href && hrefs.indexOf(links[i].href) < 0) hrefs.push(links[i].href);
      for (var k = 0; k < hrefs.length; k++) {
        if (hrefs[k].indexOf(EAN) >= 0) { session('__fodmapStage', 'product'); session('__fodmapVerify', '0'); location.href = hrefs[k]; return; }
      }
      // Odotetaan hetki, että hakutulokset ehtivät sivulle, ja avataan ensimmäinen tarkistettavaksi.
      if (hrefs.length > 0 && elapsed > 3500) { session('__fodmapStage', 'product'); session('__fodmapVerify', '1'); location.href = hrefs[0]; return; }
      if (elapsed > 9000) { post({ type: 'notFound', reason: 'ei hakutuloksia' }); return; }
    }
    setTimeout(tick, 500);
  }
  tick();
})(); true;`;
}

export function parseMessage(e: WebViewMessageEvent, store: StoreId): StoreMessage {
  try {
    return JSON.parse(e.nativeEvent.data) as StoreMessage;
  } catch {
    return { type: 'notFound', store, reason: 'virheellinen vastaus' };
  }
}

interface LookupProps {
  barcode: string;
  /** Kutsutaan kerran: ensimmäinen kauppa, josta ainesosat löytyvät, tai notFound kun kaikki ovat vastanneet. */
  onResult: (message: StoreMessage) => void;
}

/** Hakee tuotetta kaikista kaupoista yhtä aikaa näkymättömillä selaimilla. */
export function StoreLookup({ barcode, onResult }: LookupProps) {
  const done = useRef(false);
  const failed = useRef(new Set<StoreId>());
  const handle = (message: StoreMessage) => {
    if (done.current) return;
    if (message.type === 'product' && message.ingredients) {
      done.current = true;
      onResult(message);
      return;
    }
    failed.current.add(message.store);
    if (failed.current.size === STORES.length) {
      done.current = true;
      onResult({ type: 'notFound', store: message.store, reason: 'ei löytynyt mistään kaupasta' });
    }
  };
  return (
    <View style={styles.hidden} pointerEvents="none">
      {STORES.map((store) => (
        <WebView
          key={store.id}
          style={styles.web}
          source={{ uri: store.searchUrl(barcode) }}
          injectedJavaScript={extractionScript(store, barcode)}
          onMessage={(e: WebViewMessageEvent) => handle(parseMessage(e, store.id))}
          onError={() => handle({ type: 'notFound', store: store.id, reason: 'sivu ei latautunut' })}
          onHttpError={(e) => {
            // Vain pääsivun virhe ratkaisee; esim. mainosten latausvirheet eivät.
            if (e.nativeEvent.statusCode >= 400 && e.nativeEvent.url.includes(store.host)) {
              handle({ type: 'notFound', store: store.id, reason: `HTTP ${e.nativeEvent.statusCode}` });
            }
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Selainten on oltava "näkyvissä" jotta sivut renderöityvät, mutta käyttäjä ei niitä näe.
  hidden: { position: 'absolute', top: 0, left: 0, width: 400, height: 800, opacity: 0, zIndex: -1 },
  web: { position: 'absolute', top: 0, left: 0, width: 400, height: 800 },
});
