/** Shared UI components */

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`
      bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6
      shadow-[0_2px_16px_rgba(0,0,0,0.25)]
      hover:border-[var(--border-light)] transition-[border-color] duration-300
      ${className}
    `}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        {label && <p className="text-xs text-[var(--text-muted)]">{label}</p>}
        <span className="text-xs font-mono text-emerald-400">{Math.round(clamped)}%</span>
      </div>
      <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const base = `
    inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
    transition-all duration-200 cursor-pointer
    active:scale-[0.97]
  `;
  const variants = {
    primary: `
      bg-gradient-to-r from-emerald-500 to-teal-500 text-white
      shadow-md shadow-emerald-500/20
      hover:shadow-lg hover:shadow-emerald-500/30 hover:brightness-110
      disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100
    `,
    secondary: `
      bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)]
      hover:bg-[var(--border)] hover:border-[var(--border-light)]
    `,
    danger: `
      bg-red-500/15 text-red-400 border border-red-500/30
      hover:bg-red-500/25 hover:border-red-500/50
    `,
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function BitGrid({ bits, activeIndex }: { bits: number[]; activeIndex?: number }) {
  return (
    <div className="flex flex-wrap gap-1 my-3 max-h-[200px] overflow-y-auto p-1">
      {bits.map((b, i) => (
        <div
          key={i}
          className={`
            w-7 h-7 flex items-center justify-center text-xs font-bold rounded-lg border transition-all duration-150
            ${b === 0
              ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }
            ${i < 8 ? "opacity-50" : ""}
            ${i === activeIndex ? "ring-2 ring-emerald-400 border-emerald-400 scale-110" : ""}
          `}
          title={`Bit ${i}${i < 8 ? " (header)" : ""}`}
        >
          {b}
        </div>
      ))}
    </div>
  );
}

export function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 min-w-[100px] sm:min-w-[130px]">
      <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wider font-medium">{label}</div>
    </div>
  );
}

export function SectionTitle({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
      {icon && <span>{icon}</span>}
      {children}
    </h2>
  );
}

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <span className="text-4xl mb-3 opacity-40">{icon}</span>
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-500/8 border border-red-500/25 text-red-400 rounded-xl p-4 mt-4 text-sm flex items-start gap-3 animate-fade-in">
      <span className="text-base mt-0.5">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="bg-emerald-500/8 border border-emerald-500/25 text-emerald-400 rounded-xl p-4 mt-4 text-sm flex items-start gap-3 animate-fade-in">
      <span className="text-base mt-0.5">✅</span>
      <span>{message}</span>
    </div>
  );
}

export function DropZone({ id, onFileChange, onDrop, title, subtitle }: {
  id: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="
        border-2 border-dashed border-[var(--border)] rounded-2xl p-6 sm:p-10 text-center
        hover:border-emerald-400/40 hover:bg-emerald-500/3
        transition-all duration-300 cursor-pointer group
      "
      onClick={() => document.getElementById(id)?.click()}
    >
      <div className="text-4xl mb-3 opacity-30 group-hover:opacity-50 transition-opacity">📁</div>
      <p className="text-[var(--text-secondary)] mb-1">{title}</p>
      <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
      <input
        id={id}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
