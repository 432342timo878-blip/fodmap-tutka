import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { FodmapGroup, GROUP_DESCRIPTIONS, GROUP_LABELS } from '../data/ingredients';
import { clearHistory, Settings } from '../storage';
import { colors } from '../theme';

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

const GROUPS = Object.keys(GROUP_LABELS) as FodmapGroup[];

export function SettingsScreen({ settings, onChange }: Props) {
  const toggle = (group: FodmapGroup, tolerated: boolean) => {
    const next = new Set(settings.tolerated);
    if (tolerated) next.add(group);
    else next.delete(group);
    onChange({ ...settings, tolerated: GROUPS.filter((g) => next.has(g)) });
  };

  const confirmClear = () =>
    Alert.alert('Tyhjennä historia?', 'Skannaushistoria poistetaan. Omat merkinnät ja kirjoittamasi ainesosaluettelot säilyvät.', [
      { text: 'Peruuta', style: 'cancel' },
      { text: 'Tyhjennä', style: 'destructive', onPress: () => clearHistory() },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Omat sietorajat</Text>
      <Text style={styles.body}>
        Kaikki eivät reagoi kaikkiin FODMAP-ryhmiin. Jos olet testannut (esim. eliminaatiodieetin palautusvaiheessa),
        että siedät jonkin ryhmän, merkitse se – sen ainesosat eivät silloin vaikuta tulokseen.
      </Text>
      {GROUPS.map((g) => {
        const tolerated = settings.tolerated.includes(g);
        return (
          <View key={g} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{GROUP_LABELS[g]}</Text>
              <Text style={styles.groupDesc}>{GROUP_DESCRIPTIONS[g]}</Text>
              <Text style={[styles.state, { color: tolerated ? colors.green : colors.muted }]}>
                {tolerated ? 'Siedän tämän' : 'Herkkä'}
              </Text>
            </View>
            <Switch value={tolerated} onValueChange={(v) => toggle(g, v)} trackColor={{ true: colors.green }} />
          </View>
        );
      })}

      <Button label="Tyhjennä historia" variant="secondary" onPress={confirmClear} />

      <Text style={styles.title}>Tietoa</Text>
      <Text style={styles.body}>
        Tuotetiedot haetaan avoimesta Open Food Facts -tietokannasta. Arvio perustuu ainesosaluetteloon:
        määrää ei tiedetä, joten pääainesosat painavat enemmän kuin luettelon loppupään ainesosat.
        Sipuli, valkosipuli, inuliini ja polyolit merkitään aina, koska ne aiheuttavat oireita jo pieninä määrinä.
      </Text>
      <Text style={styles.body}>
        Tulos on suuntaa-antava eikä korvaa ravitsemusterapeutin ohjeita.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 8 },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 14, borderRadius: 12 },
  groupName: { fontSize: 16, fontWeight: '600', color: colors.text },
  groupDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  state: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
