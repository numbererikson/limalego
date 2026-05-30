import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { SetRow } from "../api";
import Header from "../components/Header";

export default function SetSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const handle = setTimeout(() => {
      api
        .searchSets(q.trim())
        .then(setResults)
        .catch((e) => setErr(String(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  async function add(setNum: string) {
    setBusy(setNum);
    try {
      await api.importSet(setNum);
      nav(`/set/${encodeURIComponent(setNum)}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header title="Add set" back />
      <div className="px-4 py-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Set name or number (e.g. 10497, stranger)"
          className="w-full bg-[var(--color-surface)] rounded-xl px-4 py-3 text-base outline-none placeholder:text-[var(--color-muted)]"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
      <main className="flex-1 px-4">
        {loading && <p className="text-[var(--color-muted)] text-sm">Searching…</p>}
        {err && <p className="text-[var(--color-danger)] text-sm">{err}</p>}

        <ul className="space-y-2 pb-6">
          {results.map((s) => (
            <li
              key={s.set_num}
              className="bg-[var(--color-surface)] rounded-xl p-4 flex gap-3 items-center"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{s.name}</h3>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  {s.set_num} · {s.theme ?? "—"} · {s.year ?? "—"} · {s.total_parts ?? 0} parts
                </p>
              </div>
              <button
                onClick={() => add(s.set_num)}
                disabled={busy === s.set_num || s.status !== "catalog"}
                className="px-4 py-2 rounded-full bg-[var(--color-accent)] text-black font-semibold text-sm disabled:opacity-40"
              >
                {s.status !== "catalog"
                  ? "owned"
                  : busy === s.set_num
                  ? "…"
                  : "add"}
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
