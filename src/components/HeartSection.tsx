import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HeartAssessment, RuleStatus } from '../analysis/heartCriteria';
import { colors } from '../theme';
import { Button } from './Button';

interface Props {
  /** Mistä virallinen Sydänmerkki pääteltiin, tai null jos merkkiä ei löytynyt. */
  officialSource: string | null;
  assessment?: HeartAssessment;
  /** Tuoteryhmä on käyttäjän valitsema eikä pääteltu. */
  groupChosenByUser: boolean;
  onChangeGroup?: () => void;
  onPhotographNutrition?: () => void;
}

const STATUS = {
  eligible: { icon: '❤️', text: 'Täyttää Sydänmerkin kriteerit', color: colors.green },
  notEligible: { icon: '✕', text: 'Ei täytä Sydänmerkin kriteerejä', color: colors.red },
  unknown: { icon: '?', text: 'Ei voida arvioida kokonaan', color: colors.yellow },
  excluded: { icon: '–', text: 'Tuoteryhmä ei voi saada Sydänmerkkiä', color: colors.grey },
};

const RULE_ICON: Record<RuleStatus, { icon: string; color: string }> = {
  pass: { icon: '✓', color: colors.green },
  fail: { icon: '✕', color: colors.red },
  unknown: { icon: '?', color: colors.yellow },
};

export function HeartSection({ officialSource, assessment, groupChosenByUser, onChangeGroup, onPhotographNutrition }: Props) {
  const missingValues = assessment?.results.some((r) => r.status === 'unknown' && r.detail.includes('puuttuu') && !r.label.startsWith('Ei lisättyä'));

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Sydänmerkki</Text>

      {officialSource && (
        <View style={styles.official}>
          <Text style={styles.officialText}>❤️ Tuotteella on Sydänmerkki</Text>
          <Text style={styles.small}>{officialSource}</Text>
        </View>
      )}

      {assessment ? (
        <>
          <View style={styles.statusRow}>
            <Text style={[styles.statusIcon, { color: STATUS[assessment.status].color }]}>{STATUS[assessment.status].icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: STATUS[assessment.status].color }]}>{STATUS[assessment.status].text}</Text>
              <Pressable onPress={onChangeGroup} disabled={!onChangeGroup}>
                <Text style={styles.small}>
                  Tuoteryhmä: {assessment.group.name}
                  {groupChosenByUser ? '' : ' (arvio)'}
                  {onChangeGroup ? '  · Vaihda' : ''}
                </Text>
              </Pressable>
            </View>
          </View>

          {assessment.group.excluded && <Text style={styles.small}>{assessment.group.excluded}</Text>}

          {assessment.results.map((r, i) => (
            <View key={i} style={styles.rule}>
              <Text style={[styles.ruleIcon, { color: RULE_ICON[r.status].color }]}>{RULE_ICON[r.status].icon}</Text>
              <Text style={styles.ruleText}>
                <Text style={{ fontWeight: '600' }}>{r.label}</Text>: {r.detail}
              </Text>
            </View>
          ))}
          {assessment.group.note && <Text style={styles.small}>{assessment.group.note}</Text>}
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={styles.body}>Tuoteryhmää ei tunnistettu.</Text>
          {onChangeGroup && <Button label="Valitse tuoteryhmä" variant="secondary" onPress={onChangeGroup} />}
        </View>
      )}

      {missingValues && onPhotographNutrition && (
        <Button label="📷 Kuvaa ravintoarvotaulukko" variant="secondary" onPress={onPhotographNutrition} />
      )}
      <Text style={styles.small}>Arvio perustuu Sydänmerkin julkisiin tuoteryhmäkriteereihin (per 100 g). Se ei ole virallinen merkki.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  official: { backgroundColor: colors.redBg, borderRadius: 10, padding: 10 },
  officialText: { fontSize: 16, fontWeight: '700', color: colors.red },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { fontSize: 26, fontWeight: '800', width: 30, textAlign: 'center' },
  statusText: { fontSize: 17, fontWeight: '700' },
  rule: { flexDirection: 'row', gap: 8 },
  ruleIcon: { fontSize: 15, fontWeight: '800', width: 16, textAlign: 'center' },
  ruleText: { flex: 1, fontSize: 14, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
