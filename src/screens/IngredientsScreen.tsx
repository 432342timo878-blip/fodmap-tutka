import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { photographIngredients } from '../ocr';
import { colors } from '../theme';

interface Props {
  /** Kun viivakoodi on annettu, luettelo tallennetaan tuotteelle seuraavia skannauksia varten. */
  barcode?: string;
  initialName?: string;
  initialText?: string;
  onSubmit: (name: string, text: string) => void;
  /** Avaa S-kaupat-haun sovelluksen sisällä. */
  onSearchSKaupat?: (query: string) => void;
  onCancel?: () => void;
}

export function IngredientsScreen({ barcode, initialName = '', initialText = '', onSubmit, onSearchSKaupat, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(initialText);
  const [recognizing, setRecognizing] = useState(false);

  const photograph = async () => {
    setRecognizing(true);
    try {
      const recognized = await photographIngredients();
      if (recognized === null) return;
      if (recognized.length < 5) {
        Alert.alert('Tekstiä ei tunnistettu', 'Kuvaa ainesosaluettelo läheltä ja hyvässä valossa, ja rajaa vain luettelo.');
        return;
      }
      setText(recognized);
    } catch (e) {
      Alert.alert('Kuvaus epäonnistui', e instanceof Error ? e.message : String(e));
    } finally {
      setRecognizing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{barcode ? 'Tuotetta ei löytynyt' : 'Tarkista ainesosaluettelo'}</Text>
      <Text style={styles.body}>
        {barcode
          ? `Viivakoodi ${barcode}. Kuvaa ainesosaluettelo pakkauksesta tai etsi tuote S-kaupoista. Tiedot tallennetaan, joten seuraavalla kerralla tulos tulee heti.`
          : 'Kuvaa ainesosaluettelo pakkauksesta, tai kirjoita tai liitä se alle.'}
      </Text>

      <Button label={recognizing ? 'Tunnistetaan tekstiä…' : '📷 Kuvaa ainesosaluettelo'} onPress={photograph} disabled={recognizing} />
      {recognizing && <ActivityIndicator />}
      {barcode && onSearchSKaupat && (
        <Button label="🔎 Etsi S-kaupoista" variant="secondary" onPress={() => onSearchSKaupat(barcode)} />
      )}

      {barcode && (
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Tuotteen nimi"
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ainesosat…"
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        style={[styles.input, styles.textArea]}
        placeholderTextColor={colors.muted}
      />
      {text.length > 0 && <Text style={styles.small}>Tarkista tunnistettu teksti ja korjaa tarvittaessa.</Text>}
      <View style={{ gap: 10 }}>
        <Button label="Tarkista" onPress={() => onSubmit(name, text)} disabled={text.trim().length === 0} />
        {onCancel && <Button label="Peruuta" variant="secondary" onPress={onCancel} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.muted },
  small: { fontSize: 13, color: colors.muted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text },
  textArea: { minHeight: 160 },
});
