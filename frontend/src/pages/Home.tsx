import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { SetRow } from "../api";
import Header from "../components/Header";

type StatsT = Awaited<ReturnType<typeof api.stats>>;

export default function Home() {
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [stats, setStats] = useState<StatsT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<SetRow | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.mySets().then(setSets).catch((e) => setErr(String(e)));
    api.stats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(s: SetRow, reset: boolean) {
    setMenuFor(null);
    try {
      await api.removeSet(s.set_num, reset);
      reload();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function setStatus(s: SetRow, status: "tracked" | "building" | "complete") {
    setMenuFor(null);
    try {
      await api.setStatus(s.set_num, status);
      reload();
    } catch (e) {
      setErr(String(e));
    }
  }

  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    (sets ?? []).forEach((s) => {
      const t = s.theme ?? "—";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [sets]);

  const filtered = (sets ?? []).filter(
    (s) => !themeFilter || (s.theme ?? "—") === themeFilter,
  );

  const groups = useMemo(() => {
    if (themeFilter) return [{ theme: themeFilter, items: filtered }];
    const m = new Map<string, SetRow[]>();
    filtered.forEach((s) => {
      const t = s.theme ?? "—";
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(s);
    });
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([theme, items]) => ({ theme, items }));
  }, [filtered, themeFilter]);

  return (
    <div className="min-h-full flex flex-col">
      <Header
        title="My sets"
        right={
          <div className="flex gap-2">
            <Link
              to="/scan"
              className="bg-white/10 rounded-full w-9 h-9 flex items-center justify-center text-base"
              aria-label="Free scan"
              title="Free scan"
            >
              📷
            </Link>
            <Link
              to="/search"
              className="bg-[var(--color-accent)] text-black font-semibold rounded-full w-9 h-9 flex items-center justify-center text-xl"
              aria-label="Add set"
            >
              +
            </Link>
          </div>
        }
      />

      <main className="flex-1 px-4 py-3">
        {err && <p className="text-[var(--color-danger)] text-sm">{err}</p>}

        {sets && sets.length === 0 && (
          <div className="text-center mt-20 text-[var(--color-muted)]">
            <p className="mb-4">You don't have any sets yet.</p>
            <Link
              to="/search"
              className="inline-block px-5 py-3 rounded-full bg-[var(--color-accent)] text-black font-semibold"
            >
              Add your first set
            </Link>
          </div>
        )}

        {themes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-4 px-4 scrollbar-none">
            <Chip
              label={`All · ${sets?.length ?? 0}`}
              active={themeFilter === null}
              onClick={() => setThemeFilter(null)}
            />
            {themes.map(([t, n]) => (
              <Chip
                key={t}
                label={`${t} · ${n}`}
                active={themeFilter === t}
                onClick={() => setThemeFilter((cur) => (cur === t ? null : t))}
              />
            ))}
          </div>
        )}

        {groups.map(({ theme, items }) => (
          <section key={theme} className="mb-5">
            {!themeFilter && (
              <h2 className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-2 px-1">
                {theme} · {items.length}
              </h2>
            )}
            <ul className="space-y-2">
              {items.map((s) => (
                <li
                  key={s.set_num}
                  className={`bg-[var(--color-surface)] rounded-xl flex items-stretch overflow-hidden ${
                    s.status === "building" ? "border-2 border-[var(--color-accent)]" : ""
                  }`}
                >
                  <Link
                    to={`/set/${encodeURIComponent(s.set_num)}`}
                    className="flex-1 flex gap-3 p-3 active:bg-white/5 min-w-0 items-center"
                  >
                    <div className="w-16 h-16 rounded-lg bg-white/5 shrink-0 overflow-hidden flex items-center justify-center">
                      {s.img_url ? (
                        <img
                          src={s.img_url}
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-2xl opacity-30">🧱</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <h3 className="font-medium truncate">{s.name}</h3>
                        <span className="text-xs text-[var(--color-muted)] shrink-0 tabular-nums">
                          {s.set_num}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                        {s.year ?? "—"} · {s.total_parts ?? 0} parts
                      </p>
                      <p className={`text-[10px] mt-1 uppercase tracking-wider ${
                        s.status === "building" ? "text-[var(--color-accent)] font-bold" :
                        s.status === "complete" ? "text-[var(--color-success)]" :
                        "text-[var(--color-muted)]"
                      }`}>
                        {statusLabel(s.status)}
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={() => setMenuFor(s)}
                    className="px-4 text-[var(--color-muted)] text-xl active:bg-white/5"
                    aria-label="Options"
                  >
                    ⋮
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {stats && sets && sets.length > 0 && <StatsFooter stats={stats} />}
      </main>

      {menuFor && (
        <div
          className="fixed inset-0 bg-black/60 z-40 flex items-end"
          onClick={() => setMenuFor(null)}
        >
          <div
            className="safe-bottom w-full bg-[var(--color-surface)] rounded-t-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10">
              <p className="font-medium truncate">{menuFor.name}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {menuFor.set_num} · current: {statusLabel(menuFor.status)}
              </p>
            </div>

            <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] px-4 mt-3 mb-1">Status</p>
            <div className="grid grid-cols-3 gap-1 px-2 mb-2">
              <StatusBtn label="Tracking" active={menuFor.status === "tracked"}  onClick={() => setStatus(menuFor, "tracked")} />
              <StatusBtn label="Building" active={menuFor.status === "building"} onClick={() => setStatus(menuFor, "building")} />
              <StatusBtn label="Done"     active={menuFor.status === "complete"} onClick={() => setStatus(menuFor, "complete")} />
            </div>

            <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] px-4 mt-3 mb-1">Remove</p>
            <button
              onClick={() => remove(menuFor, false)}
              className="w-full text-left px-4 py-3 active:bg-white/5 rounded-xl"
            >
              <p className="font-medium">Remove from my sets</p>
              <p className="text-xs text-[var(--color-muted)]">
                Keeps your progress if you add it back later.
              </p>
            </button>
            <button
              onClick={() => remove(menuFor, true)}
              className="w-full text-left px-4 py-3 active:bg-white/5 rounded-xl"
            >
              <p className="font-medium text-[var(--color-danger)]">
                Remove and reset progress
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                All marked bricks for this set go back to 0.
              </p>
            </button>
            <button
              onClick={() => setMenuFor(null)}
              className="w-full text-center px-4 py-3 mt-1 text-[var(--color-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  return ({
    tracked:  "tracking",
    building: "★ building",
    complete: "✓ done",
    archived: "archived",
    catalog:  "catalog",
  } as Record<string, string>)[s] ?? s;
}

function StatusBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`py-2.5 rounded-lg text-sm font-medium ${
        active
          ? "bg-[var(--color-accent)] text-black"
          : "bg-white/5 text-[var(--color-muted)] active:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function StatsFooter({ stats }: { stats: StatsT }) {
  const p = stats.parts;
  const pct = p.required ? Math.round((p.confirmed / p.required) * 100) : 0;
  return (
    <section className="mt-6 mb-4 bg-[var(--color-surface)] rounded-2xl p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-3">Overall</h2>

      <div className="flex justify-between text-sm mb-2">
        <span>{stats.sets_tracked} sets · {p.confirmed.toLocaleString()} / {p.required.toLocaleString()} parts</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </div>

      {stats.top_missing_colors.length > 0 && (
        <>
          <p className="text-xs text-[var(--color-muted)] mb-1.5">Most needed colors:</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {stats.top_missing_colors.map((c) => (
              <span
                key={c.color_id}
                className="text-xs bg-black/30 rounded-full px-2.5 py-1 flex items-center gap-1.5"
              >
                <span
                  className="color-swatch !w-3 !h-3"
                  style={{ background: c.color_rgb ? `#${c.color_rgb}` : "#888" }}
                />
                {c.color_name} <span className="tabular-nums text-[var(--color-muted)]">· {c.missing}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {stats.closest_to_done.length > 0 && (
        <>
          <p className="text-xs text-[var(--color-muted)] mb-1.5">Closest to done:</p>
          <ul className="space-y-1">
            {stats.closest_to_done.map((s) => {
              const sp = s.req ? Math.round((s.conf / s.req) * 100) : 0;
              return (
                <li key={s.set_num}>
                  <Link
                    to={`/set/${encodeURIComponent(s.set_num)}`}
                    className="flex items-center gap-2 py-1.5 text-sm"
                  >
                    {s.img_url && (
                      <img src={s.img_url} alt="" className="w-8 h-8 rounded bg-white/5 object-contain shrink-0" loading="lazy" />
                    )}
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-xs tabular-nums text-[var(--color-muted)]">{sp}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
        active
          ? "bg-[var(--color-accent)] text-black font-semibold"
          : "bg-[var(--color-surface)] text-[var(--color-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
