import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  /** Kun viivakoodi on annettu, luettelo tallennetaan tuotteelle seuraavia skannauksia varten. */
  barcode?: string;
  initialName?: string;
  initialText?: string;
  onSubmit: (name: string, text: string) => void;
  onCancel?: () => void;
}

export function IngredientsScreen({ barcode, initialName = '', initialText = '', onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(initialText);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{barcode ? 'Tuotetta ei löytynyt tietokannasta' : 'Tarkista ainesosaluettelo'}</Text>
      <Text style={styles.body}>
        {barcode
          ? `Viivakoodi ${barcode}. Kirjoita ainesosat pakkauksesta – ne tallennetaan, joten seuraavalla skannauksella tulos tulee heti.`
          : 'Kirjoita tai liitä ainesosaluettelo, esim. "vesi, vehnäjauho, sokeri, suola, sipulijauhe".'}
      </Text>
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
      <Button label="Tarkista" onPress={() => onSubmit(name, text)} disabled={text.trim().length === 0} />
      {onCancel && <Button label="Peruuta" variant="secondary" onPress={onCancel} />}
  </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.muted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text },
  textArea: { minHeight: 160 },
});
