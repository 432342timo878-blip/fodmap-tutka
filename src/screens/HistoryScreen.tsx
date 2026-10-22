import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getHistory, HistoryItem, Override } from '../storage';
import { colors, VERDICT_STYLE } from '../theme';

interface Props {
  overrides: Record<string, Override>;
  onOpen: (item: HistoryItem) => void;
}

const dateFormat = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HistoryScreen({ overrides, onOpen }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getHistory().then(setItems);
  }, []);

  const q = query.trim().toLowerCase();
  const visible = q ? items.filter((i) => `${i.name} ${i.brand ?? ''} ${i.barcode}`.toLowerCase().includes(q)) : items;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Hae historiasta"
        style={styles.search}
        placeholderTextColor={colors.muted}
      />
      <FlatList
        data={visible}
        keyExtractor={(i) => i.barcode}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Text style={styles.empty}>Skannatut tuotteet näkyvät täällä.</Text>}
        renderItem={({ item }) => {
          const v = VERDICT_STYLE[item.verdict];
          const override = overrides[item.barcode];
          return (
            <Pressable style={styles.row} onPress={() => onOpen(item)}>
              <View style={[styles.badge, { backgroundColor: v.bg, borderColor: v.color }]}>
                <Text style={[styles.badgeText, { color: v.color }]}>{v.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.brand, dateFormat.format(new Date(item.scannedAt))].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {override && <Text style={styles.override}>{override === 'ok' ? '👍' : '👎'}</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { margin: 12, marginBottom: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 12, borderRadius: 12 },
  badge: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 18, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  override: { fontSize: 20 },
});
