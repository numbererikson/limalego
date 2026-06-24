// Local SQLite schema for the on-device database.
//
// Unlike the original server, this DB only ever holds the sets the user has
// imported — not the whole Rebrickable catalog. Each import pulls the set's
// parts live from the Rebrickable API and stores them here, so the DB stays a
// few MB instead of ~130 MB.
//
// Conventions mirror the original backend schema:
//   * color_id mirrors Rebrickable's numeric color id (-1 = unknown / detections)
//   * set_inventory is keyed by (set_num, part_num, color_id, is_spare)

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sets (
     set_num       TEXT    PRIMARY KEY,
     name          TEXT    NOT NULL,
     year          INTEGER,
     theme         TEXT,
     total_parts   INTEGER,
     img_url       TEXT,
     status        TEXT    NOT NULL DEFAULT 'tracked'
                   CHECK (status IN ('catalog','tracked','building','complete','archived'))
   )`,

  `CREATE TABLE IF NOT EXISTS parts (
     part_num  TEXT    PRIMARY KEY,
     name      TEXT    NOT NULL,
     category  TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS colors (
     color_id  INTEGER PRIMARY KEY,
     name      TEXT    NOT NULL,
     rgb       TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS elements (
     element_id TEXT PRIMARY KEY,
     part_num   TEXT    NOT NULL,
     color_id   INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_elements_part_color ON elements(part_num, color_id)`,

  `CREATE TABLE IF NOT EXISTS set_inventory (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     set_num        TEXT    NOT NULL,
     part_num       TEXT    NOT NULL,
     color_id       INTEGER NOT NULL,
     required_qty   INTEGER NOT NULL,
     confirmed_qty  INTEGER NOT NULL DEFAULT 0,
     missing_qty    INTEGER NOT NULL DEFAULT 0,
     is_spare       INTEGER NOT NULL DEFAULT 0 CHECK (is_spare IN (0,1)),
     UNIQUE (set_num, part_num, color_id, is_spare)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_set_inventory_set  ON set_inventory(set_num)`,
  `CREATE INDEX IF NOT EXISTS idx_set_inventory_part ON set_inventory(part_num, color_id)`,

  // Rarity is sourced from Rebrickable's per-part "num_sets" at import time.
  `CREATE TABLE IF NOT EXISTS part_color_rarity (
     part_num   TEXT    NOT NULL,
     color_id   INTEGER NOT NULL,
     set_count  INTEGER NOT NULL DEFAULT 0,
     weight     REAL    NOT NULL DEFAULT 1.0,
     PRIMARY KEY (part_num, color_id)
   )`,

  `CREATE TABLE IF NOT EXISTS scan_sessions (
     id          INTEGER  PRIMARY KEY AUTOINCREMENT,
     set_num     TEXT,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     mode        TEXT     NOT NULL DEFAULT 'single'
                 CHECK (mode IN ('single','grid','sweep'))
   )`,

  `CREATE TABLE IF NOT EXISTS detections (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id  INTEGER NOT NULL,
     part_num    TEXT,
     color_id    INTEGER,
     confidence  REAL,
     status      TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','rejected','taken'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id)`,

  `CREATE TABLE IF NOT EXISTS user_feedback (
     id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
     detection_id        INTEGER  NOT NULL,
     action              TEXT     NOT NULL
                         CHECK (action IN ('accept','reject','correct','taken','skip')),
     corrected_part_num  TEXT,
     corrected_color_id  INTEGER,
     target_set_num      TEXT,
     created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
];
