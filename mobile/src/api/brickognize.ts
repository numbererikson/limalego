// Brickognize public part-recognition API (https://brickognize.com/).
//
// POST https://api.brickognize.com/predict/parts/ with multipart field
// 'query_image'. No API key; rate-limited per IP. Called directly from the
// device. Localises ONE dominant part per image and returns ranked candidates.

const BRICKOGNIZE_URL = "https://api.brickognize.com/predict/parts/";

export type BrickognizeItem = {
  id: string;
  name: string | null;
  score: number;
  category: string | null;
  type: string | null;
  img_url: string | null;
};

export type BrickognizeResult = {
  bounding_box: {
    left: number;
    upper: number;
    right: number;
    lower: number;
    image_width: number;
    image_height: number;
    score: number;
  } | null;
  items: BrickognizeItem[];
};

/**
 * Send a photo (local file uri from the camera / picker) to Brickognize.
 * Returns the ranked candidate parts plus an optional bounding box.
 */
export async function predictParts(
  imageUri: string,
  filename = "scan.jpg",
  contentType = "image/jpeg",
): Promise<BrickognizeResult> {
  const form = new FormData();
  // React Native's FormData accepts a {uri,name,type} file descriptor.
  form.append("query_image", {
    uri: imageUri,
    name: filename,
    type: contentType,
  } as unknown as Blob);

  const resp = await fetch(BRICKOGNIZE_URL, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Brickognize error ${resp.status}`);
  }
  const data = await resp.json();
  return {
    bounding_box: data.bounding_box ?? null,
    items: (data.items ?? []) as BrickognizeItem[],
  };
}
