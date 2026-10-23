import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { analyzeIngredients } from './src/analysis/analyze';
import { assessHeartSymbol, classifyHeartGroup, HEART_GROUP_BY_ID } from './src/analysis/heartCriteria';
import { createHeartSymbolMatcher } from './src/analysis/heartSymbol';
import { hasNutrition, parseNutritionText } from './src/analysis/nutrition';
import { Product } from './src/api/openFoodFacts';
import { STORE_BY_ID, StoreLookup, StoreMessage, StoreProduct } from './src/api/stores';
import { HeartSection } from './src/components/HeartSection';
import { ResultView } from './src/components/ResultView';
import { photographNutrition } from './src/ocr';
import { HeartGroupScreen } from './src/screens/HeartGroupScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { IngredientsScreen } from './src/screens/IngredientsScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SupplementEditScreen } from './src/screens/SupplementEditScreen';
import { SupplementsScreen } from './src/screens/SupplementsScreen';
import { scanBarcodeOnce } from './src/scanner';
import { Supplement } from './src/supplements/assess';
import { parseSupplementText } from './src/supplements/nutrients';
import { StoreBrowserScreen } from './src/screens/StoreBrowserScreen';
import {
  addToHistory,
  getCachedProduct,
  getOverrides,
  getSettings,
  getSupplements,
  HistoryItem,
  lookupProduct,
  Override,
  saveManualProduct,
  saveProduct,
  saveSettings,
  saveSupplements,
  setOverride,
  Settings,
} from './src/storage';
import { colors } from './src/theme';
import { useKeyboardHeight } from './src/useKeyboardHeight';
import heartSymbolData from './src/data/sydanmerkki.json';

type Tab = 'scan' | 'supplements' | 'history' | 'check' | 'settings';

type Overlay =
  | { kind: 'result'; product?: Product; text?: string; offline?: boolean; back: Tab }
  | { kind: 'ingredients'; barcode: string; name?: string; text?: string; back: Tab }
  | { kind: 'stores'; barcode: string; back: Tab }
  | { kind: 'heartGroup'; product: Product; back: Tab }
  | { kind: 'supplementEdit'; draft: Supplement; isNew: boolean; needsLabel?: boolean; back: Tab };

/** Automaattinen verkkokauppahaku saa kestää tämän verran ennen kuin luovutetaan. */
const STORE_LOOKUP_TIMEOUT_MS = 25000;

const isHeartSymbolProduct = createHeartSymbolMatcher(heartSymbolData.products);

/** Nimi ja merkinnät analyysille: kertovat mm. laktoosittomuudesta. */
function productContext(product?: Product): string | undefined {
  if (!product) return undefined;
  return [product.brand, product.name, ...(product.labels ?? []), product.lactoseFree ? 'laktoositon' : ''].filter(Boolean).join(' ');
}

function heartSymbolSource(product?: Product): string | null {
  if (!product) return null;
  if (product.heartSymbol) return product.source in STORE_BY_ID ? `${STORE_BY_ID[product.source as keyof typeof STORE_BY_ID].name}-sivun mukaan` : 'Kaupan sivun mukaan';
  if (product.labels?.some((l) => /syd[aä]nmerk|heart-symbol/.test(l))) return 'Open Food Facts -merkinnän mukaan';
  if (isHeartSymbolProduct(`${product.brand ?? ''} ${product.name}`)) return 'Tuotenimi löytyy Sydänmerkki-tuotteiden listalta';
  return null;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Skannaa', icon: '📷' },
  { id: 'supplements', label: 'Lisäravinteet', icon: '💊' },
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
  const [storeLookup, setStoreLookup] = useState<{
    barcode: string;
    /** Ruoka: ainesosat FODMAP-arvioon. Lisäravinne: vitamiinitaulukko pinoon. */
    purpose: 'food' | 'supplement';
    partial?: Product;
    offline?: boolean;
  } | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [settings, setSettings] = useState<Settings>({ tolerated: [] });
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  useEffect(() => {
    getSettings().then(setSettings);
    getOverrides().then(setOverrides);
    getSupplements().then(setSupplements);
  }, []);

  const closeOverlay = () => {
    // Alinäkymistä palataan edelliseen näkymään, muista välilehdelle.
    if (overlay?.kind === 'heartGroup') return setOverlay({ kind: 'result', product: overlay.product, back: overlay.back });
    if (overlay?.kind === 'stores') return setOverlay({ kind: 'ingredients', barcode: overlay.barcode, back: overlay.back });
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
        // Ainesosat puuttuvat Open Food Factsista – kokeillaan verkkokauppoja (busy jatkuu).
        const partial = 'notFound' in result ? undefined : result.product;
        setStoreLookup({ barcode, purpose: 'food', partial, offline: 'notFound' in result ? undefined : result.offline });
      }
    } catch {
      setBusy(false);
      Alert.alert('Haku epäonnistui', 'Tuotetietoja ei saatu haettua. Tarkista verkkoyhteys.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Kuvaa ainesosat', onPress: () => setOverlay({ kind: 'ingredients', barcode, back: 'scan' }) },
      ]);
    }
  };

  /** Yhdistää verkkokaupan sivulta luetut tiedot aiempiin ja tallentaa ne. */
  const saveStoreProduct = async (barcode: string, found: StoreProduct, partial?: Product | null) => {
    const nutrition = found.nutritionText ? parseNutritionText(found.nutritionText) : undefined;
    const product: Product = {
      ...partial,
      barcode,
      name: found.name || partial?.name || 'Nimetön tuote',
      ingredientsText: found.ingredients ?? partial?.ingredientsText,
      nutrition: hasNutrition(nutrition) ? nutrition : partial?.nutrition,
      heartSymbol: found.heartSymbol || partial?.heartSymbol || undefined,
      source: found.ingredients ? found.store : (partial?.source ?? found.store),
      fetchedAt: Date.now(),
    };
    await saveProduct(product);
    return product;
  };

  const finishStoreLookup = async (message: StoreMessage) => {
    const lookup = storeLookup;
    if (!lookup) return;
    setStoreLookup(null);
    if (lookup.purpose === 'supplement') {
      setBusy(false);
      const found = message.type === 'product' ? message : undefined;
      const label = parseSupplementText(`${found?.nutritionText ?? ''}\n${found?.pageText ?? ''}`);
      const hasLabel = Object.keys(label.amounts).length > 0;
      openNewSupplement(
        {
          barcode: lookup.barcode,
          name: lookup.partial?.name ?? found?.name ?? '',
          brand: lookup.partial?.brand,
          ingredientsText: lookup.partial?.ingredientsText ?? found?.ingredients,
          amounts: label.amounts,
          doseUnits: label.doseUnits ?? 1,
          unitsPerDay: label.doseUnits ?? 1,
        },
        !hasLabel,
      );
      return;
    }
    try {
      if (message.type === 'product' && message.ingredients) {
        await showProduct(await saveStoreProduct(lookup.barcode, message, lookup.partial), 'scan');
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
    if (!storeLookup) return;
    const timer = setTimeout(() => finishStoreLookup({ type: 'notFound', store: 'skaupat', reason: 'aikakatkaisu' }), STORE_LOOKUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLookup]);

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

  const openNewSupplement = (fields: Omit<Supplement, 'id'>, needsLabel: boolean) => {
    const draft: Supplement = { ...fields, id: `${Date.now()}` };
    setOverlay({ kind: 'supplementEdit', draft, isNew: true, needsLabel, back: 'supplements' });
  };

  const scanSupplement = async () => {
    let barcode: string | null;
    try {
      barcode = await scanBarcodeOnce();
    } catch {
      Alert.alert('Viivakoodinlukija ei käynnistynyt', 'Lisää lisäravinne ilman viivakoodia ja kuvaa sen vitamiinitaulukko.');
      return;
    }
    if (!barcode) return;
    const existing = supplements.find((s) => s.barcode === barcode);
    if (existing) {
      setOverlay({ kind: 'supplementEdit', draft: existing, isNew: false, back: 'supplements' });
      return;
    }
    setBusy(true);
    // Nimi ja ainesosat Open Food Factsista, vitamiinitaulukko verkkokaupoista.
    let partial: Product | undefined;
    try {
      const result = await lookupProduct(barcode);
      if (!('notFound' in result)) partial = result.product;
    } catch {
      // Verkkokaupat yritetään silti.
    }
    setStoreLookup({ barcode, purpose: 'supplement', partial });
  };

  const saveSupplement = async (s: Supplement) => {
    const next = supplements.some((x) => x.id === s.id) ? supplements.map((x) => (x.id === s.id ? s : x)) : [...supplements, s];
    setSupplements(next);
    await saveSupplements(next);
    closeOverlay();
  };

  const deleteSupplement = async (id: string) => {
    const next = supplements.filter((x) => x.id !== id);
    setSupplements(next);
    await saveSupplements(next);
    closeOverlay();
  };

  const analysis = useMemo(() => {
    if (overlay?.kind !== 'result') return null;
    const text = overlay.product?.ingredientsText ?? overlay.text;
    return analyzeIngredients(text, { tolerated: settings.tolerated, productName: productContext(overlay.product) });
  }, [overlay, settings.tolerated]);

  let content: ReactNode;
  if (overlay?.kind === 'result' && analysis) {
    const { product } = overlay;
    const updateProduct = async (updated: Product) => {
      await saveProduct(updated);
      setOverlay({ ...overlay, product: updated });
    };
    const heartGroup = product
      ? product.heartGroup
        ? HEART_GROUP_BY_ID.get(product.heartGroup)
        : classifyHeartGroup(product.name, product.categories)
      : undefined;
    content = (
      <ResultView
        product={product}
        ingredientsText={overlay.text}
        analysis={analysis}
        offline={overlay.offline}
        heartSection={
          product && (
            <HeartSection
              officialSource={heartSymbolSource(product)}
              assessment={heartGroup && assessHeartSymbol(heartGroup, product.nutrition, product.ingredientsText)}
              groupChosenByUser={!!product.heartGroup}
              onChangeGroup={() => setOverlay({ kind: 'heartGroup', product, back: overlay.back })}
              onPhotographNutrition={async () => {
                try {
                  const nutrition = await photographNutrition();
                  if (!nutrition) return;
                  if (!hasNutrition(nutrition)) {
                    Alert.alert('Arvoja ei tunnistettu', 'Kuvaa ravintoarvotaulukko suoraan edestä ja rajaa vain taulukko.');
                    return;
                  }
                  await updateProduct({ ...product, nutrition: { ...product.nutrition, ...nutrition } });
                } catch (e) {
                  Alert.alert('Kuvaus epäonnistui', e instanceof Error ? e.message : String(e));
                }
              }}
            />
          )
        }
        onMarkLactoseFree={product ? () => updateProduct({ ...product, lactoseFree: true }) : undefined}
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
        onSearchStores={() => setOverlay({ kind: 'stores', barcode: overlay.barcode, back: overlay.back })}
        onCancel={closeOverlay}
      />
    );
  } else if (overlay?.kind === 'stores') {
    content = (
      <StoreBrowserScreen
        query={overlay.barcode}
        onFound={async (found) => {
          const product = await saveStoreProduct(overlay.barcode, found, await getCachedProduct(overlay.barcode));
          await showProduct(product, overlay.back);
        }}
        onCancel={() => setOverlay({ kind: 'ingredients', barcode: overlay.barcode, back: overlay.back })}
      />
    );
  } else if (overlay?.kind === 'heartGroup') {
    const { product, back } = overlay;
    content = (
      <HeartGroupScreen
        selected={product.heartGroup}
        onSelect={async (groupId) => {
          const updated = { ...product, heartGroup: groupId ?? undefined };
          await saveProduct(updated);
          setOverlay({ kind: 'result', product: updated, back });
        }}
        onCancel={() => setOverlay({ kind: 'result', product, back })}
      />
    );
  } else if (overlay?.kind === 'supplementEdit') {
    const { draft } = overlay;
    content = (
      <SupplementEditScreen
        key={draft.id}
        draft={draft}
        others={supplements.filter((x) => x.id !== draft.id)}
        isNew={overlay.isNew}
        needsLabel={overlay.needsLabel}
        onSave={saveSupplement}
        onDelete={overlay.isNew ? undefined : () => deleteSupplement(draft.id)}
        onCancel={closeOverlay}
      />
    );
  } else if (tab === 'supplements') {
    content = (
      <SupplementsScreen
        supplements={supplements}
        busy={busy}
        onScan={scanSupplement}
        onAddManually={() => openNewSupplement({ name: '', amounts: {}, doseUnits: 1, unitsPerDay: 1 }, true)}
        onOpen={(s) => setOverlay({ kind: 'supplementEdit', draft: s, isNew: false, back: 'supplements' })}
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
      {storeLookup && (
        <StoreLookup
          key={storeLookup.barcode}
          barcode={storeLookup.barcode}
          accept={(p) =>
            storeLookup.purpose === 'food'
              ? !!p.ingredients
              : Object.keys(parseSupplementText(`${p.nutritionText ?? ''}\n${p.pageText ?? ''}`).amounts).length > 0
          }
          onResult={finishStoreLookup}
        />
      )}
      {!overlay && !keyboardOpen && (
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit>
                {t.label}
              </Text>
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
