import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import PartThumb from "@/components/PartThumb";
import { getInventory, setQty } from "@/data/inventory";
import { removeSet } from "@/data/sets";
import type { Inventory, PartRow } from "@/data/types";
import type { RootStackParamList } from "@/navigation";
import { theme, textOn } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, "SetDetail">;

export default function SetDetailScreen() {
  const route = useRoute<Rt>();
  const nav = useNavigation<Nav>();
  const { setNum } = route.params;

  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInv(await getInventory(setNum, { missingOnly }));
    } catch {
      setInv(null);
    } finally {
      setLoading(false);
    }
  }, [setNum, missingOnly]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function bump(p: PartRow, delta: number) {
    const next = Math.max(0, Math.min(p.required_qty, p.confirmed_qty + delta));
    if (next === p.confirmed_qty) return;
    await setQty(setNum, p.part_num, p.color_id, next, p.is_spare);
    load();
  }

  function confirmRemove() {
    Alert.alert("Remove set?", "This deletes the set and its progress from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeSet(setNum);
          nav.goBack();
        },
      },
    ]);
  }

  if (loading && !inv) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (!inv) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Set not found.</Text>
      </View>
    );
  }

  const pct = inv.progress.required > 0 ? Math.round((inv.progress.confirmed / inv.progress.required) * 100) : 0;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={inv.parts}
      keyExtractor={(p) => `${p.part_num}-${p.color_id}-${p.is_spare}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{inv.set.name}</Text>
          <Text style={styles.meta}>
            {inv.set.set_num} · {inv.set.theme ?? "—"} · {inv.set.year ?? "—"}
          </Text>
          <Text style={styles.progress}>
            {inv.progress.confirmed}/{inv.progress.required} parts ({pct}%) · {inv.progress.missing} missing
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { flex: pct }]} />
            <View style={{ flex: Math.max(0, 100 - pct) }} />
          </View>
          <View style={styles.toolbar}>
            <View style={styles.toggle}>
              <Text style={styles.dim}>Missing only</Text>
              <Switch value={missingOnly} onValueChange={setMissingOnly} />
            </View>
            <TouchableOpacity onPress={confirmRemove}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item: p }) => (
        <View style={styles.partRow}>
          <PartThumb partNum={p.part_num} colorId={p.color_id} elementId={p.element_id} style={styles.partThumb} />
          <View style={styles.partBody}>
            <Text style={styles.partName} numberOfLines={2}>
              {p.part_name}
            </Text>
            <View style={styles.partMetaRow}>
              <View style={[styles.colorChip, { backgroundColor: p.color_rgb ? `#${p.color_rgb}` : theme.cardAlt }]}>
                <Text style={[styles.colorChipText, { color: textOn(p.color_rgb ? `#${p.color_rgb}` : null) }]}>
                  {p.color_name}
                </Text>
              </View>
              <Text style={styles.partMeta}>{p.part_num}</Text>
            </View>
          </View>
          <View style={styles.qtyBox}>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => bump(p, -1)}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>
                {p.confirmed_qty}/{p.required_qty}
              </Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => bump(p, +1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 12, gap: 8 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  dim: { color: theme.textDim, fontSize: 14 },
  header: { gap: 6, marginBottom: 6 },
  title: { color: theme.text, fontSize: 18, fontWeight: "700" },
  meta: { color: theme.textFaint, fontSize: 12 },
  progress: { color: theme.text, fontSize: 13, marginTop: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.cardAlt, overflow: "hidden", flexDirection: "row" },
  barFill: { backgroundColor: theme.good },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  remove: { color: theme.bad, fontWeight: "600", fontSize: 14 },
  partRow: { flexDirection: "row", gap: 10, backgroundColor: theme.card, borderRadius: 10, padding: 8, alignItems: "center" },
  partThumb: { width: 52, height: 52 },
  partBody: { flex: 1, gap: 4 },
  partName: { color: theme.text, fontSize: 14, fontWeight: "500" },
  partMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  colorChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 },
  colorChipText: { fontSize: 11, fontWeight: "600" },
  partMeta: { color: theme.textFaint, fontSize: 11 },
  qtyBox: { alignItems: "flex-end" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.cardAlt, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: theme.text, fontSize: 20, fontWeight: "700" },
  qtyText: { color: theme.text, fontSize: 13, minWidth: 44, textAlign: "center" },
});
