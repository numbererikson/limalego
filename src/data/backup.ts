// Backup & restore the on-device data as a single JSON file.
//
// Since everything lives only on the phone, this is the safety net: export a
// JSON (share it to email / Drive / Files) and import it back on the same or a
// new device. The backup is self-contained — restoring does not need to re-hit
// Rebrickable.

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { all, run, tx } from "@/db/database";

const FORMAT_VERSION = 1;

type Backup = {
  limalego_backup: number;
  exported_at: string;
  sets: any[];
  parts: any[];
  colors: any[];
  elements: any[];
  set_inventory: any[];
  part_color_rarity: any[];
};

/** Read the whole local DB into a JSON string. */
export async function buildBackupJson(): Promise<string> {
  const [sets, parts, colors, elements, set_inventory, part_color_rarity] = await Promise.all([
    all<any>("SELECT set_num, name, year, theme, total_parts, img_url, status FROM sets"),
    all<any>("SELECT part_num, name, category FROM parts"),
    all<any>("SELECT color_id, name, rgb FROM colors"),
    all<any>("SELECT element_id, part_num, color_id FROM elements"),
    all<any>(
      "SELECT set_num, part_num, color_id, required_qty, confirmed_qty, missing_qty, is_spare FROM set_inventory",
    ),
    all<any>("SELECT part_num, color_id, set_count, weight FROM part_color_rarity"),
  ]);

  const backup: Backup = {
    limalego_backup: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    sets,
    parts,
    colors,
    elements,
    set_inventory,
    part_color_rarity,
  };
  return JSON.stringify(backup);
}

/** Build a backup file and open the OS share sheet (email, Drive, Files, …). */
export async function exportAndShare(): Promise<void> {
  const json = await buildBackupJson();
  const stamp = new Date().toISOString().slice(0, 10);
  const uri = `${FileSystem.cacheDirectory}limalego-backup-${stamp}.json`;
  await FileSystem.writeAsStringAsync(uri, json);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    dialogTitle: "Limalego backup",
    UTI: "public.json",
  });
}

/** Restore from a JSON string (upserts every row by its natural key). */
export async function restoreBackup(json: string): Promise<{ sets: number; parts: number }> {
  let data: Backup;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || data.limalego_backup == null) {
    throw new Error("This doesn't look like a Limalego backup.");
  }

  await tx(async () => {
    for (const c of data.colors ?? []) {
      await run(
        `INSERT INTO colors (color_id, name, rgb) VALUES (?, ?, ?)
         ON CONFLICT(color_id) DO UPDATE SET name = excluded.name, rgb = excluded.rgb`,
        [c.color_id, c.name, c.rgb],
      );
    }
    for (const p of data.parts ?? []) {
      await run(
        `INSERT INTO parts (part_num, name, category) VALUES (?, ?, ?)
         ON CONFLICT(part_num) DO UPDATE SET name = excluded.name, category = excluded.category`,
        [p.part_num, p.name, p.category],
      );
    }
    for (const e of data.elements ?? []) {
      await run(`INSERT OR IGNORE INTO elements (element_id, part_num, color_id) VALUES (?, ?, ?)`, [
        e.element_id,
        e.part_num,
        e.color_id,
      ]);
    }
    for (const s of data.sets ?? []) {
      await run(
        `INSERT INTO sets (set_num, name, year, theme, total_parts, img_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(set_num) DO UPDATE SET
           name = excluded.name, year = excluded.year, theme = excluded.theme,
           total_parts = excluded.total_parts, img_url = excluded.img_url, status = excluded.status`,
        [s.set_num, s.name, s.year, s.theme, s.total_parts, s.img_url, s.status],
      );
    }
    for (const si of data.set_inventory ?? []) {
      await run(
        `INSERT INTO set_inventory
           (set_num, part_num, color_id, required_qty, confirmed_qty, missing_qty, is_spare)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(set_num, part_num, color_id, is_spare) DO UPDATE SET
           required_qty = excluded.required_qty,
           confirmed_qty = excluded.confirmed_qty,
           missing_qty = excluded.missing_qty`,
        [si.set_num, si.part_num, si.color_id, si.required_qty, si.confirmed_qty, si.missing_qty, si.is_spare],
      );
    }
    for (const r of data.part_color_rarity ?? []) {
      await run(
        `INSERT INTO part_color_rarity (part_num, color_id, set_count, weight) VALUES (?, ?, ?, ?)
         ON CONFLICT(part_num, color_id) DO UPDATE SET set_count = excluded.set_count, weight = excluded.weight`,
        [r.part_num, r.color_id, r.set_count, r.weight],
      );
    }
  });

  return { sets: (data.sets ?? []).length, parts: (data.parts ?? []).length };
}

/** Let the user pick a backup file and restore it. Returns null if cancelled. */
export async function pickAndRestore(): Promise<{ sets: number; parts: number } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "*/*"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const json = await FileSystem.readAsStringAsync(res.assets[0].uri);
  return restoreBackup(json);
}
