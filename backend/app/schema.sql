-- LEGO Known-Set Finder schema
-- Conventions:
--   * Rebrickable master data lives in: parts, colors, sets
--   * set_inventory is denormalized to (set_num, part_num, color_id) for fast lookup
--   * color_id mirrors Rebrickable's numeric color id (-1 = unknown, used for detections)
--   * "_id" PK is internal autoincrement; "_num" / "color_id" are stable external keys

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    set_num       TEXT    UNIQUE NOT NULL,
    name          TEXT    NOT NULL,
    year          INTEGER,
    theme         TEXT,
    total_parts   INTEGER,
    img_url       TEXT,
    status        TEXT    NOT NULL DEFAULT 'catalog'
                  CHECK (status IN ('catalog','tracked','building','complete','archived'))
);

CREATE TABLE IF NOT EXISTS parts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    part_num  TEXT    UNIQUE NOT NULL,
    name      TEXT    NOT NULL,
    category  TEXT
);

CREATE TABLE IF NOT EXISTS colors (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    color_id  INTEGER UNIQUE NOT NULL,
    name      TEXT    NOT NULL,
    rgb       TEXT
);

-- Rebrickable's elements: a (part_num, color_id) tuple identifies many element_ids
-- (mould generations). We just need any one to fetch the photo.
CREATE TABLE IF NOT EXISTS elements (
    element_id TEXT PRIMARY KEY,
    part_num   TEXT    NOT NULL,
    color_id   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_elements_part_color ON elements(part_num, color_id);

CREATE TABLE IF NOT EXISTS set_inventory (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    set_num        TEXT    NOT NULL,
    part_num       TEXT    NOT NULL,
    color_id       INTEGER NOT NULL,
    required_qty   INTEGER NOT NULL,
    confirmed_qty  INTEGER NOT NULL DEFAULT 0,
    missing_qty    INTEGER NOT NULL DEFAULT 0,
    is_spare       INTEGER NOT NULL DEFAULT 0 CHECK (is_spare IN (0,1)),
    UNIQUE (set_num, part_num, color_id, is_spare),
    FOREIGN KEY (set_num)  REFERENCES sets(set_num)    ON DELETE CASCADE,
    FOREIGN KEY (part_num) REFERENCES parts(part_num),
    FOREIGN KEY (color_id) REFERENCES colors(color_id)
);

CREATE TABLE IF NOT EXISTS part_color_rarity (
    part_num   TEXT    NOT NULL,
    color_id   INTEGER NOT NULL,
    set_count  INTEGER NOT NULL DEFAULT 0,
    weight     REAL    NOT NULL DEFAULT 1.0,
    PRIMARY KEY (part_num, color_id)
);

CREATE TABLE IF NOT EXISTS scan_sessions (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    set_num     TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    image_path  TEXT,
    mode        TEXT     NOT NULL DEFAULT 'single'
                CHECK (mode IN ('single','grid','sweep')),
    FOREIGN KEY (set_num) REFERENCES sets(set_num)
);

CREATE TABLE IF NOT EXISTS detections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    part_num    TEXT,
    color_id    INTEGER,
    confidence  REAL,
    bbox_x      REAL,
    bbox_y      REAL,
    bbox_w      REAL,
    bbox_h      REAL,
    grid_cell   TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','rejected','taken')),
    FOREIGN KEY (session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_feedback (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    detection_id        INTEGER  NOT NULL,
    action              TEXT     NOT NULL
                        CHECK (action IN ('accept','reject','correct','taken','skip')),
    corrected_part_num  TEXT,
    corrected_color_id  INTEGER,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_set_inventory_set    ON set_inventory(set_num);
CREATE INDEX IF NOT EXISTS idx_set_inventory_part   ON set_inventory(part_num, color_id);
CREATE INDEX IF NOT EXISTS idx_detections_session   ON detections(session_id);
CREATE INDEX IF NOT EXISTS idx_detections_partcolor ON detections(part_num, color_id);
CREATE INDEX IF NOT EXISTS idx_rarity_part_color    ON part_color_rarity(part_num, color_id);
CREATE INDEX IF NOT EXISTS idx_sets_status          ON sets(status);
