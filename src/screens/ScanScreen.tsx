import { useEffect, useState } from "react";
import { useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import PartThumb from "@/components/PartThumb";
import { getSetRow } from "@/data/sets";
import { feedback, scan } from "@/data/scan";
import type { Detection, ScanResult } from "@/data/types";
import { theme, textOn } from "@/theme";

export default function ScanScreen() {
  const route = useRoute();
  const activeSet = (route.params as { setNum?: string | null } | undefined)?.setNum ?? null;
  const [activeSetName, setActiveSetName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeSet) getSetRow(activeSet).then((r) => setActiveSetName(r?.name ?? null));
    else setActiveSetName(null);
  }, [activeSet]);

  async function capture(fromLibrary: boolean) {
    setError(null);
    // No allowsEditing: Brickognize localises the dominant part itself, and the
    // Android crop step was an extra confusing screen.
    const opts: ImagePicker.ImagePickerOptions = { quality: 0.6 };
    let picked: ImagePicker.ImagePickerResult;
    try {
      if (fromLibrary) {
        picked = await ImagePicker.launchImageLibraryAsync(opts);
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera permission denied — enable it in your phone settings.");
          return;
        }
        picked = await ImagePicker.launchCameraAsync(opts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the camera.");
      return;
    }
    if (picked.canceled || !picked.assets?.[0]) return;

    const uri = picked.assets[0].uri;
    setPhotoUri(uri);
    setResult(null);
    setTaken(new Set());
    setBusy(true);
    try {
      setResult(await scan(uri, activeSet, "single"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function takeOne(det: Detection, setNum: string, colorId: number) {
    const tag = `${det.detection_id}-${setNum}-${colorId}`;
    await feedback(det.detection_id, "taken", { setNum, correctedColorId: colorId });
    setTaken((prev) => new Set(prev).add(tag));
  }

  const noResult = result !== null && result.detections.length === 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {activeSet && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Scanning for: {activeSetName ?? activeSet}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => capture(false)} disabled={busy}>
          <Text style={styles.actionText}>📷 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionAlt} onPress={() => capture(true)} disabled={busy}>
          <Text style={styles.actionAltText}>Library</Text>
        </TouchableOpacity>
      </View>

      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />}

      {busy && (
        <View style={styles.statusBox}>
          <ActivityIndicator color={theme.accent} />
          <Text style={styles.statusText}>Scanning…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {noResult && !busy && (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            Couldn't recognise a part. Try again — fill the frame with one brick on a plain
            background, in good light.
          </Text>
        </View>
      )}

      {result?.detections.map((det) => (
        <View key={det.detection_id} style={styles.detCard}>
          <View style={styles.detHead}>
            <PartThumb partNum={det.part_num} colorId={-1} src={det.img_url} style={styles.detThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detName}>{det.name ?? det.part_num}</Text>
              <Text style={styles.detMeta}>
                {det.part_num} · {(det.confidence * 100).toFixed(0)}% match
              </Text>
              <Text style={[styles.badge, det.is_match ? styles.badgeGood : styles.badgeBad]}>
                {det.is_match ? `Needed (${det.total_missing})` : "Not needed"}
              </Text>
            </View>
          </View>

          {det.needed_in_sets.map((s) => (
            <View key={s.set_num} style={styles.setBlock}>
              <Text style={styles.setBlockName}>
                {s.set_name} · {s.total_missing} missing
              </Text>
              {s.colors.map((c) => {
                const tag = `${det.detection_id}-${s.set_num}-${c.color_id}`;
                const done = taken.has(tag);
                return (
                  <View key={c.color_id} style={styles.colorRow}>
                    <View style={[styles.colorChip, { backgroundColor: c.color_rgb ? `#${c.color_rgb}` : theme.cardAlt }]}>
                      <Text style={[styles.colorChipText, { color: textOn(c.color_rgb ? `#${c.color_rgb}` : null) }]}>
                        {c.color_name}
                      </Text>
                    </View>
                    <Text style={styles.colorQty}>need {c.missing_qty}</Text>
                    <TouchableOpacity
                      style={[styles.tookBtn, done && styles.tookDone]}
                      disabled={done}
                      onPress={() => takeOne(det, s.set_num, c.color_id)}
                    >
                      <Text style={[styles.tookBtnText, done && styles.tookDoneText]}>
                        {done ? "✓ took 1" : "Took 1"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 12, gap: 12 },
  banner: { backgroundColor: theme.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  bannerText: { color: theme.accent, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, backgroundColor: theme.accent, borderRadius: 12, padding: 16, alignItems: "center" },
  actionText: { color: "#000", fontWeight: "700", fontSize: 16 },
  actionAlt: { backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 20, justifyContent: "center", borderColor: theme.border, borderWidth: 1 },
  actionAltText: { color: theme.text, fontWeight: "600" },
  preview: { width: "100%", height: 200, borderRadius: 12, backgroundColor: theme.card },
  statusBox: { alignItems: "center", gap: 8, paddingVertical: 16 },
  statusText: { color: theme.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },
  errorBox: { backgroundColor: "#3a1414", borderRadius: 10, padding: 12 },
  errorText: { color: theme.bad, fontSize: 13 },
  detCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, gap: 10 },
  detHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  detThumb: { width: 60, height: 60 },
  detName: { color: theme.text, fontSize: 15, fontWeight: "700" },
  detMeta: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: "700", marginTop: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, overflow: "hidden" },
  badgeGood: { color: "#000", backgroundColor: theme.good },
  badgeBad: { color: theme.text, backgroundColor: theme.cardAlt },
  setBlock: { borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 8, gap: 6 },
  setBlockName: { color: theme.text, fontSize: 13, fontWeight: "600" },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  colorChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 },
  colorChipText: { fontSize: 11, fontWeight: "600" },
  colorQty: { color: theme.textDim, fontSize: 12, flex: 1 },
  tookBtn: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tookDone: { backgroundColor: theme.cardAlt },
  tookBtnText: { color: "#000", fontWeight: "700", fontSize: 12 },
  tookDoneText: { color: theme.good },
});
