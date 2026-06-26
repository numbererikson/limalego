import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getSet } from "@/api/rebrickable";
import { getRebrickableKey, setRebrickableKey } from "@/store/settings";
import { theme } from "@/theme";

export default function SettingsScreen() {
  const [key, setKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg: string }>({
    kind: "idle",
    msg: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRebrickableKey().then((k) => {
      if (k) setKey(k);
      setLoaded(true);
    });
  }, []);

  async function saveAndTest() {
    setBusy(true);
    setStatus({ kind: "idle", msg: "" });
    try {
      await setRebrickableKey(key);
      // A cheap call that needs a valid key — fetch a well-known set.
      await getSet("3001-1");
      setStatus({ kind: "ok", msg: "Key works and is saved." });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Test failed." });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Rebrickable API key</Text>
      <Text style={styles.body}>
        Limalego fetches each set's parts list from Rebrickable. You need a free
        API key: create an account, then go to Settings → API and generate one.
      </Text>
      <TouchableOpacity onPress={() => Linking.openURL("https://rebrickable.com/api/")}>
        <Text style={styles.link}>Open rebrickable.com/api →</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="Paste your API key"
        placeholderTextColor={theme.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={saveAndTest}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.btnText}>Save & test</Text>
        )}
      </TouchableOpacity>

      {status.kind !== "idle" && (
        <Text style={[styles.status, status.kind === "ok" ? styles.ok : styles.err]}>
          {status.msg}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  h1: { color: theme.text, fontSize: 20, fontWeight: "700" },
  body: { color: theme.textDim, fontSize: 14, lineHeight: 20 },
  link: { color: theme.accent, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: theme.text,
    fontSize: 15,
  },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#000", fontSize: 16, fontWeight: "700" },
  status: { fontSize: 14, fontWeight: "600" },
  ok: { color: theme.good },
  err: { color: theme.bad },
});
