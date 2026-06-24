// Dark, photo-first palette — mirrors the original web app's look.
export const theme = {
  bg: "#0a0a0b",
  card: "#161618",
  cardAlt: "#1e1e22",
  border: "#2a2a30",
  text: "#f4f4f5",
  textDim: "#a1a1aa",
  textFaint: "#71717a",
  accent: "#f59e0b",
  good: "#22c55e",
  bad: "#ef4444",
};

/** Pick black/white text for a given hex background for readable color chips. */
export function textOn(hex: string | null): string {
  if (!hex) return theme.text;
  const h = hex.replace("#", "");
  if (h.length < 6) return theme.text;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#000000" : "#ffffff";
}
