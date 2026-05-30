import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Detection, NeededInSet, NeededRow, ScanResult } from "../api";
import PartThumb from "../components/PartThumb";

type Toast = {
  feedback_id: number;
  set_num: string;
  label: string;
};

type State =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "result"; result: ScanResult }
  | { kind: "error"; message: string };

export default function Scan() {
  const { setNum: routeSetNum = "" } = useParams();
  const activeSet = routeSetNum || null;
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];
      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!cancelled) setCameraErr(String(lastErr));
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const snap = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setState({ kind: "scanning" });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
    );

    try {
      const result = await api.scan(blob, activeSet, "single");
      setState({ kind: "result", result });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, [activeSet]);

  async function takeColor(d: Detection, s: NeededInSet, n: NeededRow) {
    try {
      const r = await api.feedback(d.detection_id, "taken", {
        setNum: s.set_num,
        correctedPartNum: d.part_num,
        correctedColorId: n.color_id,
      });
      setToast({
        feedback_id: r.feedback_id,
        set_num: s.set_num,
        label: `${s.set_name}: +1 ${n.color_name}`,
      });
    } finally {
      setState({ kind: "idle" });
    }
  }

  async function reject(d: Detection) {
    try { await api.feedback(d.detection_id, "reject"); }
    finally { setState({ kind: "idle" }); }
  }

  async function skip(d: Detection) {
    try { await api.feedback(d.detection_id, "skip"); }
    finally { setState({ kind: "idle" }); }
  }

  async function undo() {
    if (!toast) return;
    try { await api.undoFeedback(toast.feedback_id, toast.set_num); }
    finally { setToast(null); }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="safe-top relative px-4 py-3 bg-gradient-to-b from-black/70 to-transparent text-white">
        <button onClick={() => nav(-1)} className="text-2xl">‹ back</button>
        <p className="text-xs opacity-70 mt-1">
          {activeSet ? `Building ${activeSet}` : "Free scan"}
        </p>
      </div>

      {cameraErr && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-[var(--color-danger)] mb-2">Camera not available.</p>
            <p className="text-xs text-white/60">{cameraErr}</p>
            <p className="text-xs text-white/60 mt-3">
              Make sure:
              <br/>1) the browser has camera permission (lock icon next to URL),
              <br/>2) no other app is using the camera,
              <br/>3) the page is loaded over HTTPS.
            </p>
            <button
              onClick={() => location.reload()}
              className="mt-4 px-4 py-2 rounded-full bg-[var(--color-accent)] text-black font-semibold"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {state.kind === "scanning" && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="animate-pulse text-4xl mb-3">🧱</div>
            <p>Identifying…</p>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="absolute inset-x-0 bottom-32 mx-4 bg-[var(--color-danger)] text-white p-4 rounded-xl text-sm">
          {state.message}
          <button
            onClick={() => setState({ kind: "idle" })}
            className="block mt-2 underline"
          >
            ok
          </button>
        </div>
      )}

      {state.kind === "result" && (
        <ResultSheet
          result={state.result}
          activeSet={activeSet}
          onTakeColor={takeColor}
          onReject={reject}
          onSkip={skip}
          onClose={() => setState({ kind: "idle" })}
        />
      )}

      {toast && state.kind === "idle" && (
        <div className="safe-top absolute top-14 inset-x-4 z-40 bg-[var(--color-success)]/95 text-black rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3">
          <span className="text-xl">✓</span>
          <span className="flex-1 text-sm font-medium truncate">{toast.label}</span>
          <button onClick={undo} className="font-semibold underline text-sm">
            undo
          </button>
        </div>
      )}

      {state.kind === "idle" && !cameraErr && (
        <div className="safe-bottom absolute bottom-0 left-0 right-0 flex justify-center pb-6">
          <button onClick={snap} className="snap-btn" aria-label="Capture">
            <span className="inner block" />
          </button>
        </div>
      )}
    </div>
  );
}

function ResultSheet({
  result,
  activeSet,
  onTakeColor,
  onReject,
  onSkip,
  onClose,
}: {
  result: ScanResult;
  activeSet: string | null;
  onTakeColor: (d: Detection, s: NeededInSet, n: NeededRow) => void;
  onReject:    (d: Detection) => void;
  onSkip:      (d: Detection) => void;
  onClose: () => void;
}) {
  const top = result.detections[0];
  const hit = top && top.total_missing > 0 ? top : null;
  const others = result.detections.slice(hit ? 1 : 0);

  return (
    <div className="safe-bottom absolute inset-x-0 bottom-0 bg-[var(--color-surface)] rounded-t-3xl p-4 max-h-[85%] overflow-y-auto shadow-2xl">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">Result</h2>
        <button onClick={onClose} className="text-[var(--color-muted)] text-sm">close</button>
      </div>

      {!top && (
        <p className="text-[var(--color-muted)] text-center py-6">
          Not recognized. Try again, closer.
        </p>
      )}

      {hit && (
        <HitCard
          d={hit}
          activeSet={activeSet}
          onTakeColor={onTakeColor}
          onSkip={onSkip}
          onReject={onReject}
        />
      )}

      {!hit && top && (
        <div className="rounded-xl p-4 bg-white/5 mb-3">
          <div className="flex gap-3 items-start">
            <PartThumb
              partNum={top.part_num}
              colorId={-1}
              src={top.img_url}
              className="w-16 h-16 rounded-lg shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">{top.name ?? top.part_num}</h3>
              <p className="text-xs text-[var(--color-muted)]">{top.part_num}</p>
              <p className="text-sm mt-2 text-[var(--color-muted)]">
                Not needed in <b className="text-white">any</b> of your sets.
              </p>
            </div>
          </div>
        </div>
      )}

      {others.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-[var(--color-muted)] cursor-pointer py-2">
            Other candidates ({others.length})
          </summary>
          {others.map((d) => (
            <AltCard key={d.detection_id} d={d} onTakeColor={onTakeColor} />
          ))}
        </details>
      )}
    </div>
  );
}

function HitCard({
  d,
  activeSet,
  onTakeColor,
  onSkip,
  onReject,
}: {
  d: Detection;
  activeSet: string | null;
  onTakeColor: (d: Detection, s: NeededInSet, n: NeededRow) => void;
  onSkip:   (d: Detection) => void;
  onReject: (d: Detection) => void;
}) {
  return (
    <div className="rounded-2xl p-4 mb-3 bg-[var(--color-success)]/15 border-2 border-[var(--color-success)]">
      <div className="flex gap-3 items-start mb-3">
        <PartThumb
          partNum={d.part_num}
          colorId={d.needed_in_sets[0]?.colors[0]?.color_id ?? -1}
          elementId={d.needed_in_sets[0]?.colors[0]?.element_id ?? null}
          src={d.img_url}
          className="w-20 h-20 rounded-lg shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--color-success)] font-semibold uppercase tracking-wider mb-1">
            ✓ YOU NEED · {d.total_missing} total
          </p>
          <h3 className="font-semibold leading-tight">{d.name ?? d.part_num}</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {d.part_num}
            {d.category && " · " + d.category}
          </p>
        </div>
      </div>

      {d.needed_in_sets.map((s) => (
        <SetGroup key={s.set_num} d={d} s={s} isActive={s.set_num === activeSet} onTakeColor={onTakeColor} />
      ))}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSkip(d)}
          className="flex-1 py-3 rounded-xl bg-white/10 text-sm"
        >
          ↷ skip
        </button>
        <button
          onClick={() => onReject(d)}
          className="px-4 py-3 rounded-xl bg-white/10 text-sm"
        >
          ✕ not this
        </button>
      </div>
    </div>
  );
}

function SetGroup({
  d,
  s,
  isActive,
  onTakeColor,
}: {
  d: Detection;
  s: NeededInSet;
  isActive: boolean;
  onTakeColor: (d: Detection, s: NeededInSet, n: NeededRow) => void;
}) {
  return (
    <div className={`mb-2 rounded-xl overflow-hidden ${isActive ? "border border-[var(--color-accent)]/50" : ""}`}>
      <div className="flex items-center gap-2 bg-black/40 px-3 py-2">
        {s.set_img_url && (
          <img src={s.set_img_url} alt="" className="w-8 h-8 rounded object-contain bg-white/5" loading="lazy" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {isActive && <span className="text-[var(--color-accent)] mr-1">★</span>}
            {s.set_name}
          </p>
          <p className="text-[10px] text-[var(--color-muted)]">{s.set_num} · needs {s.total_missing} total</p>
        </div>
      </div>
      <ul className="bg-black/20">
        {s.colors.map((n) => (
          <li key={n.color_id} className="border-t border-white/5 first:border-t-0">
            <button
              onClick={() => onTakeColor(d, s, n)}
              className="w-full flex items-center gap-3 p-2 text-left active:bg-white/10"
            >
              <PartThumb
                partNum={d.part_num}
                colorId={n.color_id}
                elementId={n.element_id}
                className="w-11 h-11 rounded shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm flex items-center gap-1.5">
                  <span
                    className="color-swatch !w-3 !h-3"
                    style={{ background: n.color_rgb ? `#${n.color_rgb}` : "#888" }}
                  />
                  <span className="font-medium">{n.color_name}</span>
                </p>
                <p className="text-xs text-[var(--color-muted)] tabular-nums">
                  {n.missing_qty} missing
                </p>
              </div>
              <span className="text-[var(--color-success)] font-bold text-base shrink-0 px-2">+1</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AltCard({
  d,
  onTakeColor,
}: {
  d: Detection;
  onTakeColor: (d: Detection, s: NeededInSet, n: NeededRow) => void;
}) {
  return (
    <div className="rounded-lg p-3 mt-1 bg-white/[0.03]">
      <div className="flex gap-3 items-start mb-2">
        <PartThumb
          partNum={d.part_num}
          colorId={d.needed_in_sets[0]?.colors[0]?.color_id ?? -1}
          elementId={d.needed_in_sets[0]?.colors[0]?.element_id ?? null}
          src={d.img_url}
          className="w-12 h-12 rounded shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-2">
            <h4 className="text-sm font-medium truncate">{d.name ?? d.part_num}</h4>
            <span className="text-xs text-[var(--color-muted)] shrink-0">
              {Math.round(d.confidence * 100)}%
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)] truncate">{d.part_num}</p>
        </div>
      </div>
      {d.needed_in_sets.length > 0 ? (
        <div className="space-y-1.5">
          {d.needed_in_sets.map((s) => (
            <div key={s.set_num} className="text-xs">
              <p className="text-[var(--color-muted)] mb-1">{s.set_name}:</p>
              <div className="flex flex-wrap gap-1.5">
                {s.colors.map((n) => (
                  <button
                    key={n.color_id}
                    onClick={() => onTakeColor(d, s, n)}
                    className="bg-[var(--color-success)]/20 text-[var(--color-success)] rounded-full px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <span
                      className="color-swatch !w-3 !h-3"
                      style={{ background: n.color_rgb ? `#${n.color_rgb}` : "#888" }}
                    />
                    {n.color_name} · {n.missing_qty} +1
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">not needed in any of your sets</p>
      )}
    </div>
  );
}
