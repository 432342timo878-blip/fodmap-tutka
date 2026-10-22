// Tuotetiedot S-kaupat.fi-verkkokaupasta.
//
// S-kaupoilla ei ole julkista rajapintaa, ja palvelin torjuu suorat palvelinkutsut.
// Siksi sivu avataan puhelimessa näkymättömään selaimeen (WebView) kuten tavallisessa
// selaimessa, ja ainesosat luetaan sivun tekstistä. Epävirallinen tapa: jos S-kaupat
// muuttaa sivujaan, haku voi lakata toimimasta – silloin tuote kuvataan tai kirjoitetaan.
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

export interface SKaupatProduct {
  name?: string;
  ingredients?: string;
  heartSymbol: boolean;
  url: string;
}

export type SKaupatMessage = ({ type: 'product' } & SKaupatProduct) | { type: 'notFound'; reason: string };

export const S_KAUPAT_HOME = 'https://www.s-kaupat.fi/';
export const sKaupatSearchUrl = (query: string) => `https://www.s-kaupat.fi/hakutulos?queryString=${encodeURIComponent(query)}`;

/**
 * Sivulle ajettava skripti. `ean` on haettava viivakoodi: hakutulossivulta avataan tuote,
 * jonka osoitteessa viivakoodi on. Tyhjällä `ean`:lla luetaan vain nykyinen tuotesivu.
 */
export function extractionScript(ean: string): string {
  return `(function () {
  if (window.__fodmapTutka) return; window.__fodmapTutka = true;
  var EAN = ${JSON.stringify(ean)};
  var started = Date.now();
  var clicked = false;
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }
  var HEADINGS = /^(ainesosat|ravintosisältö|ravintoarvot|tuotetiedot|valmistusmaa|alkuperämaa|säilytys|käyttöohje|allergeenit|valmistaja|lisätiedot|tuotekuvaus|pakkaus)/i;

  function ingredientsFromText() {
    var lines = (document.body.innerText || '').split('\\n').map(clean).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^ainesosat\\s*:?\\s*(.*)$/i);
      if (!m) continue;
      if (m[1].length > 8) return m[1];
      var out = [];
      for (var j = i + 1; j < lines.length && out.length < 4; j++) {
        if (HEADINGS.test(lines[j])) break;
        out.push(lines[j]);
      }
      if (out.join(' ').length > 8) return out.join(' ');
    }
    return null;
  }

  function ingredientsFromDom() {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,button,dt,summary,strong,b,span,p,div');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!/^ainesosat:?$/i.test(clean(el.textContent))) continue;
      var sib = el.nextElementSibling;
      if (sib && clean(sib.textContent).length > 8) return clean(sib.textContent);
      var p = el.parentElement;
      for (var d = 0; d < 3 && p; d++, p = p.parentElement) {
        var t = clean(p.textContent).replace(/^.*?ainesosat:?\\s*/i, '');
        if (t.length > 8 && t.length < 4000) return t;
      }
    }
    return null;
  }

  function expandSections() {
    var nodes = document.querySelectorAll('button,[role="button"],summary,[aria-expanded="false"]');
    for (var i = 0; i < nodes.length; i++) {
      if (/ainesosat|tuotetiedot/i.test(clean(nodes[i].textContent)) && clean(nodes[i].textContent).length < 40) {
        try { nodes[i].click(); } catch (e) {}
      }
    }
  }

  function productArea() {
    var h1 = document.querySelector('h1');
    var el = h1;
    for (var d = 0; d < 6 && el && el.parentElement; d++) el = el.parentElement;
    return el || document.body;
  }

  function tick() {
    var elapsed = Date.now() - started;
    var path = location.pathname;
    if (path.indexOf('/tuote/') >= 0) {
      if (!clicked && elapsed > 1500) { clicked = true; expandSections(); }
      var ingredients = ingredientsFromText() || (clicked ? ingredientsFromDom() : null);
      var h1 = document.querySelector('h1');
      if (ingredients || elapsed > 9000) {
        var area = productArea();
        var heart = /sydänmerkki/i.test(area.innerText || '') || !!area.querySelector('img[alt*="ydänmerk"], img[alt*="ydanmerk"]');
        post({ type: 'product', name: h1 ? clean(h1.innerText) : undefined, ingredients: ingredients || undefined, heartSymbol: heart, url: location.href });
        return;
      }
    } else if (EAN) {
      var links = document.querySelectorAll('a[href*="/tuote/"]');
      for (var i = 0; i < links.length; i++) {
        if (links[i].href.indexOf(EAN) >= 0) { location.href = links[i].href; started = Date.now(); return setTimeout(tick, 800); }
      }
      if (elapsed > 9000) { post({ type: 'notFound', reason: links.length ? 'ei samaa viivakoodia' : 'ei hakutuloksia' }); return; }
    } else {
      post({ type: 'notFound', reason: 'ei tuotesivua' });
      return;
    }
    setTimeout(tick, 500);
  }
  tick();
})(); true;`;
}

interface FetcherProps {
  barcode: string;
  onResult: (message: SKaupatMessage) => void;
}

/** Näkymätön selain, joka hakee yhden tuotteen tiedot ja ilmoittaa tuloksen kerran. */
export function SKaupatFetcher({ barcode, onResult }: FetcherProps) {
  const done = useRef(false);
  const finish = (message: SKaupatMessage) => {
    if (done.current) return;
    done.current = true;
    onResult(message);
  };
  const script = extractionScript(barcode);
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        source={{ uri: sKaupatSearchUrl(barcode) }}
        injectedJavaScript={script}
        onMessage={(e: WebViewMessageEvent) => finish(parseMessage(e))}
        onError={() => finish({ type: 'notFound', reason: 'sivu ei latautunut' })}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 400) finish({ type: 'notFound', reason: `HTTP ${e.nativeEvent.statusCode}` });
        }}
      />
    </View>
  );
}

export function parseMessage(e: WebViewMessageEvent): SKaupatMessage {
  try {
    return JSON.parse(e.nativeEvent.data) as SKaupatMessage;
  } catch {
    return { type: 'notFound', reason: 'virheellinen vastaus' };
  }
}

const styles = StyleSheet.create({
  // Selaimen on oltava "näkyvissä" jotta sivu renderöityy, mutta käyttäjä ei sitä näe.
  hidden: { position: 'absolute', top: 0, left: 0, width: 400, height: 800, opacity: 0, zIndex: -1 },
});
