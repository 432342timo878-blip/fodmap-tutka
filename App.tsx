import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { analyzeIngredients } from './src/analysis/analyze';
import { Product } from './src/api/openFoodFacts';
import { ResultView } from './src/components/ResultView';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { IngredientsScreen } from './src/screens/IngredientsScreen';
import { ScanScreen } from './src/screens/ScanScreen';
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
  saveSettings,
  setOverride,
  Settings,
} from './src/storage';
import { colors } from './src/theme';

type Tab = 'scan' | 'history' | 'check' | 'settings';

type Overlay =
  | { kind: 'result'; product?: Product; text?: string; offline?: boolean; back: Tab }
  | { kind: 'ingredients'; barcode: string; name?: string; text?: string; back: Tab };

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Skannaa', icon: '📷' },
  { id: 'history', label: 'Historia', icon: '🕘' },
  { id: 'check', label: 'Tarkista', icon: '✍️' },
  { id: 'settings', label: 'Asetukset', icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [busy, setBusy] = useState(false);
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
    const analysis = analyzeIngredients(product.ingredientsText, { tolerated: settings.tolerated, productName: product.name });
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
      if ('notFound' in result) setOverlay({ kind: 'ingredients', barcode, back: 'scan' });
      else await showProduct(result.product, 'scan', result.offline);
    } catch {
      Alert.alert('Haku epäonnistui', 'Tuotetietoja ei saatu haettua. Tarkista verkkoyhteys.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Kirjoita ainesosat', onPress: () => setOverlay({ kind: 'ingredients', barcode, back: 'scan' }) },
      ]);
    } finally {
      setBusy(false);
    }
  };

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
    return analyzeIngredients(text, { tolerated: settings.tolerated, productName: overlay.product?.name });
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
        override={product ? overrides[product.barcode] : undefined}
        onOverride={product ? (v) => changeOverride(product.barcode, v) : undefined}
        onEditIngredients={
          product
            ? () => setOverlay({ kind: 'ingredients', barcode: product.barcode, name: product.name, text: product.ingredientsText, back: overlay.back })
            : undefined
        }
        onDone={closeOverlay}
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
        onCancel={closeOverlay}
      />
    );
  } else if (tab === 'scan') {
    content = <ScanScreen busy={busy} onBarcode={handleBarcode} />;
  } else if (tab === 'history') {
    content = <HistoryScreen overrides={overrides} onOpen={openHistoryItem} />;
  } else if (tab === 'check') {
    content = <IngredientsScreen onSubmit={(_, text) => setOverlay({ kind: 'result', text, back: 'check' })} />;
  } else {
    content = <SettingsScreen settings={settings} onChange={changeSettings} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>FODMAP-tutka</Text>
        </View>
        <View style={{ flex: 1 }}>{content}</View>
        {!overlay && (
          <View style={styles.tabBar}>
            {TABS.map((t) => (
              <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
                <Text style={styles.tabIcon}>{t.icon}</Text>
                <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.primaryText },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
});
