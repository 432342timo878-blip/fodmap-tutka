import { ReactNode, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Analysis, Finding } from '../analysis/analyze';
import { Product } from '../api/openFoodFacts';
import { GROUP_LABELS } from '../data/ingredients';
import { Override } from '../storage';
import { colors, SEVERITY_COLOR, VERDICT_STYLE } from '../theme';
import { Button } from './Button';

interface Props {
  product?: Product;
  ingredientsText?: string;
  analysis: Analysis;
  override?: Override;
  offline?: boolean;
  /** Sydänmerkki-osio (virallinen merkki ja kriteeriarvio). */
  heartSection?: ReactNode;
  onOverride?: (value: Override | null) => void;
  onEditIngredients?: () => void;
  /** Käyttäjä vahvistaa pakkauksesta, että tuote on laktoositon. */
  onMarkLactoseFree?: () => void;
  onDone: () => void;
  doneLabel?: string;
}

export function ResultView({
  product,
  ingredientsText,
  analysis,
  override,
  offline,
  heartSection,
  onOverride,
  onEditIngredients,
  onMarkLactoseFree,
  onDone,
  doneLabel = 'Skannaa seuraava',
}: Props) {
  const [showIngredients, setShowIngredients] = useState(false);
  const verdict = VERDICT_STYLE[analysis.verdict];
  const text = product?.ingredientsText ?? ingredientsText;
  const lactoseFlagged = !analysis.lactoseFree && analysis.findings.some((f) => f.severity !== 'ok' && f.entry.groups.includes('laktoosi'));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {product && (
        <View style={styles.productRow}>
          {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.image} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>{product.name}</Text>
            {product.brand ? <Text style={styles.muted}>{product.brand}</Text> : null}
            <Text style={styles.small}>
              {product.barcode}
              {SOURCE_LABEL[product.source]}
              {offline ? ' · offline' : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.verdict, { backgroundColor: verdict.bg, borderColor: verdict.color }]}>
        <Text style={[styles.verdictIcon, { color: verdict.color }]}>{verdict.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.verdictTitle, { color: verdict.color }]}>{verdict.title}</Text>
          <Text style={styles.verdictSubtitle}>{verdict.subtitle}</Text>
        </View>
      </View>

      {override && (
        <View style={[styles.override, { borderColor: override === 'ok' ? colors.green : colors.red }]}>
          <Text style={styles.overrideText}>
            Oma merkintäsi: {override === 'ok' ? 'sopii minulle 👍' : 'ei sovi minulle 👎'}
          </Text>
        </View>
      )}

      {analysis.certifiedLowFodmap && (
        <View style={[styles.override, { borderColor: colors.green }]}>
          <Text style={styles.overrideText}>✓ Merkitty vähä-FODMAP-tuotteeksi</Text>
          <Text style={styles.small}>
            Valmistaja ilmoittaa tuotteen vähä-FODMAP:ksi (esim. Vatsaystävällinen, Low FODMAP, FODMAP Friendly). Valmistustapa, kuten
            entsyymikäsittely tai pitkä hapatus, hajottaa FODMAPeja, vaikka ainesosissa olisi vehnää.
          </Text>
        </View>
      )}

      {analysis.findings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Huomioitavat ainesosat</Text>
          {analysis.findings.map((f) => (
            <FindingRow key={f.entry.id} finding={f} />
          ))}
        </View>
      )}

      {lactoseFlagged && onMarkLactoseFree && (
        <Button label="Pakkauksessa lukee: laktoositon" variant="secondary" onPress={onMarkLactoseFree} />
      )}

      {analysis.verdict === 'green' && analysis.safe.length > 0 && (
        <Text style={styles.muted}>
          Tunnistetut ainesosat: {analysis.safe.map((f) => f.entry.name.toLowerCase()).join(', ')}.
        </Text>
      )}

      {analysis.unrecognized.length > 0 && (
        <Text style={styles.small}>Ei tunnistettu: {analysis.unrecognized.join(', ')}</Text>
      )}

      {heartSection}

      {text ? (
        <Pressable onPress={() => setShowIngredients((v) => !v)} style={styles.section}>
          <Text style={styles.link}>{showIngredients ? 'Piilota ainesosaluettelo ▲' : 'Näytä ainesosaluettelo ▼'}</Text>
          {showIngredients && <Text style={styles.ingredients}>{text}</Text>}
        </Pressable>
      ) : null}

      {onOverride && (
        <View style={styles.buttonRow}>
          <Button
            label="👍 Sopii minulle"
            variant={override === 'ok' ? 'primary' : 'secondary'}
            onPress={() => onOverride(override === 'ok' ? null : 'ok')}
            style={{ flex: 1 }}
          />
          <Button
            label="👎 Ei sovi minulle"
            variant={override === 'bad' ? 'primary' : 'secondary'}
            onPress={() => onOverride(override === 'bad' ? null : 'bad')}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {onEditIngredients && (
        <Button
          label={analysis.verdict === 'unknown' ? 'Kirjoita ainesosat pakkauksesta' : 'Korjaa ainesosaluettelo'}
          variant="secondary"
          onPress={onEditIngredients}
        />
      )}
      <Button label={doneLabel} onPress={onDone} />

      <Text style={styles.disclaimer}>
        Arvio perustuu ainesosaluetteloon, ei määriin. Se on suuntaa-antava eikä korvaa ravitsemusterapeutin ohjeita.
      </Text>
    </ScrollView>
  );
}

const SOURCE_LABEL: Record<Product['source'], string> = {
  off: ' · Open Food Facts',
  skaupat: ' · S-kaupat',
  kruoka: ' · K-Ruoka',
  tokmanni: ' · Tokmanni',
  manual: ' · oma merkintä',
  web: ' · jaettu sivu',
  supplementDb: ' · lisäravinnetietokanta',
};

function FindingRow({ finding }: { finding: Finding }) {
  const color = SEVERITY_COLOR[finding.severity];
  return (
    <View style={styles.finding}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.findingName}>
          {finding.entry.name}
          {finding.percent !== undefined ? ` (${String(finding.percent).replace('.', ',')} %)` : ''}
        </Text>
        <Text style={styles.findingReason}>{finding.reason}</Text>
        {finding.entry.groups.length > 0 && (
          <Text style={styles.small}>{finding.entry.groups.map((g) => GROUP_LABELS[g]).join(' · ')}</Text>
        )}
        {finding.entry.note ? <Text style={styles.small}>{finding.entry.note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  productRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  image: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surface },
  productName: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 2 },
  verdictIcon: { fontSize: 40, fontWeight: '800', width: 44, textAlign: 'center' },
  verdictTitle: { fontSize: 21, fontWeight: '800' },
  verdictSubtitle: { fontSize: 14, color: colors.text, marginTop: 2 },
  override: { borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor: colors.surface },
  overrideText: { fontSize: 15, fontWeight: '600', color: colors.text },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  finding: { flexDirection: 'row', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  findingName: { fontSize: 16, fontWeight: '600', color: colors.text },
  findingReason: { fontSize: 14, color: colors.text },
  link: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  ingredients: { fontSize: 14, color: colors.text, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  disclaimer: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
