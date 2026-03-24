"use client";

import { useState, useRef, useCallback } from "react";
import RecordTab from "@/components/RecordTab";
import DetectTab from "@/components/DetectTab";
import EncodeTab from "@/components/EncodeTab";
import DecodeTab from "@/components/DecodeTab";
import HowItWorks from "@/components/HowItWorks";
import HeroSection from "@/components/HeroSection";

export type TabId = "record" | "detect" | "encode" | "decode";
type PageView = "home" | "app" | "how";

export interface AppState {
  videoFile: File | null;
  videoUrl: string;
  encodedFrames: ImageData[] | null;
  sourceFrames: ImageData[] | null;
  fps: number;
  encodedBlob: Blob | null;
  analysisRun: boolean;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "record", label: "Record", icon: "📹" },
  { id: "detect", label: "Detect BPM", icon: "💓" },
  { id: "encode", label: "Encode", icon: "🔐" },
  { id: "decode", label: "Decode", icon: "🔓" },
];

export default function Home() {
  const [pageView, setPageView] = useState<PageView>("home");
  const [activeTab, setActiveTab] = useState<TabId>("record");
  const [state, setState] = useState<AppState>({
    videoFile: null,
    videoUrl: "",
    encodedFrames: null,
    sourceFrames: null,
    fps: 30,
    encodedBlob: null,
    analysisRun: false,
  });

  const videoNameRef = useRef<string>("");

  const setVideo = useCallback((file: File) => {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    const url = URL.createObjectURL(file);
    videoNameRef.current = file.name;
    setState((s) => ({
      ...s,
      videoFile: file,
      videoUrl: url,
      encodedFrames: null,
      sourceFrames: null,
      encodedBlob: null,
      analysisRun: false,
    }));
  }, [state.videoUrl]);

  const switchTab = useCallback((tab: TabId) => setActiveTab(tab), []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-[var(--border)] px-4 py-4 sm:px-8 sm:py-6">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-teal-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-[1200px] mx-auto flex flex-wrap items-center gap-4 sm:gap-6">
          {/* Orbital Heart */}
          <div className="relative w-[70px] h-[70px] sm:w-[110px] sm:h-[110px] flex-shrink-0 flex items-center justify-center">
            {/* Orbit ring 1 */}
            <div className="absolute inset-[8px] rounded-full border border-emerald-400/15 animate-ring-pulse" />
            {/* Orbit ring 2 */}
            <div className="absolute inset-[0px] rounded-full border border-teal-400/10 animate-ring-pulse" style={{ animationDelay: "1s" }} />
            {/* Orbit ring 3 (tilted) */}
            <div className="absolute inset-[4px] rounded-full border border-emerald-300/10" style={{ transform: "rotateX(60deg)" }} />

            {/* Orbiting particles - ring 1 */}
            <div className="absolute inset-0 flex items-center justify-center animate-orbit-ring-1">
              <div className="absolute w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" style={{ top: "4px", left: "50%", marginLeft: "-4px" }} />
              <div className="absolute w-1.5 h-1.5 rounded-full bg-teal-300/60" style={{ bottom: "8px", right: "12px" }} />
            </div>

            {/* Orbiting particles - ring 2 (reverse) */}
            <div className="absolute inset-[8px] flex items-center justify-center animate-orbit-ring-2">
              <div className="absolute w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_1px_rgba(52,211,153,0.4)]" style={{ bottom: "0px", left: "50%", marginLeft: "-3px" }} />
              <div className="absolute w-1 h-1 rounded-full bg-teal-400/80" style={{ top: "10px", left: "6px" }} />
            </div>

            {/* Orbiting particles - ring 3 */}
            <div className="absolute inset-[16px] flex items-center justify-center animate-orbit-ring-3">
              <div className="absolute w-1 h-1 rounded-full bg-emerald-200/60" style={{ top: "0px", right: "8px" }} />
            </div>

            {/* Central heart */}
            <div className="relative z-10 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-sm border border-emerald-400/20 flex items-center justify-center animate-heart-beat">
              <span className="text-xl sm:text-2xl drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]">💓</span>
            </div>

            {/* Glow behind heart */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 blur-xl" />
            </div>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Heart <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Codec</span>
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 italic hidden sm:block">
              Your heart can hold all your secrets
            </p>
            <span className="inline-block mt-1.5 text-[10px] font-medium uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
              open source
            </span>
          </div>

          {/* Page-level toggle */}
          <div className="ml-auto flex items-center bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-1 flex-shrink-0">
            <button
              onClick={() => setPageView("home")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                pageView === "home"
                  ? "bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/10"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              🏠 Home
            </button>
            <button
              onClick={() => setPageView("app")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                pageView === "app"
                  ? "bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/10"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              🛠 App
            </button>
            <button
              onClick={() => setPageView("how")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                pageView === "how"
                  ? "bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/10"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              📖 How it works
            </button>
            <a
              href="https://github.com/Fran-cois/encode_heart"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              GitHub
            </a>
          </div>
        </div>
      </header>

      {pageView === "home" ? (
        <div className="flex-1 animate-fade-in">
          <HeroSection onStart={() => setPageView("app")} />
        </div>
      ) : pageView === "app" ? (
        <>
          {/* Workflow steps + Tabs */}
          <nav className="relative bg-[var(--bg-deep)] border-b border-[var(--border)] px-2 sm:px-4 overflow-x-auto scrollbar-hide">
            {/* Orbital line connecting tabs */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent pointer-events-none -translate-y-1/2" />
            <div className="max-w-[1200px] mx-auto flex justify-start sm:justify-center min-w-max sm:min-w-0">
              {tabs.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className={`relative flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-medium cursor-pointer transition-all duration-200 group whitespace-nowrap ${
                    activeTab === t.id
                      ? "text-emerald-400"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {/* Step number with orbital ring */}
                  <span className="relative">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200 ${
                        activeTab === t.id
                          ? "bg-emerald-400 text-gray-900 shadow-md shadow-emerald-500/30"
                          : "bg-[var(--border)] text-[var(--text-muted)] group-hover:bg-[var(--border-light)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {activeTab === t.id && (
                      <span className="absolute -inset-1.5 rounded-full border border-emerald-400/30 animate-ring-pulse" />
                    )}
                  </span>
                  <span>{t.icon} {t.label}</span>

                  {/* Active indicator */}
                  {activeTab === t.id && (
                    <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-gradient-to-r from-emerald-400/0 via-emerald-400 to-emerald-400/0 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* Video indicator */}
          {state.videoFile && (
            <div className="bg-emerald-500/5 border-b border-[var(--border)] px-4 sm:px-6 py-2 text-xs animate-fade-in">
              <div className="max-w-[1200px] mx-auto flex justify-between items-center">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[var(--text-muted)]">Selected video:</span>
                <span className="text-emerald-400 font-medium">{videoNameRef.current}</span>
              </span>
              <span className="flex items-center gap-3">
                <a
                  href={state.videoUrl}
                  download={videoNameRef.current || "video.webm"}
                  className="text-emerald-400/70 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  ⬇ download
                </a>
                <button
                  onClick={() =>
                    setState((s) => ({ ...s, videoFile: null, videoUrl: "", encodedFrames: null, sourceFrames: null, encodedBlob: null, analysisRun: false }))
                  }
                  className="text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                >
                  ✕ remove
                </button>
              </span>
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 max-w-[1200px] w-full mx-auto p-4 sm:p-8">
            <div className="animate-slide-up">
              {activeTab === "record" && (
                <RecordTab state={state} setVideo={setVideo} switchTab={switchTab} />
              )}
              {activeTab === "detect" && (
                <DetectTab state={state} setState={setState} setVideo={setVideo} switchTab={switchTab} />
              )}
              {activeTab === "encode" && (
                <EncodeTab state={state} setState={setState} setVideo={setVideo} switchTab={switchTab} />
              )}
              {activeTab === "decode" && (
                <DecodeTab state={state} setVideo={setVideo} />
              )}
            </div>
          </main>
        </>
      ) : (
        <div className="flex-1 animate-fade-in">
          <HowItWorks />
        </div>
      )}

      {/* Disclaimer */}
      <div className="border-t border-amber-500/15 bg-amber-500/[0.03] px-4 sm:px-8 py-3 text-center">
        <p className="text-[11px] text-amber-400/80">
          ⚠️ This is a toy project — do not use for real encryption or to protect sensitive data.
        </p>
      </div>

      {/* Footer */}
      <footer className="relative border-t border-[var(--border)] px-4 sm:px-8 py-4 text-center text-[11px] text-[var(--text-muted)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/3 to-transparent pointer-events-none" />
        <span className="relative">Heart Codec — encode the power of your heart. Open source on GitHub.</span>
      </footer>
    </div>
  );
}
