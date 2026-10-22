import { ComponentType, Ref, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';

import { extractionScript, parseMessage, SKaupatProduct, sKaupatSearchUrl } from '../api/sKaupat';
import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  query: string;
  onFound: (product: SKaupatProduct) => void;
  onCancel: () => void;
}

interface WebViewHandle {
  injectJavaScript: (script: string) => void;
}
// Kirjaston tyypit eivät kerro, että Android-WebView ottaa ref-viittauksen (forwardRef).
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** S-kaupat.fi sovelluksen sisällä: käyttäjä etsii tuotteen ja sovellus lukee ainesosat sivulta. */
export function SKaupatBrowserScreen({ query, onFound, onCancel }: Props) {
  const web = useRef<WebViewHandle>(null);
  const [reading, setReading] = useState(false);

  const read = () => {
    setReading(true);
    // Sama skripti kuin automaattisessa haussa, mutta vain nykyiseltä sivulta.
    web.current?.injectJavaScript(`window.__fodmapTutka = false; ${extractionScript('')}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.help}>Avaa oikea tuote ja paina alta "Lue ainesosat".</Text>
      <RefWebView
        ref={web}
        source={{ uri: sKaupatSearchUrl(query) }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} />}
        onMessage={(e: WebViewMessageEvent) => {
          setReading(false);
          const message = parseMessage(e);
          if (message.type === 'product' && message.ingredients) onFound(message);
          else Alert.alert('Ainesosia ei löytynyt', 'Avaa ensin tuotteen oma sivu ja yritä uudelleen.');
        }}
      />
      <View style={styles.bar}>
        <Button label="Peruuta" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button label={reading ? 'Luetaan…' : 'Lue ainesosat'} onPress={read} disabled={reading} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  help: { padding: 10, fontSize: 14, color: colors.text, backgroundColor: colors.yellowBg },
  bar: { flexDirection: 'row', gap: 10, padding: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
