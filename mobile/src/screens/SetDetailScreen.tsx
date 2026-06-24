import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  FlatList,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import PartThumb from "@/components/PartThumb";
import { getInventory, setQty } from "@/data/inventory";
import type { Inventory, PartRow } from "@/data/types";
import { colorSortKey, compareSortKey } from "@/lib/color";
import type { RootStackParamList } from "@/navigation";
import { theme } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, "SetDetail">;
type Filter = "missing" | "have" | "all";

type ListItem =
  | { kind: "header"; color_name: string; color_rgb: string | null; count: number }
  | { kind: "part"; part: PartRow };

export default function SetDetailScreen() {
  const { setNum } = useRoute<Rt>().params;
  const nav = useNavigation<Nav>();

  const [inv, setInv] = useState<Inventory | null>(null);
  const [filter, setFilter] = useState<Filter>("missing");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [includeSpares, setIncludeSpares] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setInv(await getInventory(setNum, { includeSpares: true }));
    } catch {
      setInv(null);
    }
  }, [setNum]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function bump(p: PartRow, delta: number) {
    const next = Math.max(0, Math.min(p.required_qty, p.confirmed_qty + delta));
    if (next === p.confirmed_qty) return;
    const key = `${p.part_num}-${p.color_id}-${p.is_spare}`;
    setBusy(key);
    // Optimistic update.
    setInv((prev) => {
      if (!prev) return prev;
      const parts = prev.parts.map((row) =>
        row.part_num === p.part_num && row.color_id === p.color_id && row.is_spare === p.is_spare
          ? { ...row, confirmed_qty: next, missing_qty: row.required_qty - next }
          : row,
      );
      const confirmed = parts.reduce((a, r) => a + (r.is_spare ? 0 : r.confirmed_qty), 0);
      const missing = parts.reduce((a, r) => a + (r.is_spare ? 0 : r.missing_qty), 0);
      return { ...prev, parts, progress: { ...prev.progress, confirmed, missing } };
    });
    try {
      await setQty(setNum, p.part_num, p.color_id, next, p.is_spare);
    } catch {
      reload();
    } finally {
      setBusy(null);
    }
  }

  const allParts = inv?.parts ?? [];
  const spareCount = allParts.filter((p) => p.is_spare).reduce((a, p) => a + p.required_qty, 0);
  const effective = includeSpares ? allParts : allParts.filter((p) => !p.is_spare);

  const counts = {
    missing: effective.reduce((a, p) => a + p.missing_qty, 0),
    have: effective.reduce((a, p) => a + p.confirmed_qty, 0),
    all: effective.reduce((a, p) => a + p.required_qty, 0),
  };

  const needle = q.trim().toLowerCase();
  const afterTabAndSearch = effective
    .filter((p) => (filter === "missing" ? p.missing_qty > 0 : filter === "have" ? p.confirmed_qty > 0 : true))
    .filter(
      (p) =>
        !needle ||
        p.part_name.toLowerCase().includes(needle) ||
        p.part_num.toLowerCase().includes(needle) ||
        p.color_name.toLowerCase().includes(needle),
    );

  const colorCounts = useMemo(() => {
    const m = new Map<string, { rgb: string | null; count: number }>();
    afterTabAndSearch.forEach((p) => {
      const e = m.get(p.color_name);
      if (e) e.count++;
      else m.set(p.color_name, { rgb: p.color_rgb, count: 1 });
    });
    return [...m.entries()]
      .sort((a, b) => compareSortKey(colorSortKey(a[1].rgb), colorSortKey(b[1].rgb)) || a[0].localeCompare(b[0]))
      .map(([name, v]) => ({ name, rgb: v.rgb, count: v.count }));
  }, [afterTabAndSearch]);

  const filteredByColor = colorFilter
    ? afterTabAndSearch.filter((p) => p.color_name === colorFilter)
    : afterTabAndSearch;

  const sorted = [...filteredByColor].sort(
    (a, b) =>
      compareSortKey(colorSortKey(a.color_rgb), colorSortKey(b.color_rgb)) ||
      a.color_name.localeCompare(b.color_name) ||
      a.part_name.localeCompare(b.part_name) ||
      a.part_num.localeCompare(b.part_num),
  );

  // Flatten into [color header, parts…] for the FlatList.
  const listData = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let lastColor: string | null = null;
    for (const p of sorted) {
      if (!colorFilter && p.color_name !== lastColor) {
        const count = sorted.filter((x) => x.color_name === p.color_name).length;
        out.push({ kind: "header", color_name: p.color_name, color_rgb: p.color_rgb, count });
        lastColor = p.color_name;
      }
      out.push({ kind: "part", part: p });
    }
    return out;
  }, [sorted, colorFilter]);

  const prog = inv?.progress;
  const pct = prog && prog.required ? Math.round((prog.confirmed / prog.required) * 100) : 0;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={listData}
        keyExtractor={(it, i) =>
          it.kind === "header" ? `h-${it.color_name}-${i}` : `p-${it.part.part_num}-${it.part.color_id}-${it.part.is_spare}`
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {inv && inv.set.img_url ? (
              <TouchableOpacity
                style={styles.imgWrap}
                onPress={() => Linking.openURL(`https://rebrickable.com/sets/${encodeURIComponent(setNum)}/`)}
              >
                <Image source={{ uri: inv.set.img_url }} style={styles.setImg} resizeMode="contain" />
                <View style={styles.instrBadge}>
                  <Text style={styles.instrText}>📖 building instructions ↗</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {inv && (
              <Text style={styles.headTitle}>
                {inv.set.name}
                <Text style={styles.headSub}>
                  {"  "}
                  {inv.set.set_num}
                  {inv.set.theme ? ` · ${inv.set.theme}` : ""}
                </Text>
              </Text>
            )}

            {prog && (
              <View style={styles.card}>
                <View style={styles.progRow}>
                  <Text style={styles.progLabel}>Progress</Text>
                  <Text style={styles.progNum}>
                    {counts.have} / {counts.all}
                  </Text>
                </View>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { flex: pct }]} />
                  <View style={{ flex: Math.max(0, 100 - pct) }} />
                </View>
                <Text style={styles.progMissing}>
                  {counts.missing} parts missing
                  {spareCount > 0 ? (
                    <Text onPress={() => setIncludeSpares((v) => !v)} style={styles.spareToggle}>
                      {"  ·  "}
                      {includeSpares ? `hide spares (−${spareCount})` : `include spares (+${spareCount})`}
                    </Text>
                  ) : null}
                </Text>
              </View>
            )}

            <View style={styles.tabs}>
              <TabBtn label={`Need · ${counts.missing}`} active={filter === "missing"} onClick={() => setFilter("missing")} />
              <TabBtn label={`Have · ${counts.have}`} active={filter === "have"} onClick={() => setFilter("have")} />
              <TabBtn label={`All · ${counts.all}`} active={filter === "all"} onClick={() => setFilter("all")} />
            </View>

            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Filter (e.g. 'plate', '3001', 'red')"
              placeholderTextColor={theme.textFaint}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {colorCounts.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <ColorChip label={`All · ${afterTabAndSearch.length}`} rgb={null} active={colorFilter === null} onClick={() => setColorFilter(null)} />
                {colorCounts.map((c) => (
                  <ColorChip
                    key={c.name}
                    label={`${c.name} · ${c.count}`}
                    rgb={c.rgb}
                    active={colorFilter === c.name}
                    onClick={() => setColorFilter((cur) => (cur === c.name ? null : c.name))}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View style={styles.groupHeader}>
              <View style={[styles.swatch, { backgroundColor: item.color_rgb ? `#${item.color_rgb}` : "#888" }]} />
              <Text style={styles.groupHeaderText}>
                {item.color_name} · {item.count}
              </Text>
            </View>
          ) : (
            <PartRowView part={item.part} busy={busy} onBump={bump} />
          )
        }
        ListEmptyComponent={
          inv ? (
            <Text style={styles.empty}>
              {filter === "missing" ? "All collected! 🎉" : filter === "have" ? "Nothing marked as collected yet." : "No results."}
            </Text>
          ) : null
        }
      />

      <View style={styles.scanBar}>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => nav.navigate("Tabs", { screen: "Scan", params: { setNum } })}
        >
          <Text style={styles.scanBtnText}>📷 Scan bricks</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PartRowView({ part: p, busy, onBump }: { part: PartRow; busy: string | null; onBump: (p: PartRow, d: number) => void }) {
  const key = `${p.part_num}-${p.color_id}-${p.is_spare}`;
  const isBusy = busy === key;
  return (
    <View style={styles.partRow}>
      <PartThumb partNum={p.part_num} colorId={p.color_id} elementId={p.element_id} style={styles.partThumb} />
      <View style={styles.partBody}>
        <Text style={styles.partName} numberOfLines={2}>
          {p.part_name}
        </Text>
        <View style={styles.partMetaRow}>
          <View style={[styles.swatch, { backgroundColor: p.color_rgb ? `#${p.color_rgb}` : "#888" }]} />
          <Text style={styles.partMeta} numberOfLines={1}>
            {p.color_name} · {p.part_num}
            {p.is_spare ? " · spare" : ""}
          </Text>
        </View>
      </View>
      <View style={styles.qtyControls}>
        <TouchableOpacity
          style={[styles.qtyBtn, (p.confirmed_qty <= 0 || isBusy) && styles.qtyDisabled]}
          disabled={p.confirmed_qty <= 0 || isBusy}
          onPress={() => onBump(p, -1)}
        >
          <Text style={styles.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyText}>
          {p.confirmed_qty}/{p.required_qty}
        </Text>
        <TouchableOpacity
          style={[styles.qtyBtnAdd, (p.confirmed_qty >= p.required_qty || isBusy) && styles.qtyDisabled]}
          disabled={p.confirmed_qty >= p.required_qty || isBusy}
          onPress={() => onBump(p, +1)}
        >
          <Text style={styles.qtyBtnAddText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onClick}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ColorChip({ label, rgb, active, onClick }: { label: string; rgb: string | null; active: boolean; onClick: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onClick}>
      {rgb !== null && <View style={[styles.swatch, { backgroundColor: rgb ? `#${rgb}` : "#888" }]} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 12, paddingBottom: 100, gap: 8 },
  imgWrap: { backgroundColor: theme.card, borderRadius: 12, overflow: "hidden" },
  setImg: { width: "100%", height: 200 },
  instrBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  instrText: { color: "#fff", fontSize: 12 },
  headTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  headSub: { color: theme.textFaint, fontSize: 12, fontWeight: "400" },
  card: { backgroundColor: theme.card, borderRadius: 12, padding: 14 },
  progRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progLabel: { color: theme.textDim, fontSize: 13 },
  progNum: { color: theme.text, fontSize: 13, fontWeight: "700" },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.cardAlt, overflow: "hidden", flexDirection: "row" },
  barFill: { backgroundColor: theme.accent },
  progMissing: { color: theme.textFaint, fontSize: 12, marginTop: 8 },
  spareToggle: { color: theme.accent, textDecorationLine: "underline" },
  tabs: { flexDirection: "row", backgroundColor: theme.card, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabActive: { backgroundColor: theme.cardAlt },
  tabText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: theme.text },
  search: { backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: theme.text, fontSize: 14 },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card },
  chipActive: { backgroundColor: theme.accent },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#000" },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 2 },
  groupHeaderText: { color: theme.textFaint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  partRow: { flexDirection: "row", gap: 10, backgroundColor: theme.card, borderRadius: 10, padding: 8, alignItems: "center", marginTop: 6 },
  partThumb: { width: 56, height: 56 },
  partBody: { flex: 1, gap: 4 },
  partName: { color: theme.text, fontSize: 14, fontWeight: "500" },
  partMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  partMeta: { color: theme.textFaint, fontSize: 12, flex: 1 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.cardAlt, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: theme.text, fontSize: 20, fontWeight: "700" },
  qtyBtnAdd: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.good, alignItems: "center", justifyContent: "center" },
  qtyBtnAddText: { color: "#000", fontSize: 20, fontWeight: "700" },
  qtyDisabled: { opacity: 0.3 },
  qtyText: { color: theme.text, fontSize: 13, minWidth: 44, textAlign: "center", fontVariant: ["tabular-nums"] },
  empty: { color: theme.textDim, fontSize: 14, textAlign: "center", paddingVertical: 40 },
  scanBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: theme.bg },
  scanBtn: { backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  scanBtnText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
