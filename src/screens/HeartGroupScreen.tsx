import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { HEART_GROUPS } from '../analysis/heartCriteria';
import { Button } from '../components/Button';
import { colors } from '../theme';

interface Props {
  selected?: string;
  onSelect: (groupId: string | null) => void;
  onCancel: () => void;
}

const SECTIONS = [...new Set(HEART_GROUPS.map((g) => g.category))].map((category) => ({
  title: category,
  data: HEART_GROUPS.filter((g) => g.category === category),
}));

/** Sydänmerkki-tuoteryhmän valinta, kun arvio osui väärin. */
export function HeartGroupScreen({ selected, onSelect, onCancel }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={SECTIONS}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        ListHeaderComponent={<Text style={styles.help}>Valitse tuotteelle oikea Sydänmerkki-tuoteryhmä.</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, item.id === selected && styles.rowSelected]} onPress={() => onSelect(item.id)}>
            <Text style={styles.name}>{item.name}</Text>
            {item.excluded && <Text style={styles.small}>Ei voi saada Sydänmerkkiä</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: 12 }}>
            {selected && <Button label="Palauta automaattinen arvio" variant="secondary" onPress={() => onSelect(null)} />}
            <Button label="Peruuta" variant="secondary" onPress={onCancel} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 15, color: colors.text, marginBottom: 6 },
  header: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
  row: { backgroundColor: colors.surface, padding: 12, borderRadius: 10 },
  rowSelected: { borderWidth: 2, borderColor: colors.primary },
  name: { fontSize: 15, color: colors.text },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
