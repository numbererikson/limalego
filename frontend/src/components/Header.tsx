import { useNavigate } from "react-router-dom";

type Props = {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  right?: React.ReactNode;
};

export default function Header({ title, subtitle, back, right }: Props) {
  const nav = useNavigate();
  return (
    <header className="safe-top sticky top-0 z-30 bg-[var(--color-bg)]/90 backdrop-blur border-b border-white/5">
      <div className="flex items-center gap-3 px-4 py-3">
        {back && (
          <button
            onClick={() => (typeof back === "string" ? nav(back) : nav(-1))}
            className="text-2xl w-9 h-9 -ml-2 flex items-center justify-center"
            aria-label="Back"
          >
            ‹
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-[var(--color-muted)] truncate">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
