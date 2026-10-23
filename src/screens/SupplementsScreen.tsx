import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { assessStack, daysLeft, Level, Supplement } from '../supplements/assess';
import { formatAmount, NUTRIENT_BY_ID } from '../supplements/nutrients';
import { colors } from '../theme';

interface Props {
  supplements: Supplement[];
  busy: boolean;
  onScan: () => void;
  onAddManually: () => void;
  onOpen: (s: Supplement) => void;
}

export const LEVEL_STYLE: Record<Level, { color: string; bg: string; icon: string }> = {
  bad: { color: colors.red, bg: colors.redBg, icon: '✕' },
  caution: { color: colors.yellow, bg: colors.yellowBg, icon: '!' },
  info: { color: colors.primary, bg: colors.greenBg, icon: 'i' },
};

const STATUS_COLOR = { over: colors.red, ok: colors.green, low: colors.muted, none: colors.text };

export function SupplementsScreen({ supplements, busy, onScan, onAddManually, onOpen }: Props) {
  const { totals, warnings } = assessStack(supplements);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button label={busy ? 'Haetaan tietoja…' : '📷 Skannaa lisäravinne'} onPress={onScan} disabled={busy} />
      {busy && <ActivityIndicator />}
      <Pressable onPress={onAddManually}>
        <Text style={styles.link}>Lisää ilman viivakoodia</Text>
      </Pressable>

      {supplements.length === 0 ? (
        <Text style={styles.empty}>
          Lisää käyttämäsi lisäravinteet, niin näet päivittäisen kokonaissaannin, ylärajat, päällekkäisyydet, vatsalle hankalat
          aineet ja milloin pakkaus loppuu.
        </Text>
      ) : (
        <>
          {warnings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.title}>Huomiot</Text>
              {warnings.map((w, i) => (
                <View key={i} style={[styles.warning, { backgroundColor: LEVEL_STYLE[w.level].bg }]}>
                  <Text style={[styles.warningIcon, { color: LEVEL_STYLE[w.level].color }]}>{LEVEL_STYLE[w.level].icon}</Text>
                  <Text style={styles.warningText}>{w.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.title}>Päivittäinen saanti lisäravinteista</Text>
            {totals.map((t) => {
              const def = NUTRIENT_BY_ID[t.id];
              return (
                <View key={t.id} style={styles.totalRow}>
                  <Text style={styles.totalName}>{def.name}</Text>
                  <Text style={[styles.totalValue, { color: STATUS_COLOR[t.status] }]}>{formatAmount(t.total, def.unit)}</Text>
                  <Text style={styles.totalLimit}>
                    {def.ri !== undefined ? `suositus ${formatAmount(def.ri, def.unit)}` : ''}
                    {def.ul !== undefined ? ` · max ${formatAmount(def.ul, def.unit)}` : ''}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.small}>Ruoasta tulee lisäksi. Suositus = EU:n viitearvo, max = EFSA:n turvallinen yläraja (aikuiset).</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.title}>Pinosi</Text>
            {supplements.map((s) => {
              const left = daysLeft(s);
              return (
                <Pressable key={s.id} style={styles.item} onPress={() => onOpen(s)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{s.name}</Text>
                    <Text style={styles.small}>
                      {s.unitsPerDay} kpl/vrk
                      {left !== undefined ? ` · ${left > 0 ? `riittää ${left} pv` : 'loppunut'}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      <Text style={styles.small}>Arviot ovat yleisiä aikuisten raja-arvoja eivätkä korvaa lääkärin tai ravitsemusterapeutin ohjeita.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  link: { fontSize: 15, color: colors.primary, fontWeight: '600', textAlign: 'center', padding: 4 },
  empty: { fontSize: 15, color: colors.muted, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  warning: { flexDirection: 'row', gap: 10, borderRadius: 8, padding: 10 },
  warningIcon: { fontSize: 16, fontWeight: '800', width: 16, textAlign: 'center' },
  warningText: { flex: 1, fontSize: 14, color: colors.text },
  totalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  totalName: { fontSize: 15, color: colors.text, minWidth: 130 },
  totalValue: { fontSize: 15, fontWeight: '700' },
  totalLimit: { fontSize: 12, color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 24, color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
});
