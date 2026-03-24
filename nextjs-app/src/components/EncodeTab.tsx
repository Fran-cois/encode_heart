"use client";

import { useState, useCallback, useRef, Dispatch, SetStateAction } from "react";
import type { AppState, TabId } from "@/app/page";
import { Card, Btn, ProgressBar, BitGrid, StatPill, SectionTitle, EmptyState, ErrorBanner } from "./ui";
import { Config } from "@/lib/config";
import { textToBits } from "@/lib/bits";
import { loadVideo, extractFrames, framesToVideoBlob } from "@/lib/video";
import { encode, EncodeResult } from "@/lib/encoder";
import { decode, DecodeResult } from "@/lib/decoder";
import { renderVisualization } from "@/lib/visualize";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setVideo: (f: File) => void;
  switchTab: (t: TabId) => void;
}

export default function EncodeTab({ state, setState, setVideo, switchTab }: Props) {
  const [secret, setSecret] = useState("");
  const [amplitude, setAmplitude] = useState(Config.MODULATION_AMPLITUDE);
  const [segDur, setSegDur] = useState(Config.SEGMENT_DURATION);

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [encResult, setEncResult] = useState<EncodeResult | null>(null);
  const [verification, setVerification] = useState<DecodeResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  // Viz state
  const [vizProgress, setVizProgress] = useState(0);
  const [wizRunning, setWizRunning] = useState(false);
  const [vizUrl, setVizUrl] = useState("");
  const vizAbortRef = useRef<AbortController | null>(null);

  // Estimate
  const estimateBits = secret ? textToBits(secret).length : 0;
  const framesPerSeg = Math.round(segDur * (state.fps || 30));
  const framesNeeded = framesPerSeg * estimateBits;
  const minDurationSec = estimateBits * segDur;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const cancelViz = useCallback(() => {
    vizAbortRef.current?.abort();
  }, []);

  const runEncode = useCallback(async () => {
    if (!state.videoFile || !secret.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setError("");
    setEncResult(null);
    setVerification(null);
    setShowPreview(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");

    try {
      setPhase("Loading video…");
      setProgress(0);
      const video = await loadVideo(state.videoFile);
      
      setPhase("Extracting frames…");
      const { frames, fps } = await extractFrames(video, (p) => setProgress(p * 30), 320, ac.signal);
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      setPhase("Encoding secret…");
      const result = await encode(frames, fps, secret, amplitude, segDur, (p) => setProgress(30 + p * 40), ac.signal);

      setPhase("Generating video file…");
      const blob = await framesToVideoBlob(result.frames, fps, (p) => setProgress(70 + p * 30));

      setState((s) => ({
        ...s,
        encodedFrames: result.frames,
        sourceFrames: frames,
        fps,
        encodedBlob: blob,
      }));

      setEncResult(result);
      
      // Post-encode verification
      setPhase("Verifying decode…");
      try {
        const verif = await decode(result.frames, fps, segDur, (p) => setProgress(90 + p * 10), ac.signal);
        setVerification(verif);
      } catch {
        // verification is optional, don't fail the whole encode
      }

      setProgress(100);
      setPhase("");
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase("Cancelled");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [state.videoFile, secret, amplitude, segDur, setState]);

  // Download encoded video
  const downloadEncoded = useCallback(() => {
    if (!state.encodedBlob) return;
    const url = URL.createObjectURL(state.encodedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "encoded.webm";
    a.click();
    URL.revokeObjectURL(url);
  }, [state.encodedBlob]);

  // Render visualization
  const runViz = useCallback(async () => {
    if (!state.sourceFrames || !state.encodedFrames) return;
    const ac = new AbortController();
    vizAbortRef.current = ac;
    setWizRunning(true);
    setVizProgress(0);

    try {
      const vizFrames = await renderVisualization(
        state.sourceFrames,
        state.encodedFrames,
        state.fps,
        secret,
        amplitude,
        segDur,
        (p) => setVizProgress(p * 60),
        ac.signal
      );

      const blob = await framesToVideoBlob(vizFrames, state.fps, (p) => setVizProgress(60 + p * 40));
      if (vizUrl) URL.revokeObjectURL(vizUrl);
      setVizUrl(URL.createObjectURL(blob));
      setVizProgress(100);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // cancelled
      } else {
        setError("Error creating visualization");
      }
    } finally {
      setWizRunning(false);
      vizAbortRef.current = null;
    }
  }, [state.sourceFrames, state.encodedFrames, state.fps, secret, amplitude, segDur, vizUrl]);

  // Decode shortcut
  const goToDecode = useCallback(() => {
    if (state.encodedBlob) {
      const f = new File([state.encodedBlob], "encoded.webm", { type: "video/webm" });
      setVideo(f);
    }
    switchTab("decode");
  }, [state.encodedBlob, setVideo, switchTab]);

  const chartOpts = {
    responsive: true,
    animation: false as const,
    scales: {
      x: { ticks: { color: "#4b5563", maxTicksLimit: 8 }, grid: { color: "#1a1d27" } },
      y: { ticks: { color: "#4b5563" }, grid: { color: "#1a1d27" } },
    },
    plugins: { legend: { labels: { color: "#9ca3af", font: { size: 11 } } } },
    elements: { point: { radius: 0 }, line: { tension: 0.3 } },
  };

  return (
    <>
      <Card>
        <SectionTitle icon="🔐">Encode a secret</SectionTitle>

        {!state.videoFile ? (
          <EmptyState icon="🎥" message="Please record or import a video first." />
        ) : !state.analysisRun ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-4xl mb-3 opacity-40">💓</span>
            <p className="text-sm text-[var(--text-muted)] mb-4">You need to run the BPM analysis first before encoding.</p>
            <Btn onClick={() => switchTab("detect")}>💓 Go to Detect BPM</Btn>
          </div>
        ) : (
          <>
            {/* Secret input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Secret message</label>
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter your secret message here…"
                className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--text-primary)] resize-y min-h-[90px] focus:border-emerald-400/60 outline-none placeholder:text-[var(--text-muted)]"
                maxLength={255}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-[var(--text-muted)]">
                  {secret.length}/255 characters · {estimateBits} bits (8 header + {Math.max(0, estimateBits - 8)} payload) · ~{framesNeeded} frames
                  {minDurationSec > 0 && <> · min: {minDurationSec.toFixed(1)}s</>}
                </p>
                <div className="h-1 w-24 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100, (secret.length / 255) * 100)}%` }} />
                </div>
              </div>
              {minDurationSec > 0 && state.videoFile && (
                <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1.5">
                  <span>💡</span> Make sure your video is at least {minDurationSec.toFixed(1)} seconds long.
                </p>
              )}
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5 p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border)]">
              <div>
                <label className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-2">
                  <span>Amplitude</span>
                  <span className="font-mono text-emerald-400 text-xs">{amplitude}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={amplitude}
                  onChange={(e) => setAmplitude(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-snug">
                  Controls how visible the pixel changes are. Higher = more robust decoding, but less discreet.
                </p>
              </div>
              <div>
                <label className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-2">
                  <span>Segment duration</span>
                  <span className="font-mono text-emerald-400 text-xs">{segDur}s</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={segDur}
                  onChange={(e) => setSegDur(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-snug">
                  Longer segments are more robust (more cycles to detect the frequency) but reduce throughput (fewer bits per second).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Btn onClick={runEncode} disabled={running || !secret.trim()}>
                {running ? "⏳ Encoding in progress…" : "🚀 Encode"}
              </Btn>
              {running && <Btn variant="danger" onClick={cancel}>✕ Cancel</Btn>}
            </div>

            {running && <ProgressBar value={progress} label={phase} />}
          </>
        )}

        {error && <ErrorBanner message={error} />}
      </Card>

      {encResult && (
        <>
          <Card className="animate-slide-up">
            <SectionTitle icon="✅">Encoding complete</SectionTitle>
            <div className="flex flex-wrap gap-4 mb-5">
              <StatPill value={encResult.bits.length} label="Total bits" />
              <StatPill value={`${encResult.fps}`} label="FPS" />
              <StatPill value={encResult.framesPerSegment} label="Frames/segment" />
              <StatPill value={`${encResult.segments[0]?.freqHz ?? ""} / ${Config.FREQ_BIT_1} Hz`} label="Frequencies" />
            </div>

            <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">Encoded bits</h4>
            <BitGrid bits={encResult.bits} />

            {/* Post-encode verification */}
            {verification && (
              <div className={`rounded-xl p-4 mt-4 text-sm border flex items-start gap-3 animate-fade-in ${
                verification.message === secret
                  ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-400"
                  : "bg-red-500/8 border-red-500/25 text-red-400"
              }`}>
                <span className="text-base mt-0.5">{verification.message === secret ? "✅" : "⚠️"}</span>
                <span>
                  {verification.message === secret
                    ? `Verification OK — decode correct (confidence ${Math.round(verification.avgConfidence * 100)}%)`
                    : `Verification failed — decoded: "${verification.message}" (confidence ${Math.round(verification.avgConfidence * 100)}%)`}
                </span>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <Btn onClick={downloadEncoded}>💾 Download video</Btn>
              <Btn variant="secondary" onClick={() => {
                if (!showPreview && state.encodedBlob && !previewUrl) {
                  setPreviewUrl(URL.createObjectURL(state.encodedBlob));
                }
                setShowPreview((v) => !v);
              }}>
                {showPreview ? "🙈 Hide video" : "▶️ View video"}
              </Btn>
              <Btn onClick={goToDecode}>🔓 Decode now</Btn>
            </div>

            {showPreview && state.encodedBlob && (
              <div className="mt-4">
                <video
                  src={previewUrl || undefined}
                  controls
                  className="w-full max-w-[640px] mx-auto rounded-xl ring-1 ring-[var(--border)]"
                />
              </div>
            )}
          </Card>

          {/* Modulation chart for first few segments */}
          <Card className="animate-slide-up">
            <SectionTitle icon="📈">Modulation ({Math.min(4, encResult.segments.length)} of {encResult.segments.length} segments)</SectionTitle>
            {encResult.segments.slice(0, 4).map((seg, idx) => (
              <div key={idx} className="mb-4 p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border)]">
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  Segment {seg.bitIndex} — bit={seg.bitValue} — {seg.freqHz} Hz{" "}
                  {seg.isHeader ? "(header)" : "(payload)"}
                </p>
                <Line
                  data={{
                    labels: seg.signalAfter.map((_, i) => String(i)),
                    datasets: [
                      {
                        label: "Before",
                        data: seg.signalBefore,
                        borderColor: "#4b5563",
                        borderWidth: 1,
                      },
                      {
                        label: "After",
                        data: seg.signalAfter,
                        borderColor: "#34d399",
                        borderWidth: 1.5,
                      },
                      {
                        label: "Modulation",
                        data: seg.modulation,
                        borderColor: "#fb923c",
                        borderWidth: 1,
                        borderDash: [4, 4],
                      },
                    ],
                  }}
                  options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: true, labels: { color: "#9ca3af", boxWidth: 10, font: { size: 10 } } } } }}
                />
              </div>
            ))}
          </Card>

          {/* Visualization */}
          <Card className="animate-slide-up">
            <SectionTitle icon="👁">Encoding visualization</SectionTitle>
            <div className="flex gap-3">
              <Btn onClick={runViz} disabled={wizRunning}>
                {wizRunning ? "⏳ Generating…" : "🎨 Generate heatmap"}
              </Btn>
              {wizRunning && <Btn variant="danger" onClick={cancelViz}>✕ Cancel</Btn>}
            </div>
            {wizRunning && <ProgressBar value={vizProgress} label="Rendering visualization…" />}
            {vizUrl && (
              <video
                src={vizUrl}
                controls
                className="w-full max-w-[640px] rounded-xl mt-4 ring-1 ring-[var(--border)]"
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
