"use client";

import { useEffect, useRef } from "react";

/* ─── Scroll-triggered fade-in observer ─── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("revealed"); obs.unobserve(el); } },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function RevealBlock({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal-on-scroll ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ─── Animated pulse wave SVG ─── */
function PulseWave({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 80" className={`w-full ${className}`} preserveAspectRatio="none">
      <path
        d="M0,40 L60,40 L80,40 L100,10 L120,70 L140,30 L160,50 L180,40 L240,40 L260,40 L280,10 L300,70 L320,30 L340,50 L360,40 L400,40"
        fill="none"
        stroke="url(#pulseGrad)"
        strokeWidth="2"
        className="animate-pulse-draw"
      />
      <defs>
        <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(52,211,153,0)" />
          <stop offset="30%" stopColor="rgba(52,211,153,0.8)" />
          <stop offset="70%" stopColor="rgba(45,212,191,0.8)" />
          <stop offset="100%" stopColor="rgba(45,212,191,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── Floating particle ─── */
function Particle({ size, x, y, delay, duration }: { size: number; x: string; y: string; delay: number; duration: number }) {
  return (
    <div
      className="absolute rounded-full bg-emerald-400/20 animate-float-particle"
      style={{ width: size, height: size, left: x, top: y, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
    />
  );
}

/* ─── Pipeline step ─── */
function PipelineStep({ icon, label, detail, delay }: { icon: string; label: string; detail: string; delay: number }) {
  return (
    <RevealBlock delay={delay} className="flex flex-col items-center text-center gap-2 group">
      <div className="relative">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 group-hover:border-emerald-400/40 transition-all duration-300">
          {icon}
        </div>
        <div className="absolute -inset-1 rounded-2xl bg-emerald-400/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">{label}</h3>
      <p className="text-xs text-[var(--text-muted)] max-w-[160px] leading-relaxed">{detail}</p>
    </RevealBlock>
  );
}

/* ─── Arrow connector ─── */
function Arrow() {
  return (
    <div className="hidden md:flex items-center justify-center px-2 pt-4">
      <svg width="32" height="16" viewBox="0 0 32 16" className="text-emerald-500/30">
        <path d="M0,8 L24,8 M20,3 L26,8 L20,13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, text, delay }: { icon: string; title: string; text: string; delay: number }) {
  return (
    <RevealBlock delay={delay}>
      <div className="h-full p-5 sm:p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-emerald-500/25 transition-all duration-300 group">
        <span className="text-2xl block mb-3 group-hover:scale-110 transition-transform duration-300 origin-left">{icon}</span>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">{title}</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{text}</p>
      </div>
    </RevealBlock>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  HeroSection                                                */
/* ════════════════════════════════════════════════════════════ */

export default function HeroSection({ onStart }: { onStart?: () => void }) {
  return (
    <section className="relative overflow-hidden">
      {/* ── Background decoration ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-emerald-500/8 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-gradient-radial from-teal-500/6 via-transparent to-transparent rounded-full blur-3xl" />
        {/* grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(52,211,153,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        {/* Floating particles */}
        <Particle size={4} x="10%" y="20%" delay={0} duration={6} />
        <Particle size={6} x="85%" y="15%" delay={1.5} duration={8} />
        <Particle size={3} x="70%" y="60%" delay={3} duration={7} />
        <Particle size={5} x="20%" y="75%" delay={2} duration={9} />
        <Particle size={4} x="50%" y="10%" delay={4} duration={7} />
        <Particle size={3} x="90%" y="80%" delay={1} duration={6} />
        <Particle size={5} x="35%" y="45%" delay={2.5} duration={8} />
      </div>

      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-8">
        {/* ═══ Hero headline ═══ */}
        <div className="pt-16 sm:pt-24 pb-10 sm:pb-14 text-center">
          <RevealBlock>
            <span className="inline-block text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-400/80 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 mb-5">
              Cardiac steganography
            </span>
          </RevealBlock>

          <RevealBlock delay={100}>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-5">
              Hide messages{" "}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent animate-gradient-shift bg-[length:200%_auto]">
                inside your pulse
              </span>
            </h2>
          </RevealBlock>

          <RevealBlock delay={200}>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed mb-8">
              Heart Codec turns the subtle skin-color changes caused by your heartbeat into a covert communication channel.
              Record a video, encode a secret message into your forehead pixels, and decode it later — all entirely in your browser.
            </p>
          </RevealBlock>

          {/* Pulse wave decoration */}
          <RevealBlock delay={300}>
            <div className="max-w-md mx-auto opacity-60 mb-8">
              <PulseWave />
            </div>
          </RevealBlock>

          {onStart && (
            <RevealBlock delay={400}>
              <button
                onClick={onStart}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                  shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/35
                  hover:brightness-110 active:scale-[0.97] transition-all duration-200 cursor-pointer"
              >
                <span>Launch the app</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </RevealBlock>
          )}
        </div>

        {/* ═══ Pipeline visual ═══ */}
        <div className="pb-14 sm:pb-20">
          <RevealBlock>
            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-8">
              How it works in 4 steps
            </p>
          </RevealBlock>

          <div className="flex flex-col md:flex-row items-center md:items-start justify-center gap-6 md:gap-0">
            <PipelineStep
              icon="📹"
              label="Record"
              detail="Film your face for a few seconds using your webcam"
              delay={100}
            />
            <Arrow />
            <PipelineStep
              icon="💓"
              label="Detect"
              detail="The rPPG algorithm extracts the cardiac signal from the pixels"
              delay={200}
            />
            <Arrow />
            <PipelineStep
              icon="🔐"
              label="Encode"
              detail="A secret message is modulated into the pulse frequency"
              delay={300}
            />
            <Arrow />
            <PipelineStep
              icon="🔓"
              label="Decode"
              detail="The message is recovered through spectral analysis of the video"
              delay={400}
            />
          </div>
        </div>

        {/* ═══ Key features ═══ */}
        <div className="pb-16 sm:pb-24">
          <RevealBlock>
            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-8">
              Features
            </p>
          </RevealBlock>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard
              icon="📖"
              title="Open source"
              text="The full codebase is available on GitHub. Inspect, fork, and contribute freely."
              delay={100}
            />
            <FeatureCard
              icon="👁️"
              title="Imperceptible"
              text="The injected signal amplitude (~10/255) is invisible to the naked eye. The video looks unchanged."
              delay={200}
            />
            <FeatureCard
              icon="📊"
              title="Spectral analysis"
              text="Decoding uses the FFT to identify the carrier frequencies (5 Hz and 8 Hz) for each bit."
              delay={300}
            />
            <FeatureCard
              icon="🧪"
              title="Experimental project"
              text="A fun proof-of-concept at the intersection of signal processing, computer vision, and steganography."
              delay={400}
            />
          </div>
        </div>
      </div>

      {/* Bottom border gradient */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
    </section>
  );
}
