import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { theme } from "@/theme";

type Props = {
  partNum: string;
  colorId: number;
  src?: string | null;
  elementId?: string | null;
  style?: ViewStyle;
};

/**
 * Tries multiple image sources in order until one loads (same chain as the web
 * app): explicit src → Rebrickable element photo → color-specific photo →
 * Brickognize thumbnail → 🧱 placeholder.
 */
export default function PartThumb({ partNum, colorId, src, elementId, style }: Props) {
  const candidates = [
    src || null,
    elementId ? `https://cdn.rebrickable.com/media/parts/elements/${elementId}.jpg` : null,
    `https://cdn.rebrickable.com/media/parts/photos/${colorId}/${partNum}_${colorId}.jpg`,
    `https://storage.googleapis.com/brickognize-static/thumbnails/v2.22/part/${partNum}/0.webp`,
  ].filter((u): u is string => !!u);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [partNum, colorId, src, elementId]);

  if (idx >= candidates.length) {
    return (
      <View style={[styles.base, styles.placeholder, style]}>
        <Text style={styles.emoji}>🧱</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: candidates[idx] }}
      style={[styles.base, style]}
      resizeMode="contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.cardAlt, borderRadius: 8 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 22, opacity: 0.3 },
});
