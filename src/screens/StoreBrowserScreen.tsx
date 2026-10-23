import { ComponentType, Ref, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';

import { extractionScript, parseMessage, StoreId, StoreProduct, STORES, STORE_BY_ID } from '../api/stores';
import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  query: string;
  onFound: (product: StoreProduct) => void;
  onCancel: () => void;
}

interface WebViewHandle {
  injectJavaScript: (script: string) => void;
}
// Kirjaston tyypit eivät kerro, että Android-WebView ottaa ref-viittauksen (forwardRef).
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** Verkkokauppa sovelluksen sisällä: käyttäjä etsii tuotteen ja sovellus lukee tiedot sivulta. */
export function StoreBrowserScreen({ query, onFound, onCancel }: Props) {
  const web = useRef<WebViewHandle>(null);
  const [storeId, setStoreId] = useState<StoreId>('skaupat');
  const [reading, setReading] = useState(false);
  const store = STORE_BY_ID[storeId];

  const read = () => {
    setReading(true);
    // Sama skripti kuin automaattisessa haussa, mutta vain nykyiseltä sivulta.
    web.current?.injectJavaScript(`window.__fodmapTutka = false; ${extractionScript(store, '')}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        {STORES.map((s) => (
          <Pressable key={s.id} onPress={() => setStoreId(s.id)} style={[styles.tab, s.id === storeId && styles.tabActive]}>
            <Text style={[styles.tabText, s.id === storeId && styles.tabTextActive]}>{s.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.help}>Avaa oikea tuote ja paina alta "Lue tiedot".</Text>
      <RefWebView
        key={storeId}
        ref={web}
        source={{ uri: store.searchUrl(query) }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} />}
        onMessage={(e: WebViewMessageEvent) => {
          setReading(false);
          const message = parseMessage(e, storeId);
          if (message.type === 'product' && (message.ingredients || message.nutritionText)) onFound(message);
          else Alert.alert('Tietoja ei löytynyt', 'Avaa ensin tuotteen oma sivu ja yritä uudelleen.');
        }}
      />
      <View style={styles.bar}>
        <Button label="Peruuta" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button label={reading ? 'Luetaan…' : 'Lue tiedot'} onPress={read} disabled={reading} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabText: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  help: { padding: 10, fontSize: 14, color: colors.text, backgroundColor: colors.yellowBg },
  bar: { flexDirection: 'row', gap: 10, padding: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
