import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { analyzeIngredients } from './src/analysis/analyze';
import { createHeartSymbolMatcher } from './src/analysis/heartSymbol';
import { Product } from './src/api/openFoodFacts';
import { SKaupatFetcher, SKaupatMessage, SKaupatProduct } from './src/api/sKaupat';
import { ResultView } from './src/components/ResultView';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { IngredientsScreen } from './src/screens/IngredientsScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { SKaupatBrowserScreen } from './src/screens/SKaupatBrowserScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  addToHistory,
  getCachedProduct,
  getOverrides,
  getSettings,
  HistoryItem,
  lookupProduct,
  Override,
  saveManualProduct,
  saveProduct,
  saveSettings,
  setOverride,
  Settings,
} from './src/storage';
import { colors } from './src/theme';
import { useKeyboardHeight } from './src/useKeyboardHeight';
import heartSymbolData from './src/data/sydanmerkki.json';

type Tab = 'scan' | 'history' | 'check' | 'settings';

type Overlay =
  | { kind: 'result'; product?: Product; text?: string; offline?: boolean; back: Tab }
  | { kind: 'ingredients'; barcode: string; name?: string; text?: string; back: Tab }
  | { kind: 'skaupat'; barcode: string; back: Tab };

/** Automaattinen S-kaupat-haku saa kestää tämän verran ennen kuin luovutetaan. */
const S_KAUPAT_TIMEOUT_MS = 25000;

const isHeartSymbolProduct = createHeartSymbolMatcher(heartSymbolData.products);

/** Nimi ja merkinnät analyysille: kertovat mm. laktoosittomuudesta. */
function productContext(product?: Product): string | undefined {
  if (!product) return undefined;
  return [product.brand, product.name, ...(product.labels ?? []), product.lactoseFree ? 'laktoositon' : ''].filter(Boolean).join(' ');
}

function heartSymbolSource(product?: Product): string | null {
  if (!product) return null;
  if (product.heartSymbol) return 'S-kaupat-sivun mukaan';
  if (product.labels?.some((l) => /syd[aä]nmerk|heart-symbol/.test(l))) return 'Open Food Facts -merkinnän mukaan';
  if (isHeartSymbolProduct(`${product.brand ?? ''} ${product.name}`)) return 'Tuotenimi löytyy Sydänmerkki-tuotteiden listalta';
  return null;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Skannaa', icon: '📷' },
  { id: 'history', label: 'Historia', icon: '🕘' },
  { id: 'check', label: 'Tarkista', icon: '✍️' },
  { id: 'settings', label: 'Asetukset', icon: '⚙️' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [launchRequest, setLaunchRequest] = useState(0);
  const [tab, setTab] = useState<Tab>('scan');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [busy, setBusy] = useState(false);
  const [sKaupatLookup, setSKaupatLookup] = useState<{ barcode: string; partial?: Product; offline?: boolean } | null>(null);
  const [settings, setSettings] = useState<Settings>({ tolerated: [] });
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  useEffect(() => {
    getSettings().then(setSettings);
    getOverrides().then(setOverrides);
  }, []);

  const closeOverlay = () => {
    if (overlay) setTab(overlay.back);
    setOverlay(null);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!overlay) return false;
      closeOverlay();
      return true;
    });
    return () => sub.remove();
  });

  const showProduct = async (product: Product, back: Tab, offline?: boolean) => {
    const analysis = analyzeIngredients(product.ingredientsText, { tolerated: settings.tolerated, productName: productContext(product) });
    await addToHistory({
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      verdict: analysis.verdict,
      scannedAt: Date.now(),
    });
    setOverlay({ kind: 'result', product, offline, back });
  };

  const handleBarcode = async (barcode: string) => {
    setBusy(true);
    try {
      const result = await lookupProduct(barcode);
      if (!('notFound' in result) && result.product.ingredientsText) {
        await showProduct(result.product, 'scan', result.offline);
        setBusy(false);
      } else {
        // Ainesosat puuttuvat Open Food Factsista – kokeillaan S-kauppoja (busy jatkuu).
        const partial = 'notFound' in result ? undefined : result.product;
        setSKaupatLookup({ barcode, partial, offline: 'notFound' in result ? undefined : result.offline });
      }
    } catch {
      setBusy(false);
      Alert.alert('Haku epäonnistui', 'Tuotetietoja ei saatu haettua. Tarkista verkkoyhteys.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Kuvaa ainesosat', onPress: () => setOverlay({ kind: 'ingredients', barcode, back: 'scan' }) },
      ]);
    }
  };

  /** Yhdistää S-kaupat-sivulta luetut tiedot aiempiin ja tallentaa ne. */
  const saveSKaupatProduct = async (barcode: string, found: SKaupatProduct, partial?: Product | null) => {
    const product: Product = {
      ...partial,
      barcode,
      name: found.name || partial?.name || 'Nimetön tuote',
      ingredientsText: found.ingredients,
      heartSymbol: found.heartSymbol || undefined,
      source: 'skaupat',
      fetchedAt: Date.now(),
    };
    await saveProduct(product);
    return product;
  };

  const finishSKaupatLookup = async (message: SKaupatMessage) => {
    const lookup = sKaupatLookup;
    if (!lookup) return;
    setSKaupatLookup(null);
    try {
      if (message.type === 'product' && message.ingredients) {
        await showProduct(await saveSKaupatProduct(lookup.barcode, message, lookup.partial), 'scan');
      } else if (lookup.partial) {
        await showProduct(lookup.partial, 'scan', lookup.offline);
      } else {
        setOverlay({ kind: 'ingredients', barcode: lookup.barcode, back: 'scan' });
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!sKaupatLookup) return;
    const timer = setTimeout(() => finishSKaupatLookup({ type: 'notFound', reason: 'aikakatkaisu' }), S_KAUPAT_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sKaupatLookup]);

  const openHistoryItem = async (item: HistoryItem) => {
    const product = await getCachedProduct(item.barcode);
    if (product) setOverlay({ kind: 'result', product, back: 'history' });
    else setOverlay({ kind: 'ingredients', barcode: item.barcode, name: item.name, back: 'history' });
  };

  const submitIngredients = async (barcode: string, name: string, text: string, back: Tab) => {
    const product = await saveManualProduct(barcode, name, text);
    await showProduct(product, back);
  };

  const changeOverride = async (barcode: string, value: Override | null) => {
    await setOverride(barcode, value);
    setOverrides(await getOverrides());
  };

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const analysis = useMemo(() => {
    if (overlay?.kind !== 'result') return null;
    const text = overlay.product?.ingredientsText ?? overlay.text;
    return analyzeIngredients(text, { tolerated: settings.tolerated, productName: productContext(overlay.product) });
  }, [overlay, settings.tolerated]);

  let content: ReactNode;
  if (overlay?.kind === 'result' && analysis) {
    const { product } = overlay;
    content = (
      <ResultView
        product={product}
        ingredientsText={overlay.text}
        analysis={analysis}
        offline={overlay.offline}
        heartSymbol={heartSymbolSource(product)}
        onMarkLactoseFree={
          product
            ? async () => {
                const updated = { ...product, lactoseFree: true };
                await saveProduct(updated);
                setOverlay({ ...overlay, product: updated });
              }
            : undefined
        }
        override={product ? overrides[product.barcode] : undefined}
        onOverride={product ? (v) => changeOverride(product.barcode, v) : undefined}
        onEditIngredients={
          product
            ? () => setOverlay({ kind: 'ingredients', barcode: product.barcode, name: product.name, text: product.ingredientsText, back: overlay.back })
            : undefined
        }
        onDone={() => {
          closeOverlay();
          if (overlay.back === 'scan') setLaunchRequest((n) => n + 1);
        }}
        doneLabel={overlay.back === 'scan' ? 'Skannaa seuraava' : 'Takaisin'}
      />
    );
  } else if (overlay?.kind === 'ingredients') {
    content = (
      <IngredientsScreen
        key={overlay.barcode}
        barcode={overlay.barcode}
        initialName={overlay.name}
        initialText={overlay.text}
        onSubmit={(name, text) => submitIngredients(overlay.barcode, name, text, overlay.back)}
        onSearchSKaupat={() => setOverlay({ kind: 'skaupat', barcode: overlay.barcode, back: overlay.back })}
        onCancel={closeOverlay}
      />
    );
  } else if (overlay?.kind === 'skaupat') {
    content = (
      <SKaupatBrowserScreen
        query={overlay.barcode}
        onFound={async (found) => {
          const product = await saveSKaupatProduct(overlay.barcode, found, await getCachedProduct(overlay.barcode));
          await showProduct(product, overlay.back);
        }}
        onCancel={() => setOverlay({ kind: 'ingredients', barcode: overlay.barcode, back: overlay.back })}
      />
    );
  } else if (tab === 'scan') {
    content = <ScanScreen busy={busy} onBarcode={handleBarcode} launchRequest={launchRequest} />;
  } else if (tab === 'history') {
    content = <HistoryScreen overrides={overrides} onOpen={openHistoryItem} />;
  } else if (tab === 'check') {
    content = <IngredientsScreen onSubmit={(_, text) => setOverlay({ kind: 'result', text, back: 'check' })} />;
  } else {
    content = <SettingsScreen settings={settings} onChange={changeSettings} />;
  }

  const keyboardOpen = keyboardHeight > 0;
  return (
    // Näppäimistön korkeus ei sisällä navigointipalkkia, joten alareunan tila lisätään aina.
    <View style={[styles.root, { paddingBottom: insets.bottom + keyboardHeight }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>FODMAP-tutka</Text>
      </View>
      <View style={styles.content}>{content}</View>
      {sKaupatLookup && <SKaupatFetcher key={sKaupatLookup.barcode} barcode={sKaupatLookup.barcode} onResult={finishSKaupatLookup} />}
      {!overlay && !keyboardOpen && (
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.primaryText },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
});
