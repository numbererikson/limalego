import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Inventory, PartRow } from "../api";
import Header from "../components/Header";
import PartThumb from "../components/PartThumb";
import { colorSortKey, compareSortKey } from "../lib/color";

type Filter = "missing" | "have" | "all";

export default function SetDetail() {
  const { setNum = "" } = useParams();
  const [inv, setInv] = useState<Inventory | null>(null);
  const [filter, setFilter] = useState<Filter>("missing");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [includeSpares, setIncludeSpares] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.inventory(setNum, false, true).then(setInv).catch((e) => setErr(String(e)));
  }, [setNum]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function bump(p: PartRow, delta: number) {
    const next = Math.max(0, Math.min(p.required_qty, p.confirmed_qty + delta));
    if (next === p.confirmed_qty) return;
    const key = `${p.part_num}-${p.color_id}-${p.is_spare}`;
    setBusy(key);
    setInv((prev) => {
      if (!prev) return prev;
      const parts = prev.parts.map((row) =>
        row.part_num === p.part_num && row.color_id === p.color_id && row.is_spare === p.is_spare
          ? { ...row, confirmed_qty: next, missing_qty: row.required_qty - next }
          : row,
      );
      const confirmed = parts.reduce((a, r) => a + (r.is_spare ? 0 : r.confirmed_qty), 0);
      const missing   = parts.reduce((a, r) => a + (r.is_spare ? 0 : r.missing_qty), 0);
      return { ...prev, parts, progress: { ...prev.progress, confirmed, missing } };
    });
    try {
      await api.setInventoryQty(setNum, p.part_num, p.color_id, next, p.is_spare);
    } catch (e) {
      setErr(String(e));
      reload();
    } finally {
      setBusy(null);
    }
  }

  const allParts = inv?.parts ?? [];
  const spareCount = allParts.filter((p) => p.is_spare).reduce((a, p) => a + p.required_qty, 0);
  const effective  = includeSpares ? allParts : allParts.filter((p) => !p.is_spare);

  const counts = {
    missing: effective.reduce((a, p) => a + p.missing_qty,   0),
    have:    effective.reduce((a, p) => a + p.confirmed_qty, 0),
    all:     effective.reduce((a, p) => a + p.required_qty,  0),
  };

  const needle = q.trim().toLowerCase();
  const afterTabAndSearch = effective
    .filter((p) => {
      if (filter === "missing") return p.missing_qty > 0;
      if (filter === "have")    return p.confirmed_qty > 0;
      return true;
    })
    .filter((p) =>
      !needle ||
      p.part_name.toLowerCase().includes(needle) ||
      p.part_num.toLowerCase().includes(needle) ||
      p.color_name.toLowerCase().includes(needle),
    );

  const colorCounts = useMemo(() => {
    const m = new Map<string, { rgb: string | null; count: number }>();
    afterTabAndSearch.forEach((p) => {
      const e = m.get(p.color_name);
      if (e) e.count++;
      else m.set(p.color_name, { rgb: p.color_rgb, count: 1 });
    });
    return [...m.entries()]
      .sort((a, b) =>
        compareSortKey(colorSortKey(a[1].rgb), colorSortKey(b[1].rgb))
        || a[0].localeCompare(b[0]),
      )
      .map(([name, v]) => ({ name, rgb: v.rgb, count: v.count }));
  }, [afterTabAndSearch]);

  const filteredByColor = colorFilter
    ? afterTabAndSearch.filter((p) => p.color_name === colorFilter)
    : afterTabAndSearch;

  const sorted = [...filteredByColor].sort(
    (a, b) =>
      compareSortKey(colorSortKey(a.color_rgb), colorSortKey(b.color_rgb)) ||
      a.color_name.localeCompare(b.color_name) ||
      a.part_name.localeCompare(b.part_name)   ||
      a.part_num.localeCompare(b.part_num),
  );

  const groups: { color_name: string; color_rgb: string | null; items: PartRow[] }[] =
    colorFilter
      ? [{ color_name: colorFilter, color_rgb: filteredByColor[0]?.color_rgb ?? null, items: sorted }]
      : (() => {
          const acc: Record<string, { color_rgb: string | null; items: PartRow[] }> = {};
          sorted.forEach((p) => {
            if (!acc[p.color_name]) acc[p.color_name] = { color_rgb: p.color_rgb, items: [] };
            acc[p.color_name].items.push(p);
          });
          return Object.entries(acc).map(([name, v]) => ({
            color_name: name,
            color_rgb: v.color_rgb,
            items: v.items,
          }));
        })();

  const prog = inv?.progress;
  const pct = prog && prog.required ? Math.round((prog.confirmed / prog.required) * 100) : 0;

  return (
    <div className="min-h-full flex flex-col">
      <Header
        title={inv?.set.name ?? "…"}
        subtitle={`${setNum}${inv?.set.theme ? " · " + inv.set.theme : ""}`}
        back="/"
      />

      <main className="flex-1 px-4 pb-28">
        {err && <p className="text-[var(--color-danger)] text-sm">{err}</p>}

        {inv?.set.img_url && (
          <a
            href={`https://rebrickable.com/sets/${encodeURIComponent(setNum)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[var(--color-surface)] rounded-xl mb-3 overflow-hidden block relative"
          >
            <img
              src={inv.set.img_url}
              alt={inv.set.name}
              className="w-full max-h-64 object-contain"
              loading="lazy"
            />
            <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
              📖 building instructions ↗
            </span>
          </a>
        )}

        {prog && (
          <section className="bg-[var(--color-surface)] rounded-xl p-4 mb-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--color-muted)]">Progress</span>
              <span className="font-semibold tabular-nums">
                {counts.have} / {counts.all}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-2">
              {counts.missing} parts missing
              {spareCount > 0 && (
                <>
                  {" · "}
                  <button
                    onClick={() => setIncludeSpares((v) => !v)}
                    className="text-[var(--color-accent)] underline"
                  >
                    {includeSpares ? `hide spares (−${spareCount})` : `include spares (+${spareCount})`}
                  </button>
                </>
              )}
            </p>
          </section>
        )}

        <div className="bg-[var(--color-surface)] rounded-xl p-1 flex mb-3 text-sm">
          <TabBtn label={`Need · ${counts.missing}`} active={filter === "missing"} onClick={() => setFilter("missing")} />
          <TabBtn label={`Have · ${counts.have}`}    active={filter === "have"}    onClick={() => setFilter("have")} />
          <TabBtn label={`All · ${counts.all}`}      active={filter === "all"}     onClick={() => setFilter("all")} />
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter (e.g. 'plate', '3001', 'red')"
          className="w-full bg-[var(--color-surface)] rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] mb-3"
          autoCapitalize="none"
          autoCorrect="off"
        />

        {colorCounts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-4 px-4 scrollbar-none">
            <ColorChip
              label={`All · ${afterTabAndSearch.length}`}
              rgb={null}
              active={colorFilter === null}
              onClick={() => setColorFilter(null)}
            />
            {colorCounts.map((c) => (
              <ColorChip
                key={c.name}
                label={`${c.name} · ${c.count}`}
                rgb={c.rgb}
                active={colorFilter === c.name}
                onClick={() => setColorFilter((cur) => (cur === c.name ? null : c.name))}
              />
            ))}
          </div>
        )}

        {groups.map((g) => (
          <section key={g.color_name} className="mb-4">
            {!colorFilter && groups.length > 1 && (
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5 px-1 flex items-center gap-2">
                <span
                  className="color-swatch !w-3 !h-3"
                  style={{ background: g.color_rgb ? `#${g.color_rgb}` : "#888" }}
                />
                <span>{g.color_name} · {g.items.length}</span>
              </h3>
            )}
            <ul className="space-y-1.5">
              {g.items.map((p) => {
            const key = `${p.part_num}-${p.color_id}-${p.is_spare}`;
            const isBusy = busy === key;
            return (
              <li
                key={key}
                className="bg-[var(--color-surface)] rounded-lg p-2.5 flex gap-3 items-center"
              >
                <PartThumb
                  partNum={p.part_num}
                  colorId={p.color_id}
                  elementId={p.element_id}
                  className="w-14 h-14 rounded-md shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.part_name}</p>
                  <p className="text-xs text-[var(--color-muted)] truncate flex items-center gap-1.5 mt-0.5">
                    <span
                      className="color-swatch !w-3 !h-3"
                      style={{ background: p.color_rgb ? `#${p.color_rgb}` : "#888" }}
                    />
                    <span>{p.color_name} · {p.part_num}</span>
                    {p.is_spare ? <span className="text-[var(--color-accent)]">· spare</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => bump(p, -1)}
                    disabled={p.confirmed_qty <= 0 || isBusy}
                    className="w-9 h-9 rounded-full bg-white/10 active:bg-white/20 text-lg disabled:opacity-30"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <span className="font-mono tabular-nums text-sm w-14 text-center">
                    {p.confirmed_qty}/{p.required_qty}
                  </span>
                  <button
                    onClick={() => bump(p, +1)}
                    disabled={p.confirmed_qty >= p.required_qty || isBusy}
                    className="w-9 h-9 rounded-full bg-[var(--color-success)] text-black font-semibold text-lg active:opacity-80 disabled:opacity-30"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
            </ul>
          </section>
        ))}
        {inv && groups.length === 0 && (
          <p className="text-center text-[var(--color-muted)] py-10">
            {filter === "missing" && "All collected! 🎉"}
            {filter === "have"    && "Nothing marked as collected yet."}
            {filter === "all"     && "No results."}
          </p>
        )}
      </main>

      <div className="safe-bottom fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
        <Link
          to={`/scan/${encodeURIComponent(setNum)}`}
          className="block text-center bg-[var(--color-accent)] text-black font-semibold py-4 rounded-2xl text-lg"
        >
          📷 Scan bricks
        </Link>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg font-medium transition ${
        active ? "bg-white/10 text-white" : "text-[var(--color-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function ColorChip({
  label,
  rgb,
  active,
  onClick,
}: {
  label: string;
  rgb: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex items-center gap-1.5 ${
        active
          ? "bg-[var(--color-accent)] text-black font-semibold"
          : "bg-[var(--color-surface)] text-[var(--color-muted)]"
      }`}
    >
      {rgb !== null && (
        <span
          className="color-swatch !w-3 !h-3"
          style={{ background: rgb ? `#${rgb}` : "#888" }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
