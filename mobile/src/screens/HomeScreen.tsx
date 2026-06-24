import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { mySets } from "@/data/sets";
import { getStats, type Stats } from "@/data/stats";
import type { SetRow } from "@/data/types";
import type { RootStackParamList } from "@/navigation";
import { theme, textOn } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([mySets(), getStats()]);
      setSets(s);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pct =
    stats && stats.parts.required > 0
      ? Math.round((stats.parts.confirmed / stats.parts.required) * 100)
      : 0;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sets}
      keyExtractor={(s) => s.set_num}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />
      }
      ListHeaderComponent={
        stats ? (
          <View style={styles.statsCard}>
            <Text style={styles.statsLine}>
              {stats.sets_tracked} sets · {stats.parts.confirmed}/{stats.parts.required} parts ({pct}%)
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { flex: pct }]} />
              <View style={{ flex: Math.max(0, 100 - pct) }} />
            </View>
            {stats.top_missing_colors.length > 0 && (
              <View style={styles.chips}>
                {stats.top_missing_colors.map((c) => (
                  <View
                    key={c.color_id}
                    style={[styles.chip, { backgroundColor: c.color_rgb ? `#${c.color_rgb}` : theme.cardAlt }]}
                  >
                    <Text style={[styles.chipText, { color: textOn(c.color_rgb ? `#${c.color_rgb}` : null) }]}>
                      {c.color_name} {c.missing}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.empty}>
            No sets yet. Use the Find tab to add one. (Set your Rebrickable key in Settings first.)
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => nav.navigate("SetDetail", { setNum: item.set_num })}
        >
          {item.img_url ? (
            <Image source={{ uri: item.img_url }} style={styles.thumb} resizeMode="contain" />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={styles.rowBody}>
            <Text style={styles.setName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.setMeta}>
              {item.set_num} · {item.theme ?? "—"} · {item.year ?? "—"} · {item.status}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 12, gap: 10 },
  statsCard: { backgroundColor: theme.card, borderRadius: 12, padding: 14, gap: 10 },
  statsLine: { color: theme.text, fontSize: 14, fontWeight: "600" },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.cardAlt, overflow: "hidden", flexDirection: "row" },
  barFill: { backgroundColor: theme.good },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 11, fontWeight: "600" },
  empty: { color: theme.textDim, fontSize: 14, textAlign: "center", padding: 24, lineHeight: 20 },
  row: { flexDirection: "row", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 10 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: theme.cardAlt },
  rowBody: { flex: 1, justifyContent: "center", gap: 4 },
  setName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  setMeta: { color: theme.textFaint, fontSize: 12 },
});
