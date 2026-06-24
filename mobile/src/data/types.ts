// Shared row/result types, mirroring the original web frontend's api.ts.

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
  bounding_box: { x: number; y: number; w: number; h: number; score: number } | null;
  detections: Detection[];
};
