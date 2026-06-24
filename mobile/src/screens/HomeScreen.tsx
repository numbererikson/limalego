import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { mySets, removeSet, setStatus } from "@/data/sets";
import { getStats, type Stats } from "@/data/stats";
import type { SetRow } from "@/data/types";
import type { RootStackParamList } from "@/navigation";
import { theme } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Remote image that falls back to a 🧱 placeholder if the URL fails to load. */
function RemoteThumb({ uri, style }: { uri: string | null; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (!uri || failed) {
    return (
      <View style={[style as StyleProp<ViewStyle>, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 22, opacity: 0.3 }}>🧱</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="contain" onError={() => setFailed(true)} />;
}

function statusLabel(s: string) {
  return (
    { tracked: "tracking", building: "★ building", complete: "✓ done", archived: "archived", catalog: "catalog" } as Record<string, string>
  )[s] ?? s;
}

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<SetRow | null>(null);

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

  // Theme counts for the filter chip row.
  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    sets.forEach((s) => {
      const t = s.theme ?? "—";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [sets]);

  const filtered = themeFilter ? sets.filter((s) => (s.theme ?? "—") === themeFilter) : sets;

  // Sets grouped by theme (only when no single-theme filter is active).
  const groups = useMemo(() => {
    if (themeFilter) return [{ theme: themeFilter, items: filtered }];
    const m = new Map<string, SetRow[]>();
    filtered.forEach((s) => {
      const t = s.theme ?? "—";
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(s);
    });
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([t, items]) => ({ theme: t, items }));
  }, [filtered, themeFilter]);

  async function changeStatus(s: SetRow, status: "tracked" | "building" | "complete") {
    setMenuFor(null);
    await setStatus(s.set_num, status);
    load();
  }
  async function remove(s: SetRow, reset: boolean) {
    setMenuFor(null);
    await removeSet(s.set_num, reset);
    load();
  }

  return (
    <>
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={groups}
        keyExtractor={(g) => g.theme}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
        ListHeaderComponent={
          themes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label={`All · ${sets.length}`} active={themeFilter === null} onClick={() => setThemeFilter(null)} />
              {themes.map(([t, n]) => (
                <Chip
                  key={t}
                  label={`${t} · ${n}`}
                  active={themeFilter === t}
                  onClick={() => setThemeFilter((cur) => (cur === t ? null : t))}
                />
              ))}
            </ScrollView>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No sets yet. Use the Find tab to add one. (Set your Rebrickable key in Settings first.)
            </Text>
          ) : null
        }
        renderItem={({ item: g }) => (
          <View style={styles.section}>
            {!themeFilter && (
              <Text style={styles.sectionTitle}>
                {g.theme} · {g.items.length}
              </Text>
            )}
            {g.items.map((s) => (
              <View key={s.set_num} style={[styles.row, s.status === "building" && styles.rowBuilding]}>
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() => nav.navigate("SetDetail", { setNum: s.set_num })}
                >
                  <RemoteThumb uri={s.img_url} style={styles.thumb} />
                  <View style={styles.rowBody}>
                    <Text style={styles.setName} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <Text style={styles.setMeta}>
                      {s.set_num} · {s.year ?? "—"} · {s.total_parts ?? 0} parts
                    </Text>
                    <Text
                      style={[
                        styles.statusText,
                        s.status === "building" && styles.statusBuilding,
                        s.status === "complete" && styles.statusDone,
                      ]}
                    >
                      {statusLabel(s.status)}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuFor(s)}>
                  <Text style={styles.menuDots}>⋮</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        ListFooterComponent={stats && sets.length > 0 ? <StatsFooter stats={stats} nav={nav} /> : null}
      />

      <Modal visible={menuFor !== null} transparent animationType="slide" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuFor(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {menuFor && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {menuFor.name}
                  </Text>
                  <Text style={styles.sheetSub}>
                    {menuFor.set_num} · current: {statusLabel(menuFor.status)}
                  </Text>
                </View>

                <Text style={styles.sheetLabel}>Status</Text>
                <View style={styles.statusGrid}>
                  <StatusBtn label="Tracking" active={menuFor.status === "tracked"} onClick={() => changeStatus(menuFor, "tracked")} />
                  <StatusBtn label="Building" active={menuFor.status === "building"} onClick={() => changeStatus(menuFor, "building")} />
                  <StatusBtn label="Done" active={menuFor.status === "complete"} onClick={() => changeStatus(menuFor, "complete")} />
                </View>

                <Text style={styles.sheetLabel}>Remove</Text>
                <TouchableOpacity style={styles.sheetItem} onPress={() => remove(menuFor, false)}>
                  <Text style={styles.sheetItemTitle}>Remove from my sets</Text>
                  <Text style={styles.sheetItemSub}>Keeps your progress if you add it back later.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetItem} onPress={() => remove(menuFor, true)}>
                  <Text style={[styles.sheetItemTitle, { color: theme.bad }]}>Remove and reset progress</Text>
                  <Text style={styles.sheetItemSub}>All marked bricks for this set go back to 0.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setMenuFor(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function StatsFooter({ stats, nav }: { stats: Stats; nav: Nav }) {
  const p = stats.parts;
  const pct = p.required ? Math.round((p.confirmed / p.required) * 100) : 0;
  return (
    <View style={styles.footer}>
      <Text style={styles.footerHeading}>Overall</Text>
      <View style={styles.footerLine}>
        <Text style={styles.footerText}>
          {stats.sets_tracked} sets · {p.confirmed.toLocaleString()} / {p.required.toLocaleString()} parts
        </Text>
        <Text style={styles.footerPct}>{pct}%</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { flex: pct }]} />
        <View style={{ flex: Math.max(0, 100 - pct) }} />
      </View>

      {stats.top_missing_colors.length > 0 && (
        <>
          <Text style={styles.footerSub}>Most needed colors:</Text>
          <View style={styles.swatchWrap}>
            {stats.top_missing_colors.map((c) => (
              <View key={c.color_id} style={styles.swatchChip}>
                <View style={[styles.swatch, { backgroundColor: c.color_rgb ? `#${c.color_rgb}` : "#888" }]} />
                <Text style={styles.swatchText}>
                  {c.color_name} · {c.missing}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {stats.closest_to_done.length > 0 && (
        <>
          <Text style={styles.footerSub}>Closest to done:</Text>
          {stats.closest_to_done.map((s) => {
            const sp = s.req ? Math.round((s.conf / s.req) * 100) : 0;
            return (
              <TouchableOpacity
                key={s.set_num}
                style={styles.closeRow}
                onPress={() => nav.navigate("SetDetail", { setNum: s.set_num })}
              >
                <RemoteThumb uri={s.img_url} style={styles.closeThumb} />
                <Text style={styles.closeName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.closePct}>{sp}%</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </View>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onClick}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <TouchableOpacity style={[styles.statusBtn, active && styles.statusBtnActive]} onPress={onClick}>
      <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 12, gap: 4, paddingBottom: 24 },
  chipRow: { gap: 8, paddingVertical: 4, paddingRight: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card },
  chipActive: { backgroundColor: theme.accent },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#000" },
  empty: { color: theme.textDim, fontSize: 14, textAlign: "center", padding: 24, lineHeight: 20 },
  section: { marginBottom: 14, gap: 8 },
  sectionTitle: { color: theme.textFaint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 6 },
  row: { flexDirection: "row", backgroundColor: theme.card, borderRadius: 12, overflow: "hidden" },
  rowBuilding: { borderWidth: 2, borderColor: theme.accent },
  rowMain: { flex: 1, flexDirection: "row", gap: 12, padding: 10, alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: theme.cardAlt },
  rowBody: { flex: 1, gap: 3 },
  setName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  setMeta: { color: theme.textFaint, fontSize: 12 },
  statusText: { color: theme.textFaint, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  statusBuilding: { color: theme.accent },
  statusDone: { color: theme.good },
  menuBtn: { paddingHorizontal: 16, justifyContent: "center" },
  menuDots: { color: theme.textDim, fontSize: 22 },

  footer: { backgroundColor: theme.card, borderRadius: 16, padding: 16, marginTop: 10, gap: 8 },
  footerHeading: { color: theme.textFaint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  footerLine: { flexDirection: "row", justifyContent: "space-between" },
  footerText: { color: theme.text, fontSize: 13 },
  footerPct: { color: theme.text, fontSize: 13, fontWeight: "700" },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.cardAlt, overflow: "hidden", flexDirection: "row", marginBottom: 4 },
  barFill: { backgroundColor: theme.accent },
  footerSub: { color: theme.textDim, fontSize: 12, marginTop: 4 },
  swatchWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  swatchChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.cardAlt, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  swatchText: { color: theme.text, fontSize: 11 },
  closeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  closeThumb: { width: 32, height: 32, borderRadius: 6, backgroundColor: theme.cardAlt },
  closeName: { flex: 1, color: theme.text, fontSize: 13 },
  closePct: { color: theme.textFaint, fontSize: 12 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 8, paddingBottom: 28 },
  sheetHeader: { paddingHorizontal: 12, paddingVertical: 12, borderBottomColor: theme.border, borderBottomWidth: 1 },
  sheetTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  sheetSub: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
  sheetLabel: { color: theme.textFaint, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 12, marginTop: 14, marginBottom: 6 },
  statusGrid: { flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  statusBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: theme.cardAlt, alignItems: "center" },
  statusBtnActive: { backgroundColor: theme.accent },
  statusBtnText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  statusBtnTextActive: { color: "#000" },
  sheetItem: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
  sheetItemTitle: { color: theme.text, fontSize: 15, fontWeight: "500" },
  sheetItemSub: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
  sheetCancel: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  sheetCancelText: { color: theme.textDim, fontSize: 15 },
});
