import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getSet } from "@/api/rebrickable";
import { exportAndShare, pickAndRestore } from "@/data/backup";
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
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ kind: "idle" | "ok" | "err"; msg: string }>({
    kind: "idle",
    msg: "",
  });

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

  async function doExport() {
    setBackupBusy(true);
    setBackupMsg({ kind: "idle", msg: "" });
    try {
      await exportAndShare();
      setBackupMsg({ kind: "ok", msg: "Backup created — choose where to send it." });
    } catch (e) {
      setBackupMsg({ kind: "err", msg: e instanceof Error ? e.message : "Export failed." });
    } finally {
      setBackupBusy(false);
    }
  }

  function doImport() {
    Alert.alert(
      "Restore backup?",
      "This merges the backup into your current data, overwriting matching sets and progress.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Choose file",
          onPress: async () => {
            setBackupBusy(true);
            setBackupMsg({ kind: "idle", msg: "" });
            try {
              const res = await pickAndRestore();
              setBackupMsg(
                res
                  ? { kind: "ok", msg: `Restored ${res.sets} sets. Reopen tabs to see them.` }
                  : { kind: "idle", msg: "" },
              );
            } catch (e) {
              setBackupMsg({ kind: "err", msg: e instanceof Error ? e.message : "Import failed." });
            } finally {
              setBackupBusy(false);
            }
          },
        },
      ],
    );
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

      <View style={styles.divider} />

      <Text style={styles.h1}>Backup</Text>
      <Text style={styles.body}>
        Your sets and progress live only on this phone. Export a backup file and
        keep it somewhere safe (email it to yourself, Google Drive, Files…). You
        can restore it here on this or a new device.
      </Text>

      <TouchableOpacity
        style={[styles.btn, backupBusy && styles.btnDisabled]}
        onPress={doExport}
        disabled={backupBusy}
      >
        {backupBusy ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Export backup</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnOutline, backupBusy && styles.btnDisabled]}
        onPress={doImport}
        disabled={backupBusy}
      >
        <Text style={styles.btnOutlineText}>Import backup</Text>
      </TouchableOpacity>

      {backupMsg.kind !== "idle" && (
        <Text style={[styles.status, backupMsg.kind === "ok" ? styles.ok : styles.err]}>
          {backupMsg.msg}
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
  btnOutline: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  btnOutlineText: { color: theme.text, fontSize: 16, fontWeight: "600" },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 8 },
  status: { fontSize: 14, fontWeight: "600" },
  ok: { color: theme.good },
  err: { color: theme.bad },
});
