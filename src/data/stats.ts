// Aggregate stats across tracked sets — the Home header strip. Ported from the
// server's stats route.

import { all, first } from "@/db/database";

const MY_STATUSES = ["tracked", "building", "complete"] as const;
const PH = MY_STATUSES.map(() => "?").join(",");

export type Stats = {
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
};

export async function getStats(): Promise<Stats> {
  const setsTracked =
    (await first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sets WHERE status IN (${PH})`,
      [...MY_STATUSES],
    ))?.n ?? 0;

  const parts =
    (await first<{ required: number; confirmed: number; missing: number }>(
      `SELECT COALESCE(SUM(si.required_qty), 0)  AS required,
              COALESCE(SUM(si.confirmed_qty), 0) AS confirmed,
              COALESCE(SUM(si.missing_qty), 0)   AS missing
         FROM set_inventory si
         JOIN sets s ON s.set_num = si.set_num
        WHERE s.status IN (${PH}) AND si.is_spare = 0`,
      [...MY_STATUSES],
    )) ?? { required: 0, confirmed: 0, missing: 0 };

  const top_missing_colors = await all<{
    color_id: number;
    color_name: string;
    color_rgb: string | null;
    missing: number;
  }>(
    `SELECT c.color_id, c.name AS color_name, c.rgb AS color_rgb,
            SUM(si.missing_qty) AS missing
       FROM set_inventory si
       JOIN sets   s ON s.set_num  = si.set_num
       JOIN colors c ON c.color_id = si.color_id
      WHERE s.status IN (${PH}) AND si.is_spare = 0 AND si.missing_qty > 0
      GROUP BY c.color_id, c.name, c.rgb
      ORDER BY missing DESC
      LIMIT 8`,
    [...MY_STATUSES],
  );

  const closest_to_done = await all<{
    set_num: string;
    name: string;
    img_url: string | null;
    status: string;
    req: number;
    conf: number;
    miss: number;
  }>(
    `SELECT s.set_num, s.name, s.img_url, s.status,
            COALESCE(SUM(si.required_qty), 0)  AS req,
            COALESCE(SUM(si.confirmed_qty), 0) AS conf,
            COALESCE(SUM(si.missing_qty), 0)   AS miss
       FROM sets s
       LEFT JOIN set_inventory si
              ON si.set_num = s.set_num AND si.is_spare = 0
      WHERE s.status IN (${PH})
      GROUP BY s.set_num
      HAVING req > 0 AND miss > 0
      ORDER BY (CAST(conf AS REAL) / req) DESC
      LIMIT 3`,
    [...MY_STATUSES],
  );

  return { sets_tracked: setsTracked, parts, top_missing_colors, closest_to_done };
}
