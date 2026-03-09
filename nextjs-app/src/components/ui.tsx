/** Shared UI components */

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6 mb-6 ${className}`}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="mt-2">
      <div className="w-full h-1.5 bg-[#2a2d3a] rounded-full overflow-hidden">
        <div
          className="h-full bg-green-400 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {label && <p className="text-xs text-gray-500 mt-1">{label}</p>}
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
  const base = "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer";
  const variants = {
    primary: "bg-green-400 text-gray-900 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed",
    secondary: "bg-[#2a2d3a] text-gray-200 hover:bg-[#3a3d4a]",
    danger: "bg-red-500 text-white hover:brightness-110",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function BitGrid({ bits, activeIndex }: { bits: number[]; activeIndex?: number }) {
  return (
    <div className="flex flex-wrap gap-1 my-3">
      {bits.map((b, i) => (
        <div
          key={i}
          className={`w-7 h-7 flex items-center justify-center text-xs font-semibold rounded border transition-all
            ${b === 0 ? "bg-blue-500/20 text-blue-400 border-blue-500/50" : "bg-red-500/20 text-red-400 border-red-500/50"}
            ${i < 8 ? "opacity-60" : ""}
            ${i === activeIndex ? "ring-2 ring-green-400 border-green-400" : ""}`}
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
    <div className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-4 py-3 min-w-[120px]">
      <div className="text-2xl font-bold text-green-400">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
