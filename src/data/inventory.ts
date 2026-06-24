// Per-set inventory: parts the set needs and how many are already confirmed.
// Ported from the server's inventory routes.

import { all, first, run } from "@/db/database";
import { getSetRow } from "./sets";
import type { Inventory, PartRow } from "./types";

export async function getInventory(
  setNum: string,
  opts: { includeSpares?: boolean; missingOnly?: boolean } = {},
): Promise<Inventory> {
  const set = await getSetRow(setNum);
  if (!set) throw new Error(`set ${setNum} not found`);

  const where = ["si.set_num = ?"];
  const args: (string | number)[] = [setNum];
  if (!opts.includeSpares) where.push("si.is_spare = 0");
  if (opts.missingOnly) where.push("si.missing_qty > 0");

  const parts = await all<PartRow>(
    `SELECT si.part_num,
            p.name     AS part_name,
            p.category AS part_category,
            si.color_id,
            c.name     AS color_name,
            c.rgb      AS color_rgb,
            si.required_qty,
            si.confirmed_qty,
            si.missing_qty,
            si.is_spare,
            r.set_count AS rarity_set_count,
            r.weight    AS rarity_weight,
            (SELECT MIN(element_id) FROM elements e
               WHERE e.part_num = si.part_num AND e.color_id = si.color_id) AS element_id
       FROM set_inventory si
       JOIN parts  p ON p.part_num = si.part_num
       JOIN colors c ON c.color_id = si.color_id
       LEFT JOIN part_color_rarity r
         ON r.part_num = si.part_num AND r.color_id = si.color_id
      WHERE ${where.join(" AND ")}
      ORDER BY si.missing_qty DESC, si.required_qty DESC`,
    args,
  );

  const progress =
    (await first<{ required: number; confirmed: number; missing: number }>(
      `SELECT COALESCE(SUM(required_qty), 0)  AS required,
              COALESCE(SUM(confirmed_qty), 0) AS confirmed,
              COALESCE(SUM(missing_qty), 0)   AS missing
         FROM set_inventory
        WHERE set_num = ? AND is_spare = 0`,
      [setNum],
    )) ?? { required: 0, confirmed: 0, missing: 0 };

  return { set, progress, parts };
}

/** Manually set how many of a (part, color) the user has for a set. */
export async function setQty(
  setNum: string,
  partNum: string,
  colorId: number,
  confirmedQty: number,
  isSpare = 0,
): Promise<{ confirmed_qty: number; missing_qty: number }> {
  const row = await first<{ id: number; required_qty: number }>(
    `SELECT id, required_qty FROM set_inventory
      WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = ?`,
    [setNum, partNum, colorId, isSpare],
  );
  if (!row) throw new Error("inventory row not found");
  const confirmed = Math.max(0, confirmedQty);
  const missing = Math.max(0, row.required_qty - confirmed);
  await run(
    "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
    [confirmed, missing, row.id],
  );
  return { confirmed_qty: confirmed, missing_qty: missing };
}
