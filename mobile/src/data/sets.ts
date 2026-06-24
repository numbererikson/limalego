// Tracking sets: search the Rebrickable catalog live, import a set's full parts
// inventory onto the device, and manage status. Replaces the server's sets +
// import routes — but here "import" actually fetches from Rebrickable instead
// of flipping a flag on pre-loaded catalog data.

import {
  getSet,
  getSetParts,
  getThemeName,
  searchSets,
  type RbSet,
} from "@/api/rebrickable";
import { all, first, run, tx } from "@/db/database";
import type { SetRow } from "./types";

const MY_STATUSES = ["tracked", "building", "complete"] as const;

/** Sets the user is actively tracking, from the local DB. */
export async function mySets(): Promise<SetRow[]> {
  const placeholders = MY_STATUSES.map(() => "?").join(",");
  return all<SetRow>(
    `SELECT set_num, name, year, theme, total_parts, status, img_url
       FROM sets
      WHERE status IN (${placeholders})
      ORDER BY status, theme, year DESC, name`,
    [...MY_STATUSES],
  );
}

export async function getSetRow(setNum: string): Promise<SetRow | null> {
  return first<SetRow>(
    `SELECT set_num, name, year, theme, total_parts, status, img_url
       FROM sets WHERE set_num = ?`,
    [setNum],
  );
}

/**
 * Search the Rebrickable catalog. Results are tagged with the local status if
 * the set is already imported, otherwise 'catalog'.
 */
export async function searchCatalog(query: string): Promise<SetRow[]> {
  const results = await searchSets(query);
  const local = await all<{ set_num: string; status: string }>(
    "SELECT set_num, status FROM sets",
  );
  const statusByNum = new Map(local.map((r) => [r.set_num, r.status]));
  return results.map((s: RbSet) => ({
    set_num: s.set_num,
    name: s.name,
    year: s.year,
    theme: null, // theme name is resolved lazily on import
    total_parts: s.num_parts,
    status: statusByNum.get(s.set_num) ?? "catalog",
    img_url: s.set_img_url,
  }));
}

/**
 * Pull a set's metadata + full parts inventory from Rebrickable and store it
 * locally. Re-importing preserves confirmed_qty already entered for the set.
 */
export async function importSet(
  setNum: string,
  status: "tracked" | "building" | "complete" | "archived" = "tracked",
): Promise<{ set_num: string; status: string; parts: number }> {
  const meta = await getSet(setNum);
  const theme = await getThemeName(meta.theme_id);
  const parts = await getSetParts(setNum);

  await tx(async () => {
    await run(
      `INSERT INTO sets (set_num, name, year, theme, total_parts, img_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(set_num) DO UPDATE SET
         name = excluded.name, year = excluded.year, theme = excluded.theme,
         total_parts = excluded.total_parts, img_url = excluded.img_url,
         status = excluded.status`,
      [meta.set_num, meta.name, meta.year, theme, meta.num_parts, meta.set_img_url, status],
    );

    for (const p of parts) {
      const isSpare = p.is_spare ? 1 : 0;
      await run(
        `INSERT INTO colors (color_id, name, rgb) VALUES (?, ?, ?)
         ON CONFLICT(color_id) DO UPDATE SET name = excluded.name, rgb = excluded.rgb`,
        [p.color.id, p.color.name, p.color.rgb],
      );
      await run(
        `INSERT INTO parts (part_num, name, category) VALUES (?, ?, ?)
         ON CONFLICT(part_num) DO UPDATE SET name = excluded.name`,
        [p.part.part_num, p.part.name, p.part.part_cat_id != null ? String(p.part.part_cat_id) : null],
      );
      if (p.element_id) {
        await run(
          `INSERT OR IGNORE INTO elements (element_id, part_num, color_id) VALUES (?, ?, ?)`,
          [p.element_id, p.part.part_num, p.color.id],
        );
      }
      // Keep existing confirmed_qty on re-import; only update required/missing.
      await run(
        `INSERT INTO set_inventory
           (set_num, part_num, color_id, required_qty, confirmed_qty, missing_qty, is_spare)
         VALUES (?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(set_num, part_num, color_id, is_spare) DO UPDATE SET
           required_qty = excluded.required_qty,
           missing_qty  = MAX(0, excluded.required_qty - set_inventory.confirmed_qty)`,
        [setNum, p.part.part_num, p.color.id, p.quantity, p.quantity, isSpare],
      );
      if (p.num_sets != null) {
        await run(
          `INSERT INTO part_color_rarity (part_num, color_id, set_count, weight)
           VALUES (?, ?, ?, 1.0)
           ON CONFLICT(part_num, color_id) DO UPDATE SET set_count = excluded.set_count`,
          [p.part.part_num, p.color.id, p.num_sets],
        );
      }
    }
  });

  return { set_num: setNum, status, parts: parts.length };
}

/** Update the status of an already-imported set. */
export async function setStatus(
  setNum: string,
  status: "tracked" | "building" | "complete" | "archived",
): Promise<void> {
  await run("UPDATE sets SET status = ? WHERE set_num = ?", [status, setNum]);
}

/** Remove a set and all its local inventory rows. */
export async function removeSet(setNum: string): Promise<void> {
  await tx(async () => {
    await run("DELETE FROM set_inventory WHERE set_num = ?", [setNum]);
    await run("DELETE FROM sets WHERE set_num = ?", [setNum]);
  });
}
