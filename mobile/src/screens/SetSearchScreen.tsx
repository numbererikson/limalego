import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { MissingKeyError } from "@/api/rebrickable";
import { importSet, searchCatalog } from "@/data/sets";
import type { SetRow } from "@/data/types";
import { theme } from "@/theme";

export default function SetSearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SetRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchCatalog(query.trim()));
    } catch (e) {
      setError(
        e instanceof MissingKeyError
          ? "No Rebrickable key set — add one in Settings."
          : e instanceof Error
            ? e.message
            : "Search failed.",
      );
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function add(setNum: string) {
    setAdding(setNum);
    setError(null);
    try {
      await importSet(setNum, "tracked");
      setAdded((prev) => new Set(prev).add(setNum));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Set name or number (e.g. 42100)"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={runSearch}>
          <Text style={styles.searchBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {searching ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(s) => s.set_num}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => {
            const isAdded = added.has(item.set_num) || ["tracked", "building", "complete"].includes(item.status);
            return (
              <View style={styles.row}>
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
                    {item.set_num} · {item.year ?? "—"} · {item.total_parts ?? "?"} parts
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, isAdded && styles.addedBtn]}
                  disabled={isAdded || adding === item.set_num}
                  onPress={() => add(item.set_num)}
                >
                  {adding === item.set_num ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={styles.addBtnText}>{isAdded ? "Added" : "Add"}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 12 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
  },
  searchBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  searchBtnText: { color: "#000", fontWeight: "700" },
  error: { color: theme.bad, marginTop: 10, fontSize: 13 },
  content: { gap: 10, paddingVertical: 12 },
  row: { flexDirection: "row", gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 10, alignItems: "center" },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: theme.cardAlt },
  rowBody: { flex: 1, gap: 4 },
  setName: { color: theme.text, fontSize: 14, fontWeight: "600" },
  setMeta: { color: theme.textFaint, fontSize: 12 },
  addBtn: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  addedBtn: { backgroundColor: theme.cardAlt },
  addBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
});
