// Rebrickable REST API client (https://rebrickable.com/api/).
//
// Called directly from the device — in a native app there is no browser CORS
// layer, so the key travels in the Authorization header. The key is the user's
// own, entered on the Settings screen and stored in expo-secure-store.

import { getRebrickableKey } from "@/store/settings";

const BASE = "https://rebrickable.com/api/v3/lego";
const PAGE_SIZE = 1000; // Rebrickable's max page size.

export class RebrickableError extends Error {}
export class MissingKeyError extends RebrickableError {
  constructor() {
    super("No Rebrickable API key set. Add one in Settings.");
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const key = await getRebrickableKey();
  if (!key) throw new MissingKeyError();
  return { Authorization: `key ${key}`, Accept: "application/json" };
}

async function getJson<T>(url: string): Promise<T> {
  const headers = await authHeaders();
  const resp = await fetch(url, { headers });
  if (resp.status === 401 || resp.status === 403) {
    throw new RebrickableError("Rebrickable rejected the API key (check Settings).");
  }
  if (resp.status === 404) {
    throw new RebrickableError("Not found on Rebrickable.");
  }
  if (!resp.ok) {
    throw new RebrickableError(`Rebrickable error ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export type RbSet = {
  set_num: string;
  name: string;
  year: number | null;
  theme_id: number | null;
  num_parts: number | null;
  set_img_url: string | null;
};

export type RbTheme = { id: number; parent_id: number | null; name: string };

export type RbSetPart = {
  part: { part_num: string; name: string; part_cat_id: number | null };
  color: { id: number; name: string; rgb: string | null };
  quantity: number;
  is_spare: boolean;
  element_id: string | null;
  num_sets: number | null;
};

type Paged<T> = { count: number; next: string | null; results: T[] };

/** Search the catalog by name/number. */
export async function searchSets(query: string): Promise<RbSet[]> {
  const q = encodeURIComponent(query);
  const data = await getJson<Paged<RbSet>>(
    `${BASE}/sets/?search=${q}&page_size=30`,
  );
  return data.results;
}

/** Fetch one set's metadata. */
export async function getSet(setNum: string): Promise<RbSet> {
  return getJson<RbSet>(`${BASE}/sets/${encodeURIComponent(setNum)}/`);
}

/** Resolve a theme id to its display name (best-effort). */
export async function getThemeName(themeId: number | null): Promise<string | null> {
  if (themeId == null) return null;
  try {
    const theme = await getJson<RbTheme>(`${BASE}/themes/${themeId}/`);
    return theme.name;
  } catch {
    return null;
  }
}

/** Fetch the full parts inventory for a set, following pagination. */
export async function getSetParts(setNum: string): Promise<RbSetPart[]> {
  const out: RbSetPart[] = [];
  let url: string | null =
    `${BASE}/sets/${encodeURIComponent(setNum)}/parts/?page_size=${PAGE_SIZE}`;
  while (url) {
    const page: Paged<RbSetPart> = await getJson<Paged<RbSetPart>>(url);
    out.push(...page.results);
    url = page.next;
  }
  return out;
}
