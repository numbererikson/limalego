// Scan flow: photo -> Brickognize -> candidate parts cross-referenced against
// every tracked set's still-missing inventory. Ported from the server's scan
// routes; runs entirely on-device except the Brickognize call.

import { predictParts } from "@/api/brickognize";
import { all, first, run, tx } from "@/db/database";
import type { Detection, NeededInSet, NeededRow, ScanResult } from "./types";

const TOP_K = 5;

type TrackedSet = { set_num: string; name: string; img_url: string | null; theme: string | null };

export async function scan(
  imageUri: string,
  setNum: string | null,
  mode: "single" | "grid" | "sweep" = "single",
): Promise<ScanResult> {
  const result = await predictParts(imageUri);

  const bb = result.bounding_box;
  const imgW = (bb?.image_width || 0) || 1;
  const imgH = (bb?.image_height || 0) || 1;
  const box =
    bb != null
      ? {
          x: bb.left / imgW,
          y: bb.upper / imgH,
          w: (bb.right - bb.left) / imgW,
          h: (bb.lower - bb.upper) / imgH,
          score: bb.score,
        }
      : null;

  const sessionRes = await run(
    "INSERT INTO scan_sessions (set_num, mode) VALUES (?, ?)",
    [setNum, mode],
  );
  const sessionId = sessionRes.lastInsertRowId;

  const trackedSets = await all<TrackedSet>(
    "SELECT set_num, name, img_url, theme FROM sets WHERE status IN ('tracked','building')",
  );
  const setInfo = new Map(trackedSets.map((s) => [s.set_num, s]));
  const trackedNums = trackedSets.map((s) => s.set_num);

  const detections: Detection[] = [];
  for (const item of result.items.slice(0, TOP_K)) {
    const partNum = item.id;
    if (!partNum) continue;
    const confidence = item.score || 0;

    const detRes = await run(
      `INSERT INTO detections (session_id, part_num, color_id, confidence)
       VALUES (?, ?, -1, ?)`,
      [sessionId, partNum, confidence],
    );
    const detectionId = detRes.lastInsertRowId;

    const neededBySet = new Map<string, NeededRow[]>();
    if (trackedNums.length > 0) {
      const placeholders = trackedNums.map(() => "?").join(",");
      const rows = await all<{
        set_num: string;
        color_id: number;
        color_name: string;
        color_rgb: string | null;
        required_qty: number;
        confirmed_qty: number;
        missing_qty: number;
        element_id: string | null;
      }>(
        `SELECT si.set_num, si.color_id,
                c.name AS color_name, c.rgb AS color_rgb,
                si.required_qty, si.confirmed_qty, si.missing_qty,
                (SELECT MIN(element_id) FROM elements e
                   WHERE e.part_num = si.part_num AND e.color_id = si.color_id) AS element_id
           FROM set_inventory si
           JOIN colors c ON c.color_id = si.color_id
          WHERE si.set_num IN (${placeholders})
            AND si.part_num = ?
            AND si.is_spare = 0
            AND si.missing_qty > 0`,
        [...trackedNums, partNum],
      );
      for (const r of rows) {
        const list = neededBySet.get(r.set_num) ?? [];
        list.push({
          color_id: r.color_id,
          color_name: r.color_name,
          color_rgb: r.color_rgb,
          required_qty: r.required_qty,
          confirmed_qty: r.confirmed_qty,
          missing_qty: r.missing_qty,
          element_id: r.element_id,
        });
        neededBySet.set(r.set_num, list);
      }
    }

    const neededInSets: NeededInSet[] = [];
    for (const [sn, colors] of neededBySet) {
      const info = setInfo.get(sn)!;
      colors.sort((a, b) => b.missing_qty - a.missing_qty);
      neededInSets.push({
        set_num: sn,
        set_name: info.name,
        set_theme: info.theme,
        set_img_url: info.img_url,
        is_active_set: sn === setNum,
        total_missing: colors.reduce((s, c) => s + c.missing_qty, 0),
        colors,
      });
    }
    neededInSets.sort(
      (a, b) =>
        Number(b.is_active_set) - Number(a.is_active_set) ||
        b.total_missing - a.total_missing,
    );

    const totalMissing = neededInSets.reduce((s, x) => s + x.total_missing, 0);
    detections.push({
      detection_id: detectionId,
      part_num: partNum,
      name: item.name,
      category: item.category,
      img_url: item.img_url,
      confidence,
      color_id: -1,
      needed_in_sets: neededInSets,
      total_missing: totalMissing,
      is_match: totalMissing > 0,
    });
  }

  // Detections that fit ANY tracked set first, then by Brickognize confidence.
  detections.sort(
    (a, b) => b.total_missing - a.total_missing || b.confidence - a.confidence,
  );

  return { session_id: sessionId, set_num: setNum, mode, bounding_box: box, detections };
}

export type FeedbackAction = "accept" | "reject" | "correct" | "taken" | "skip";

/** Record what the user did with a detection; 'taken' bumps inventory. */
export async function feedback(
  detectionId: number,
  action: FeedbackAction,
  opts: { setNum?: string; correctedPartNum?: string; correctedColorId?: number } = {},
): Promise<{
  feedback_id: number;
  inventory_delta: { set_num: string; part_num: string; color_id: number; delta: number } | null;
}> {
  const det = await first<{ part_num: string; color_id: number; session_set_num: string | null }>(
    `SELECT d.part_num, d.color_id, s.set_num AS session_set_num
       FROM detections d
       JOIN scan_sessions s ON s.id = d.session_id
      WHERE d.id = ?`,
    [detectionId],
  );
  if (!det) throw new Error("detection not found");

  const newStatus = {
    accept: "accepted",
    reject: "rejected",
    correct: "accepted",
    taken: "taken",
    skip: "rejected",
  }[action];

  let feedbackId = 0;
  let inventoryDelta: {
    set_num: string;
    part_num: string;
    color_id: number;
    delta: number;
  } | null = null;
  const targetSet = opts.setNum ?? det.session_set_num ?? null;

  await tx(async () => {
    await run("UPDATE detections SET status = ? WHERE id = ?", [newStatus, detectionId]);
    const fb = await run(
      `INSERT INTO user_feedback
         (detection_id, action, corrected_part_num, corrected_color_id, target_set_num)
       VALUES (?, ?, ?, ?, ?)`,
      [
        detectionId,
        action,
        opts.correctedPartNum ?? null,
        opts.correctedColorId ?? null,
        targetSet,
      ],
    );
    feedbackId = fb.lastInsertRowId;

    if (action === "taken" && targetSet) {
      const partNum = opts.correctedPartNum ?? det.part_num;
      const colorId = opts.correctedColorId ?? det.color_id;
      if (colorId != null && colorId >= 0) {
        const row = await first<{ id: number; required_qty: number; confirmed_qty: number }>(
          `SELECT id, required_qty, confirmed_qty FROM set_inventory
            WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = 0`,
          [targetSet, partNum, colorId],
        );
        if (row) {
          const newConf = Math.min(row.required_qty, row.confirmed_qty + 1);
          const newMiss = Math.max(0, row.required_qty - newConf);
          await run(
            "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
            [newConf, newMiss, row.id],
          );
          inventoryDelta = {
            set_num: targetSet,
            part_num: partNum,
            color_id: colorId,
            delta: newConf - row.confirmed_qty,
          };
        }
      }
    }
  });

  return { feedback_id: feedbackId, inventory_delta: inventoryDelta };
}

/** Reverse a feedback: roll back any inventory increment and delete the row. */
export async function undoFeedback(feedbackId: number): Promise<void> {
  const fb = await first<{
    detection_id: number;
    action: string;
    corrected_part_num: string | null;
    corrected_color_id: number | null;
    target_set_num: string | null;
    det_part_num: string;
    det_color_id: number;
    session_set_num: string | null;
  }>(
    `SELECT uf.detection_id, uf.action, uf.corrected_part_num, uf.corrected_color_id,
            uf.target_set_num,
            d.part_num AS det_part_num, d.color_id AS det_color_id,
            s.set_num  AS session_set_num
       FROM user_feedback uf
       JOIN detections    d ON d.id = uf.detection_id
       JOIN scan_sessions s ON s.id = d.session_id
      WHERE uf.id = ?`,
    [feedbackId],
  );
  if (!fb) throw new Error("feedback not found");

  await tx(async () => {
    const targetSet = fb.target_set_num ?? fb.session_set_num;
    if (fb.action === "taken" && targetSet) {
      const partNum = fb.corrected_part_num ?? fb.det_part_num;
      const colorId = fb.corrected_color_id ?? fb.det_color_id;
      if (colorId != null && colorId >= 0) {
        const row = await first<{ id: number; required_qty: number; confirmed_qty: number }>(
          `SELECT id, required_qty, confirmed_qty FROM set_inventory
            WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = 0`,
          [targetSet, partNum, colorId],
        );
        if (row && row.confirmed_qty > 0) {
          const newConf = row.confirmed_qty - 1;
          const newMiss = row.required_qty - newConf;
          await run(
            "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
            [newConf, newMiss, row.id],
          );
        }
      }
    }
    await run("DELETE FROM user_feedback WHERE id = ?", [feedbackId]);
    await run("UPDATE detections SET status = 'pending' WHERE id = ?", [fb.detection_id]);
  });
}
