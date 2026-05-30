const BASE = "/api";

export type SetRow = {
  set_num: string;
  name: string;
  year: number | null;
  theme: string | null;
  total_parts: number | null;
  status: string;
  img_url: string | null;
};

export type PartRow = {
  part_num: string;
  part_name: string;
  part_category: string | null;
  color_id: number;
  color_name: string;
  color_rgb: string | null;
  required_qty: number;
  confirmed_qty: number;
  missing_qty: number;
  is_spare: number;
  rarity_set_count: number | null;
  rarity_weight: number | null;
  element_id: string | null;
};

export type Inventory = {
  set: SetRow;
  progress: { required: number; confirmed: number; missing: number };
  parts: PartRow[];
};

export type NeededRow = {
  color_id: number;
  color_name: string;
  color_rgb: string | null;
  required_qty: number;
  confirmed_qty: number;
  missing_qty: number;
  element_id: string | null;
};

export type NeededInSet = {
  set_num: string;
  set_name: string;
  set_theme: string | null;
  set_img_url: string | null;
  is_active_set: boolean;
  total_missing: number;
  colors: NeededRow[];
};

export type Detection = {
  detection_id: number;
  part_num: string;
  name: string | null;
  category: string | null;
  img_url: string | null;
  confidence: number;
  color_id: number;
  needed_in_sets: NeededInSet[];
  total_missing: number;
  is_match: boolean;
};

export type ScanResult = {
  session_id: number;
  set_num: string | null;
  mode: string;
  image_path: string;
  bounding_box: { x: number; y: number; w: number; h: number; score: number } | null;
  detections: Detection[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, init);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

export const api = {
  mySets:     () => req<SetRow[]>("/sets"),
  searchSets: (q: string) =>
    req<SetRow[]>(`/sets?status=all&q=${encodeURIComponent(q)}&limit=30`),
  importSet:  (setNum: string) =>
    req<{ set_num: string; status: string }>(
      `/sets/import/${encodeURIComponent(setNum)}`,
      { method: "POST" },
    ),
  removeSet: (setNum: string, resetProgress = false) =>
    req<{ set_num: string; status: string; progress_reset: boolean }>(
      `/sets/${encodeURIComponent(setNum)}${resetProgress ? "?reset_progress=true" : ""}`,
      { method: "DELETE" },
    ),
  setStatus: (setNum: string, status: "tracked" | "building" | "complete" | "archived") =>
    req<{ set_num: string; status: string }>(
      `/sets/import/${encodeURIComponent(setNum)}?status=${status}`,
      { method: "POST" },
    ),
  stats: () =>
    req<{
      sets_tracked: number;
      parts: { required: number; confirmed: number; missing: number };
      top_missing_colors: {
        color_id: number;
        color_name: string;
        color_rgb: string | null;
        missing: number;
      }[];
      closest_to_done: {
        set_num: string;
        name: string;
        img_url: string | null;
        status: string;
        req: number;
        conf: number;
        miss: number;
      }[];
    }>("/stats"),
  inventory: (setNum: string, missingOnly = false, includeSpares = false) => {
    const params = new URLSearchParams();
    if (missingOnly)   params.set("missing_only", "true");
    if (includeSpares) params.set("include_spares", "true");
    const qs = params.toString();
    return req<Inventory>(
      `/sets/${encodeURIComponent(setNum)}/inventory${qs ? "?" + qs : ""}`,
    );
  },
  setInventoryQty: (
    setNum: string,
    partNum: string,
    colorId: number,
    confirmedQty: number,
    isSpare = 0,
  ) => {
    const qs = new URLSearchParams({
      part_num: partNum,
      color_id: String(colorId),
      confirmed_qty: String(confirmedQty),
      is_spare: String(isSpare),
    });
    return req<{
      set_num: string;
      part_num: string;
      color_id: number;
      confirmed_qty: number;
      missing_qty: number;
    }>(`/sets/${encodeURIComponent(setNum)}/inventory?${qs.toString()}`, {
      method: "PATCH",
    });
  },
  scan: (image: Blob, setNum: string | null, mode = "single") => {
    const fd = new FormData();
    fd.append("image", image, "scan.jpg");
    if (setNum) fd.append("set_num", setNum);
    fd.append("mode", mode);
    return req<ScanResult>("/scan", { method: "POST", body: fd });
  },
  feedback: (
    detectionId: number,
    action: "accept" | "reject" | "correct" | "taken" | "skip",
    opts: {
      setNum?: string;
      correctedPartNum?: string;
      correctedColorId?: number;
    } = {},
  ) => {
    const fd = new FormData();
    fd.append("action", action);
    if (opts.setNum)             fd.append("set_num", opts.setNum);
    if (opts.correctedPartNum)   fd.append("corrected_part_num", opts.correctedPartNum);
    if (opts.correctedColorId !== undefined) fd.append("corrected_color_id", String(opts.correctedColorId));
    return req<{
      feedback_id: number;
      detection_id: number;
      action: string;
      status: string;
      inventory_delta: {
        set_num: string;
        part_num: string;
        color_id: number;
        delta: number;
      } | null;
    }>(`/scan/feedback/${detectionId}`, { method: "POST", body: fd });
  },
  undoFeedback: (feedbackId: number, setNum?: string) => {
    const fd = new FormData();
    if (setNum) fd.append("set_num", setNum);
    return req<{ undone: boolean; feedback_id: number }>(
      `/scan/feedback/${feedbackId}/undo`,
      { method: "POST", body: fd },
    );
  },
};
