# Limalego

A self-hosted web app that helps you find which LEGO® parts from your scattered
brick pile belong to a specific set you want to build. You point your phone's
camera at a brick, the app tells you which of your tracked sets need it and in
which color — so you can pick the right ones out of a 10 000-piece pile without
losing your sanity.

Built for personal use with a Rebrickable database snapshot and the public
Brickognize part-recognition API.

> **Status:** working MVP. Used daily by its author; PRs and forks welcome.

## What it does

- **My sets** — track which LEGO sets you own / want to build, see thumbnails,
  filter by theme, see overall progress.
- **Per-set inventory** — every part the set needs, grouped and filtered by
  color, with real-product photos from Rebrickable. Tap `+/−` to mark how many
  you've already collected.
- **Camera scan** — point your phone at a brick; the app calls Brickognize,
  cross-references the result against *every* set you're tracking, and tells
  you "yes, you need 5 of these in red for the Digger and 3 in blue for
  Shopping Street" (or "no, this brick fits nowhere you're collecting").
- **Stats** — total parts across all your sets, most-needed colors, the sets
  closest to completion.
- **Daily JSON backup** of your progress (systemd timer).

## Screenshots

_Add a few screenshots here once you take them on your device._

## Tech stack

- **Backend** — Python 3.12, FastAPI, SQLite. ~1.4M inventory rows fit happily.
- **Frontend** — Vite + React 19 + TypeScript 6 + Tailwind 4. iPhone-first
  layout, dark, foto-first camera UI.
- **Recognition** — public [Brickognize](https://brickognize.com/) API (no key,
  rate-limited per IP).
- **Data** — [Rebrickable](https://rebrickable.com/) CSV dumps, downloaded on
  first run.

Everything runs on a single Linux box on your local LAN. Tested with Safari on
iOS and Chrome/Edge on desktop.

## Quick start

Prereqs: Linux box on the LAN, Python 3.10+, Node 20+, `sqlite3` cli.

```bash
git clone https://github.com/numbererikson/limalego.git
cd limalego

# 1) Backend — download data, init DB, install deps
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/scripts/download_rebrickable.py   # ~15 MB
.venv/bin/python backend/scripts/init_db.py
.venv/bin/python backend/scripts/import_csv.py             # ~30 s, ~130 MB DB
.venv/bin/python backend/scripts/migrate_add_elements.py   # element photos

# 2) Frontend
cd frontend
npm install
cd ..

# 3) Run both in dev mode
.venv/bin/uvicorn --app-dir backend app.main:app --host 0.0.0.0 --port 8000 &
( cd frontend && npm run dev -- --host 0.0.0.0 ) &
```

Open `https://<your-server-ip>:5173/` on your phone. Self-signed cert — accept
the browser warning. iOS Safari and the camera both require HTTPS, which Vite's
`@vitejs/plugin-basic-ssl` provides automatically.

### Install as systemd services (optional, recommended)

```bash
bash backend/systemd/install.sh
sudo systemctl enable --now limalego-backend.service
sudo systemctl enable --now limalego-frontend.service
sudo systemctl enable --now limalego-backup.timer
```

### Firewall

If you run UFW or similar, allow your LAN range on the two ports:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 5173 proto tcp
sudo ufw allow from 192.168.0.0/16 to any port 8000 proto tcp
```

### Updating the Rebrickable data

```bash
.venv/bin/python backend/scripts/download_rebrickable.py --force
.venv/bin/python backend/scripts/import_csv.py
.venv/bin/python backend/scripts/migrate_add_elements.py
```

Your tracked-set statuses and `confirmed_qty` are preserved across re-imports.

## Architecture

```
limalego/
├── backend/
│   ├── app/                 FastAPI app
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── schema.sql       8 tables
│   │   ├── routes/          sets, inventory, scan, stats
│   │   └── services/        brickognize wrapper
│   ├── scripts/             download, init, import, backup, restore
│   └── systemd/             unit templates
├── frontend/                Vite + React app
├── data/                    Rebrickable CSV dumps (gitignored)
└── backups/                 daily JSON snapshots (gitignored)
```

The SQLite DB holds Rebrickable master data **and** user state (tracked sets,
confirmed quantities, scan history). To reset everything, delete
`backend/db/lego.db` and re-run `init_db.py` + `import_csv.py`.

## Limitations

- **Brickognize identifies one dominant part per image.** No multi-object
  detection. For a tabletop full of bricks you'd need to crop client-side; not
  implemented. The single-piece flow is fine for "I'm holding this brick — does
  it belong to one of my sets?" which is the actual workflow.
- **No color detection.** Brickognize returns the shape; the app asks you to
  tap the color you actually see. (Almost everyone sorts bricks by color
  anyway.)
- **Single-user.** No accounts; the database is yours. Run a separate instance
  per person.

## Credits

- [Rebrickable](https://rebrickable.com/) — parts/sets database, photos.
- [Brickognize](https://brickognize.com/) — public part-recognition API.
- LEGO® is a registered trademark of the LEGO Group, which does not sponsor,
  endorse, or authorize this software.

## License

MIT — see [LICENSE](LICENSE).
