import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  busy: boolean;
  onBarcode: (barcode: string) => void;
  /** Kasvaa, kun käyttäjä painaa "Skannaa seuraava" – lukija avataan silloin heti. */
  launchRequest: number;
}

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

/**
 * Viivakoodit luetaan ensisijaisesti Googlen omalla lukijalla (Play-palvelut), joka tarkentaa
 * ja zoomaa itse. Sovelluksen oma kameranäkymä on varalla laitteille, joilla lukijaa ei ole.
 */
export function ScanScreen({ busy, onBarcode, launchRequest }: Props) {
  const [mode, setMode] = useState<'google' | 'camera'>('google');
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const onBarcodeRef = useRef(onBarcode);
  onBarcodeRef.current = onBarcode;

  useEffect(() => {
    const sub = CameraView.onModernBarcodeScanned(({ data }) => {
      const code = data?.trim();
      if (code) onBarcodeRef.current(code);
    });
    return () => sub.remove();
  }, []);

  const launchGoogleScanner = async () => {
    setError(null);
    try {
      await CameraView.launchScanner({ barcodeTypes: BARCODE_TYPES });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(message)) return;
      setError('Googlen viivakoodinlukija ei käynnistynyt. Käytetään sovelluksen omaa kameraa.');
      setMode('camera');
    }
  };

  useEffect(() => {
    if (launchRequest > 0 && mode === 'google') launchGoogleScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchRequest]);

  const submitManual = () => {
    const code = manual.replace(/\D/g, '');
    if (code.length >= 8) {
      setManual('');
      onBarcode(code);
    }
  };

  const manualRow = (
    <View style={styles.manualRow}>
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder="Tai kirjoita viivakoodin numerot"
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={submitManual}
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
      <Button label="Hae" onPress={submitManual} disabled={busy} />
    </View>
  );

  if (mode === 'camera') {
    return (
      <View style={{ flex: 1 }}>
        {manualRow}
        {error && <Text style={styles.error}>{error}</Text>}
        <InAppCamera busy={busy} onBarcode={onBarcode} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.bigButton, (pressed || busy) && { opacity: 0.7 }]}
        onPress={launchGoogleScanner}
        disabled={busy}
      >
        {busy ? (
          <>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.bigButtonText}>Haetaan tuotetta…</Text>
          </>
        ) : (
          <>
            <Text style={styles.bigButtonIcon}>📷</Text>
            <Text style={styles.bigButtonText}>Skannaa viivakoodi</Text>
          </>
        )}
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {manualRow}
      <Pressable onPress={() => setMode('camera')}>
        <Text style={styles.link}>Käytä sovelluksen omaa kameraa</Text>
      </Pressable>
    </View>
  );
}

/** Sama viivakoodi luetaan kameralla monta kertaa sekunnissa – ohitetaan toistot hetken ajan. */
const REPEAT_IGNORE_MS = 3000;

function InAppCamera({ busy, onBarcode }: { busy: boolean; onBarcode: (barcode: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const last = useRef<{ code: string; at: number } | null>(null);

  const handleScan = ({ data }: BarcodeScanningResult) => {
    const code = data.trim();
    const now = Date.now();
    if (busy || !code) return;
    if (last.current && last.current.code === code && now - last.current.at < REPEAT_IGNORE_MS) return;
    last.current = { code, at: now };
    onBarcode(code);
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Kameran käyttölupa tarvitaan</Text>
        <Text style={styles.body}>Sovellus lukee viivakoodin kameralla. Kuvia ei tallenneta.</Text>
        <Button label="Salli kamera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={busy ? undefined : handleScan}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>{busy ? 'Haetaan tuotetta…' : 'Osoita kamera viivakoodiin'}</Text>
        {busy && <ActivityIndicator color="#fff" size="large" style={{ marginTop: 12 }} />}
      </View>
      <Pressable style={styles.torch} onPress={() => setTorch((t) => !t)}>
        <Text style={styles.torchText}>{torch ? '🔦 Valo päällä' : '🔦 Valo'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, justifyContent: 'center' },
  bigButton: { backgroundColor: colors.primary, borderRadius: 24, paddingVertical: 48, alignItems: 'center', gap: 10 },
  bigButtonIcon: { fontSize: 56 },
  bigButtonText: { fontSize: 24, fontWeight: '800', color: colors.primaryText },
  link: { fontSize: 15, color: colors.primary, fontWeight: '600', textAlign: 'center', padding: 8 },
  error: { fontSize: 14, color: colors.red, textAlign: 'center', paddingHorizontal: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '78%', height: 150, borderWidth: 3, borderColor: '#fff', borderRadius: 16 },
  hint: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 16, textShadowColor: '#000', textShadowRadius: 4 },
  torch: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  torchText: { color: '#fff', fontWeight: '600' },
  manualRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text },
});
