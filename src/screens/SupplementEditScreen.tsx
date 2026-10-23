import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { photographText } from '../ocr';
import { assessStack, dailyAmount, Supplement } from '../supplements/assess';
import { formatAmount, NUTRIENT_BY_ID, NutrientAmounts, NutrientId, NUTRIENTS, parseSupplementText } from '../supplements/nutrients';
import { colors } from '../theme';
import { LEVEL_STYLE } from './SupplementsScreen';

interface Props {
  draft: Supplement;
  /** Muut pinon valmisteet (ilman tätä) – näytetään, mitä tämän lisääminen muuttaa. */
  others: Supplement[];
  isNew: boolean;
  /** Etiketin tietoja ei löytynyt automaattisesti. */
  needsLabel?: boolean;
  /** Mistä tiedot tulivat tai miksi niitä ei löytynyt. */
  lookupInfo?: string;
  onSave: (s: Supplement) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const toText = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));
const toNumber = (t: string) => {
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

export function SupplementEditScreen({ draft, others, isNew, needsLabel, lookupInfo, onSave, onDelete, onCancel }: Props) {
  const [name, setName] = useState(draft.name);
  const [doseUnits, setDoseUnits] = useState(toText(draft.doseUnits));
  const [unitsPerDay, setUnitsPerDay] = useState(toText(draft.unitsPerDay));
  const [packSize, setPackSize] = useState(toText(draft.packSize));
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(draft.amounts).map(([k, v]) => [k, toText(v)])),
  );
  const [packStartedAt, setPackStartedAt] = useState(draft.packStartedAt);
  const [picking, setPicking] = useState(false);
  const [reading, setReading] = useState(false);

  const current = (): Supplement => {
    const parsed: NutrientAmounts = {};
    for (const [id, text] of Object.entries(amounts)) {
      const n = toNumber(text);
      if (n !== undefined && n > 0) parsed[id as NutrientId] = n;
    }
    const pack = toNumber(packSize);
    return {
      ...draft,
      name: name.trim() || 'Nimetön lisäravinne',
      amounts: parsed,
      doseUnits: toNumber(doseUnits) ?? 1,
      unitsPerDay: toNumber(unitsPerDay) ?? 1,
      packSize: pack,
      // Uudelle pakkaukselle aloituspäivä on tänään.
      packStartedAt: pack ? (packStartedAt ?? Date.now()) : undefined,
    };
  };

  const photograph = async () => {
    setReading(true);
    try {
      const text = await photographText();
      if (text === null) return;
      const label = parseSupplementText(text);
      if (Object.keys(label.amounts).length === 0) {
        Alert.alert('Arvoja ei tunnistettu', 'Kuvaa vitamiini- ja kivennäisainetaulukko suoraan edestä ja rajaa vain taulukko.');
        return;
      }
      setAmounts((a) => ({ ...a, ...Object.fromEntries(Object.entries(label.amounts).map(([k, v]) => [k, toText(v)])) }));
      if (label.doseUnits) {
        setDoseUnits(String(label.doseUnits));
        if (isNew) setUnitsPerDay(String(label.doseUnits));
      }
    } catch (e) {
      Alert.alert('Kuvaus epäonnistui', e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };

  const supplement = current();
  const before = new Set(assessStack(others).warnings.map((w) => w.text));
  const added = assessStack([...others, supplement]).warnings.filter((w) => !before.has(w.text));
  const shown = NUTRIENTS.filter((n) => n.id in amounts);
  const missing = NUTRIENTS.filter((n) => !(n.id in amounts));

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{isNew ? 'Uusi lisäravinne' : 'Muokkaa lisäravinnetta'}</Text>
      {needsLabel && (
        <Text style={styles.notice}>Vitamiinitaulukkoa ei löytynyt verkosta. Kuvaa pakkauksen taulukko, niin arvot täyttyvät.</Text>
      )}
      {lookupInfo && <Text style={styles.small}>{lookupInfo}</Text>}

      <TextInput value={name} onChangeText={setName} placeholder="Nimi" style={styles.input} placeholderTextColor={colors.muted} />

      <Button label={reading ? 'Luetaan…' : '📷 Kuvaa vitamiinitaulukko'} variant={needsLabel ? 'primary' : 'secondary'} onPress={photograph} disabled={reading} />
      {reading && <ActivityIndicator />}

      <View style={styles.row}>
        <Field label="Arvot ilmoitettu (kpl)" value={doseUnits} onChange={setDoseUnits} />
        <Field label="Otan päivässä (kpl)" value={unitsPerDay} onChange={setUnitsPerDay} />
        <Field label="Pakkauksessa (kpl)" value={packSize} onChange={setPackSize} />
      </View>
      {!isNew && supplement.packSize && (
        <Button label="Aloitin uuden pakkauksen tänään" variant="secondary" onPress={() => setPackStartedAt(Date.now())} />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sisältö ({doseUnits || '1'} kpl)</Text>
        {shown.length === 0 && <Text style={styles.small}>Ei vielä ravintoaineita.</Text>}
        {shown.map((def) => (
          <View key={def.id} style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>{def.name}</Text>
            <TextInput
              value={amounts[def.id]}
              onChangeText={(t) => setAmounts((a) => ({ ...a, [def.id]: t }))}
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <Text style={styles.unit}>{def.unit}</Text>
            <Pressable
              onPress={() =>
                setAmounts((a) => {
                  const next = { ...a };
                  delete next[def.id];
                  return next;
                })
              }
            >
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setPicking((p) => !p)}>
          <Text style={styles.link}>{picking ? 'Sulje' : '+ Lisää ravintoaine'}</Text>
        </Pressable>
        {picking && (
          <View style={styles.chips}>
            {missing.map((def) => (
              <Pressable
                key={def.id}
                style={styles.chip}
                onPress={() => {
                  setAmounts((a) => ({ ...a, [def.id]: '' }));
                  setPicking(false);
                }}
              >
                <Text style={styles.chipText}>{def.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isNew ? 'Jos lisäät tämän pinoosi' : 'Tämän vaikutus pinoosi'}</Text>
        {shown.map((def) => (
          <Text key={def.id} style={styles.small}>
            {def.name}: {formatAmount(dailyAmount(supplement, def.id), def.unit)}/vrk tästä valmisteesta
          </Text>
        ))}
        {added.length === 0 ? (
          <Text style={styles.ok}>✓ Ei uusia huomioita – sopii nykyiseen pinoosi.</Text>
        ) : (
          added.map((w, i) => (
            <View key={i} style={[styles.warning, { backgroundColor: LEVEL_STYLE[w.level].bg }]}>
              <Text style={[styles.warningIcon, { color: LEVEL_STYLE[w.level].color }]}>{LEVEL_STYLE[w.level].icon}</Text>
              <Text style={styles.warningText}>{w.text}</Text>
            </View>
          ))
        )}
      </View>

      <Button label={isNew ? 'Lisää pinoon' : 'Tallenna'} onPress={() => onSave(current())} />
      {onDelete && (
        <Button
          label="Poista pinosta"
          variant="secondary"
          onPress={() =>
            Alert.alert('Poistetaanko?', name, [
              { text: 'Peruuta', style: 'cancel' },
              { text: 'Poista', style: 'destructive', onPress: onDelete },
            ])
          }
        />
      )}
      <Button label="Peruuta" variant="secondary" onPress={onCancel} />
    </ScrollView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.small}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  notice: { fontSize: 14, color: colors.text, backgroundColor: colors.yellowBg, padding: 10, borderRadius: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  nutrientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nutrientName: { flex: 1, fontSize: 15, color: colors.text },
  amountInput: { width: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 6, fontSize: 15, textAlign: 'right', color: colors.text },
  unit: { width: 28, fontSize: 14, color: colors.muted },
  remove: { fontSize: 16, color: colors.muted, padding: 4 },
  link: { fontSize: 15, color: colors.primary, fontWeight: '600', paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13, color: colors.primary },
  warning: { flexDirection: 'row', gap: 10, borderRadius: 8, padding: 10 },
  warningIcon: { fontSize: 16, fontWeight: '800', width: 16, textAlign: 'center' },
  warningText: { flex: 1, fontSize: 14, color: colors.text },
  ok: { fontSize: 14, color: colors.green, fontWeight: '600' },
  small: { fontSize: 13, color: colors.muted },
});
