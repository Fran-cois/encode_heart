/** "How does this work?" explainer section – starts simple, adds formulas. */

export default function HowItWorks() {
  return (
    <section className="relative border-t border-[var(--border)] overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        {/* Section title */}
        <div className="text-center mb-14">
          <span className="inline-block text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-400/80 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 mb-4">
            Under the hood
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            How does this{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              work?
            </span>
          </h2>
          <p className="text-[var(--text-muted)] text-sm mt-2 max-w-lg mx-auto">
            Your heart can hold all your secrets. Here&apos;s how we encode the power of your pulse into hidden messages.
          </p>
        </div>

        {/* ───── Layer 1: The Big Picture ───── */}
        <div className="mb-14">
          <StepHeader number={1} title="The big picture" />
          <div className="grid md:grid-cols-3 gap-5 mt-5">
            <SimpleCard
              icon="💓"
              title="Your skin pulsates"
              text="Each heartbeat pushes blood through tiny capillaries beneath the skin. This micro-flush subtly changes how skin reflects light, especially in the green wavelength (~540 nm). It's invisible to the eye, but a camera can see it."
            />
            <SimpleCard
              icon="📹"
              title="The camera reads it"
              text="Remote Photoplethysmography (rPPG) extracts this pulse signal from video: average the green channel over a forehead region, filter the time series, and find the dominant frequency — that's the heart rate."
            />
            <SimpleCard
              icon="🔐"
              title="We hijack the signal"
              text="If we can read a heart-rate frequency, we can write one. We inject a faint oscillation at a chosen frequency into the forehead pixels. Each frequency encodes a bit: one frequency for 0, another for 1."
            />
          </div>
        </div>

        {/* ───── Layer 2: Encoding step by step ───── */}
        <div className="mb-14">
          <StepHeader number={2} title="Encoding step by step" />
          <div className="mt-5 space-y-4">
            <ProcessStep
              step="a"
              title="Serialise the secret"
              description={
                <>
                  The message is converted to UTF-8 bytes, prefixed with an 8-bit
                  length header. For example <Mono>&quot;Hi&quot;</Mono> →{" "}
                  <Mono>00000010 01001000 01101001</Mono>{" "}
                  <span className="text-[var(--text-muted)]">(2 bytes + payload)</span>.
                </>
              }
            />
            <ProcessStep
              step="b"
              title="Segment the video"
              description={
                <>
                  The video is split into fixed-duration segments (default{" "}
                  <Mono>2 s</Mono>). Each segment carries exactly one bit, so the
                  total video length needed is{" "}
                  <Formula>T = (8 + 8 × len(secret)) × segment_duration</Formula>.
                </>
              }
            />
            <ProcessStep
              step="c"
              title="Modulate the forehead pixels"
              description={
                <>
                  For each segment, a sinusoid is added to the green channel of every
                  pixel inside the forehead ROI:
                  <FormulaBlock>
                    G′(x, y, t) = G(x, y, t) + A · sin(2π · f<Sub>bit</Sub> · t)
                  </FormulaBlock>
                  where <Formula>A ≈ 10</Formula> (out of 255) is imperceptible, and:
                  <div className="flex gap-6 mt-2 ml-4">
                    <span className="text-sm">
                      <Mono>bit = 0</Mono> → <Formula>f₀ = 5.0 Hz</Formula>
                    </span>
                    <span className="text-sm">
                      <Mono>bit = 1</Mono> → <Formula>f₁ = 8.0 Hz</Formula>
                    </span>
                  </div>
                </>
              }
            />
          </div>
        </div>

        {/* ───── Layer 3: Decoding & the math ───── */}
        <div className="mb-14">
          <StepHeader number={3} title="Decoding & the math" />
          <div className="mt-5 space-y-4">
            <ProcessStep
              step="a"
              title="Extract the rPPG signal"
              description={
                <>
                  For each segment, the mean green intensity of the forehead ROI is
                  computed frame by frame, giving a 1-D signal:
                  <FormulaBlock>
                    s[n] = mean(G(x, y, n))&ensp; for (x, y) ∈ ROI
                  </FormulaBlock>
                  This signal is bandpass-filtered between{" "}
                  <Formula>4 – 10 Hz</Formula> to isolate the modulation
                  frequencies.
                </>
              }
            />
            <ProcessStep
              step="b"
              title="FFT & frequency detection"
              description={
                <>
                  A Fast Fourier Transform converts the filtered signal to the
                  frequency domain:
                  <FormulaBlock>
                    S[k] = Σ<Sub>n=0…N-1</Sub> s[n] · e<Sup>−j2πkn/N</Sup>
                  </FormulaBlock>
                  The power at <Formula>f₀</Formula> vs <Formula>f₁</Formula> is
                  compared. The dominant frequency determines the bit:
                  <FormulaBlock>
                    bit = |S(f₁)|² {">"} |S(f₀)|² &ensp;?&ensp; 1 : 0
                  </FormulaBlock>
                </>
              }
            />
            <ProcessStep
              step="c"
              title="Reassemble the message"
              description={
                <>
                  The first 8 bits give the byte-length of the payload. The remaining
                  bits are grouped into bytes and decoded back to UTF-8 → the original
                  secret.
                </>
              }
            />
          </div>
        </div>

        {/* ───── Pipeline diagram ───── */}
        <div className="mt-10">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 text-center overflow-x-auto">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
              Full pipeline
            </p>
            <div className="inline-flex items-center gap-2 text-sm font-mono flex-wrap justify-center">
              <Pill color="emerald">Secret</Pill>
              <Arrow />
              <Pill color="gray">UTF-8 bits</Pill>
              <Arrow />
              <Pill color="gray">sin(f₀) / sin(f₁)</Pill>
              <Arrow />
              <Pill color="teal">Modulated video</Pill>
            </div>
            <div className="my-3 text-[var(--text-muted)] text-xs">⟱ send video ⟱</div>
            <div className="inline-flex items-center gap-2 text-sm font-mono flex-wrap justify-center">
              <Pill color="teal">Modulated video</Pill>
              <Arrow />
              <Pill color="gray">rPPG signal</Pill>
              <Arrow />
              <Pill color="gray">FFT peak</Pill>
              <Arrow />
              <Pill color="gray">bits</Pill>
              <Arrow />
              <Pill color="emerald">Secret</Pill>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────── Sub-components ──────────── */

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400">
        {number}
      </span>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
    </div>
  );
}

function SimpleCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--border-light)] transition-colors duration-300">
      <span className="text-2xl">{icon}</span>
      <h4 className="text-sm font-semibold mt-3 mb-1.5">{title}</h4>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function ProcessStep({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--border-light)] transition-colors duration-300">
      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
        {step}
      </span>
      <div>
        <h4 className="text-sm font-semibold mb-1.5">{title}</h4>
        <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {description}
        </div>
      </div>
    </div>
  );
}

/* Inline code / mono */
function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)] text-emerald-400 text-[11px] font-mono">
      {children}
    </code>
  );
}

/* Inline formula */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <span className="formula-inline font-mono text-[var(--text-primary)] italic">
      {children}
    </span>
  );
}

/* Block formula */
function FormulaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 py-3 px-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl text-center font-mono text-sm italic text-[var(--text-primary)] overflow-x-auto">
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <sub className="text-[0.7em] not-italic">{children}</sub>;
}

function Sup({ children }: { children: React.ReactNode }) {
  return <sup className="text-[0.7em] not-italic">{children}</sup>;
}

/* Pipeline diagram helpers */
function Pill({ children, color }: { children: React.ReactNode; color: "emerald" | "teal" | "gray" }) {
  const styles = {
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    teal: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    gray: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]",
  };
  return (
    <span className={`inline-block px-3 py-1.5 rounded-lg border text-xs ${styles[color]}`}>
      {children}
    </span>
  );
}

function Arrow() {
  return <span className="text-[var(--text-muted)] text-xs">→</span>;
}
