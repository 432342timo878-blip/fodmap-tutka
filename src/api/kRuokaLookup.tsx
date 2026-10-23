// K-Ruoka on Cloudflaren takana: tavallinen pyyntö saa 403-vastauksen jopa kotiyhteydeltä.
// Siksi k-ruoka.fi-sivu avataan näkymättömään selaimeen (joka läpäisee tarkistuksen), ja
// tuotetiedot kysytään sivun sisältä K-Ruoan omasta rajapinnasta.
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { kRuokaToProduct } from './groceryApis';
import type { StoreMessage } from './stores';

/** Kauppa, jonka valikoimaa vasten haetaan. Tuotetiedot ovat samat kaikissa kaupoissa. */
const STORE_ID = 'N106';
/** Cloudflaren tarkistus kestää yleensä muutaman sekunnin. */
const CHALLENGE_MAX_MS = 20000;

function script(ean: string): string {
  return `(function () {
  if (window.__fodmapK) return; window.__fodmapK = true;
  var EAN = ${JSON.stringify(ean)};
  var started = Date.now();
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function tick() {
    var head = (document.title + ' ' + ((document.body && document.body.innerText) || '').slice(0, 300)).toLowerCase();
    if (/pyyntö estetty|request blocked|access denied/.test(head)) { post({ type: 'notFound', reason: 'bottisuojaus esti haun' }); return; }
    if (/just a moment|hetkinen|checking your browser|verifying you are human/.test(head)) {
      if (Date.now() - started > ${CHALLENGE_MAX_MS}) { post({ type: 'notFound', reason: 'bottisuojaus ei päästänyt läpi' }); return; }
      setTimeout(tick, 700);
      return;
    }
    fetch('/kr-api/v4/products/' + EAN + '?storeId=${STORE_ID}', { headers: { Accept: 'application/json' }, credentials: 'include' })
      .then(function (r) {
        if (r.status === 404) { post({ type: 'notFound', reason: 'ei valikoimissa' }); return null; }
        if (!r.ok) { post({ type: 'notFound', reason: 'HTTP ' + r.status }); return null; }
        return r.json();
      })
      .then(function (j) { if (j) post({ type: 'kruoka', data: j, url: location.href }); })
      .catch(function (e) { post({ type: 'notFound', reason: 'virhe: ' + e }); });
  }
  tick();
})(); true;`;
}

interface Props {
  barcode: string;
  /** Kutsutaan kerran: tuote tai syy, miksi sitä ei löytynyt. */
  onResult: (message: StoreMessage) => void;
}

export function KRuokaLookup({ barcode, onResult }: Props) {
  const done = useRef(false);
  const finish = (message: StoreMessage) => {
    if (done.current) return;
    done.current = true;
    onResult(message);
  };
  const handle = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'kruoka') finish({ type: 'product', ...kRuokaToProduct(msg.data), url: msg.url });
      else finish({ type: 'notFound', store: 'kruoka', reason: msg.reason ?? 'ei löytynyt' });
    } catch {
      finish({ type: 'notFound', store: 'kruoka', reason: 'virheellinen vastaus' });
    }
  };
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        style={styles.web}
        source={{ uri: `https://www.k-ruoka.fi/kauppa/tuote/${encodeURIComponent(barcode)}` }}
        injectedJavaScript={script(barcode)}
        onMessage={handle}
        onError={() => finish({ type: 'notFound', store: 'kruoka', reason: 'sivu ei latautunut' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Selaimen on oltava "näkyvissä" jotta sivu renderöityy, mutta käyttäjä ei sitä näe.
  hidden: { position: 'absolute', top: 0, left: 0, width: 400, height: 800, opacity: 0, zIndex: -1 },
  web: { position: 'absolute', top: 0, left: 0, width: 400, height: 800 },
});
