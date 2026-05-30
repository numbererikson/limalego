import { useEffect, useState } from "react";

type Props = {
  partNum: string;
  colorId: number;
  className?: string;
  /** Optional explicit URL the backend already supplied (e.g. Brickognize for detections). */
  src?: string | null;
  /** Rebrickable element id — gives us the real product photo for that part+color. */
  elementId?: string | null;
};

/**
 * Tries multiple image sources in order until one loads:
 *   1. explicit `src` (if given)
 *   2. Rebrickable element photo (best — real product shot in the exact color)
 *   3. Rebrickable color-specific photo (older URL pattern, occasional hit)
 *   4. Brickognize neutral thumbnail
 *   5. 🧱 emoji placeholder
 */
export default function PartThumb({ partNum, colorId, className, src, elementId }: Props) {
  const candidates = [
    src || null,
    elementId ? `https://cdn.rebrickable.com/media/parts/elements/${elementId}.jpg` : null,
    `https://cdn.rebrickable.com/media/parts/photos/${colorId}/${partNum}_${colorId}.jpg`,
    `https://storage.googleapis.com/brickognize-static/thumbnails/v2.22/part/${partNum}/0.webp`,
  ].filter((u): u is string => !!u);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [partNum, colorId, src, elementId]);

  if (idx >= candidates.length) {
    return (
      <div
        className={
          "flex items-center justify-center bg-white/5 " + (className ?? "")
        }
      >
        <span className="text-lg opacity-30">🧱</span>
      </div>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt=""
      className={"object-contain bg-white/5 " + (className ?? "")}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
