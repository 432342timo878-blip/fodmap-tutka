import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  busy: boolean;
  onBarcode: (barcode: string) => void;
}

/** Sama viivakoodi luetaan kameralla monta kertaa sekunnissa – ohitetaan toistot hetken ajan. */
const REPEAT_IGNORE_MS = 3000;

export function ScanScreen({ busy, onBarcode }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState('');
  const last = useRef<{ code: string; at: number } | null>(null);

  const handleScan = ({ data }: BarcodeScanningResult) => {
    const code = data.trim();
    const now = Date.now();
    if (busy || !code) return;
    if (last.current && last.current.code === code && now - last.current.at < REPEAT_IGNORE_MS) return;
    last.current = { code, at: now };
    onBarcode(code);
  };

  const submitManual = () => {
    const code = manual.replace(/\D/g, '');
    if (code.length >= 8) {
      setManual('');
      onBarcode(code);
    }
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
    <View style={{ flex: 1 }}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
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

      <View style={styles.manualRow}>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder="Tai kirjoita viivakoodi"
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={submitManual}
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
        <Button label="Hae" onPress={submitManual} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '78%', height: 150, borderWidth: 3, borderColor: '#fff', borderRadius: 16 },
  hint: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 16, textShadowColor: '#000', textShadowRadius: 4 },
  torch: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  torchText: { color: '#fff', fontWeight: '600' },
  manualRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: colors.surface },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text },
});
