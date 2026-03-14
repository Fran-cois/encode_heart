"use client";

import { useState, useCallback, useRef } from "react";
import type { AppState, TabId } from "@/app/page";
import { Card, Btn, ProgressBar, StatPill, SectionTitle, EmptyState, ErrorBanner } from "./ui";
import { Dispatch, SetStateAction } from "react";
import { loadVideo, forEachFrame, framesToVideoBlob } from "@/lib/video";
import { detectFace, resetFaceSmoothing } from "@/lib/face";
import { extractGreenMean } from "@/lib/rppg";
import { bandpassFilter, computeSpectrum } from "@/lib/dsp";
import { estimateHeartRate } from "@/lib/rppg";
import { Config } from "@/lib/config";
import type { FaceROI } from "@/lib/face";
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

interface DetectResult {
  bpm: number;
  peakFreq: number;
  signalRaw: number[];
  signalFiltered: number[];
  specFreqs: number[];
  specPower: number[];
  fps: number;
  totalFrames: number;
  vizFrameUrl: string | null;
}

/** Small helper: inline info box */
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-xl p-3 sm:p-4 text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

export default function DetectTab({ state, setState, switchTab }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Viz overlay video state
  const [vizRunning, setVizRunning] = useState(false);
  const [vizProgress, setVizProgress] = useState(0);
  const [vizVideoUrl, setVizVideoUrl] = useState("");
  const vizAbortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const cancelViz = useCallback(() => {
    vizAbortRef.current?.abort();
  }, []);

  const generateVizVideo = useCallback(async () => {
    if (!state.videoFile) return;
    const ac = new AbortController();
    vizAbortRef.current = ac;
    setVizRunning(true);
    setVizProgress(0);

    try {
      const video = await loadVideo(state.videoFile);
      resetFaceSmoothing();

      const vizFrames: ImageData[] = [];
      const duration = video.duration;
      const fps = 30;
      const totalFrames = Math.round(duration * fps);

      await forEachFrame(
        video,
        async (frame, i) => {
          if (ac.signal.aborted) return;
          const roi = await detectFace(frame, frame.width, frame.height);
          // Draw overlay on each frame
          const overlaid = drawFrameOverlay(frame, roi);
          vizFrames.push(overlaid);
          if (i % 5 === 0) setVizProgress((i / totalFrames) * 70);
        },
        undefined,
        320,
        ac.signal
      );

      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      setVizProgress(70);
      const blob = await framesToVideoBlob(vizFrames, fps, (p) => setVizProgress(70 + p * 30));
      if (vizVideoUrl) URL.revokeObjectURL(vizVideoUrl);
      setVizVideoUrl(URL.createObjectURL(blob));
      setVizProgress(100);
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setVizRunning(false);
      vizAbortRef.current = null;
    }
  }, [state.videoFile, vizVideoUrl]);

  const run = useCallback(async () => {
    if (!state.videoFile) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setError("");
    setResult(null);
    setPhase("");

    try {
      setPhase("Loading video…");
      setProgress(0);
      const video = await loadVideo(state.videoFile);

      setPhase("Extracting rPPG signal (frame by frame)…");
      resetFaceSmoothing();
      const greenSignal: number[] = [];

      // Capture a mid-video frame with ROI overlay for visualization
      let vizFrameUrl: string | null = null;
      const midTarget = Math.round((video.duration * 30) / 2);

      const { fps } = await forEachFrame(
        video,
        async (frame, i) => {
          const roi = await detectFace(frame, frame.width, frame.height);
          if (roi) {
            greenSignal.push(extractGreenMean(frame, roi));
            // Capture a visualization frame near the middle of the video
            if (i === midTarget && !vizFrameUrl) {
              vizFrameUrl = renderRoiOverlay(frame, roi);
            }
          } else {
            greenSignal.push(greenSignal.length > 0 ? greenSignal[greenSignal.length - 1] : 0);
          }
          if (i % 10 === 0) setProgress((i / (video.duration * 30)) * 90);
        },
        undefined,
        320,
        ac.signal
      );

      setPhase("Frequency analysis…");
      setProgress(90);

      if (greenSignal.length === 0) {
        throw new Error("No frames extracted from the video.");
      }

      // Remove DC
      const mean = greenSignal.reduce((a, b) => a + b, 0) / greenSignal.length;
      const centered = greenSignal.map((v) => v - mean);

      // Bandpass filter
      const filtered = bandpassFilter(centered, fps, Config.BANDPASS_LOW, Config.BANDPASS_HIGH);

      // FFT spectrum
      const { freqs, power } = computeSpectrum(filtered, fps);

      // Estimate HR
      const { bpm, peakFreq } = estimateHeartRate(filtered, fps, Config.BANDPASS_LOW, Config.BANDPASS_HIGH);

      setProgress(100);
      setPhase("");

      // Downsample for charts
      const step = Math.max(1, Math.floor(greenSignal.length / 500));
      const rawDown = greenSignal.filter((_, i) => i % step === 0);
      const filtDown = filtered.filter((_, i) => i % step === 0);

      const specStep = Math.max(1, Math.floor(freqs.length / 300));
      const specF = freqs.filter((_, i) => i % specStep === 0).filter((f) => f <= 15);
      const specP = power.filter((_, i) => i % specStep === 0).slice(0, specF.length);

      setResult({ bpm, peakFreq, signalRaw: rawDown, signalFiltered: filtDown, specFreqs: specF, specPower: specP, fps, totalFrames: greenSignal.length, vizFrameUrl });
      setState((s) => ({ ...s, analysisRun: true }));
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase("");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [state.videoFile]);

  const chartOpts = {
    responsive: true,
    animation: false as const,
    scales: {
      x: { ticks: { color: "#4b5563", maxTicksLimit: 10 }, grid: { color: "#1a1d27" } },
      y: { ticks: { color: "#4b5563" }, grid: { color: "#1a1d27" } },
    },
    plugins: { legend: { labels: { color: "#9ca3af", font: { size: 11 } } } },
    elements: { point: { radius: 0 }, line: { tension: 0.3 } },
  };

  return (
    <>
      <Card>
        <SectionTitle icon="💓">Heart rate detection (rPPG)</SectionTitle>

        <InfoBox>
          <p className="mb-2">
            <strong className="text-[var(--text-primary)]">How it works:</strong> We use <em>remote photoplethysmography</em> (rPPG) — 
            a technique that extracts your pulse signal from video by tracking tiny color changes in the skin caused by blood flow.
            The green channel of the forehead region is averaged frame-by-frame, then analyzed in the frequency domain to find the dominant pulse frequency.
          </p>
          <p className="text-[var(--text-muted)]">
            ⚠️ <strong>The absolute BPM value may not be accurate</strong> — webcam quality, lighting, movement, and compression artifacts all affect the result. 
            What matters here is that <em>a periodic signal exists</em>: if we can detect a dominant frequency, we can also <em>inject</em> one during encoding. 
            The goal is to prove the signal is there, not to build a medical device.
          </p>
        </InfoBox>

        {!state.videoFile ? (
          <EmptyState icon="🎥" message="Please record or import a video first." />
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap gap-3">
              <Btn onClick={run} disabled={running}>
                {running ? "⏳ Analysis in progress…" : "🔬 Run analysis"}
              </Btn>
              {running && <Btn variant="danger" onClick={cancel}>✕ Cancel</Btn>}
              {!running && result && (
                <Btn variant="secondary" onClick={generateVizVideo} disabled={vizRunning}>
                  {vizRunning ? "⏳ Generating…" : "🎬 View analysis on video"}
                </Btn>
              )}
              {vizRunning && <Btn variant="danger" onClick={cancelViz}>✕ Cancel</Btn>}
              {!running && (
                <Btn variant="secondary" onClick={() => switchTab("encode")}>
                  🔐 Next step: Encode
                </Btn>
              )}
            </div>
            {running && (
              <ProgressBar value={progress} label={phase} />
            )}
            {vizRunning && <ProgressBar value={vizProgress} label="Rendering overlay on each frame…" />}
            {vizVideoUrl && !vizRunning && (
              <div className="mt-4">
                <video
                  src={vizVideoUrl}
                  controls
                  className="w-full max-w-[640px] mx-auto rounded-xl ring-1 ring-[var(--border)]"
                />
              </div>
            )}
          </div>
        )}
        {error && <ErrorBanner message={error} />}
      </Card>

      {result && (
        <>
          {/* Results summary */}
          <Card className="animate-slide-up">
            <SectionTitle icon="📊">Results</SectionTitle>
            <div className="flex flex-wrap gap-4 mb-4">
              <StatPill value={`${result.bpm}`} label="Estimated BPM" />
              <StatPill value={`${result.peakFreq.toFixed(2)} Hz`} label="Dominant freq." />
              <StatPill value={`${result.totalFrames}`} label="Frames" />
              <StatPill value={`${result.fps}`} label="FPS" />
            </div>
            <InfoBox>
              <p>
                <span className="text-amber-400/90">💡</span> Remember: the BPM shown is an <strong className="text-[var(--text-primary)]">estimate</strong>. 
                A browser-based rPPG system without controlled lighting will have noise. 
                The important takeaway is whether a <em>clear peak</em> appears in the frequency spectrum below — that&apos;s the signal we exploit for encoding.
              </p>
            </InfoBox>
          </Card>

          {/* Visualization: face ROI overlay */}
          {result.vizFrameUrl && (
            <Card className="animate-slide-up">
              <SectionTitle icon="👁">Face detection & ROI visualization</SectionTitle>
              <InfoBox>
                <p>
                  This snapshot shows the <strong className="text-[var(--text-primary)]">forehead region of interest (ROI)</strong> detected in a mid-video frame.
                  The green rectangle is the detected face bounding box; the highlighted overlay is the forehead area 
                  where the green-channel intensity is sampled every frame.
                </p>
              </InfoBox>
              <div className="mt-4 flex justify-center">
                <img
                  src={result.vizFrameUrl}
                  alt="Face detection with forehead ROI overlay"
                  className="rounded-xl ring-1 ring-[var(--border)] max-w-full sm:max-w-[480px]"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            </Card>
          )}

          {/* Raw signal chart */}
          <Card className="animate-slide-up">
            <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Raw signal (forehead green mean)</h3>
            <InfoBox>
              <p>
                This is the <strong className="text-[var(--text-primary)]">raw green-channel average</strong> of the forehead ROI over time (one value per frame).
                You should see a noisy oscillation — the underlying periodic component is your pulse, 
                but it&apos;s buried in camera noise, auto-exposure changes, and head movement.
                The absolute values don&apos;t matter; we only care about the <em>oscillation pattern</em>.
              </p>
            </InfoBox>
            <div className="mt-3">
              <Line
                data={{
                  labels: result.signalRaw.map((_, i) => String(i)),
                  datasets: [{
                    label: "Raw signal",
                    data: result.signalRaw,
                    borderColor: "#34d399",
                    backgroundColor: "rgba(52,211,153,0.08)",
                    fill: true,
                    borderWidth: 1.5,
                  }],
                }}
                options={chartOpts}
              />
            </div>
          </Card>

          {/* Filtered signal chart */}
          <Card className="animate-slide-up">
            <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Filtered signal (bandpass {Config.BANDPASS_LOW}–{Config.BANDPASS_HIGH} Hz)</h3>
            <InfoBox>
              <p>
                After applying a <strong className="text-[var(--text-primary)]">bandpass filter</strong> ({Config.BANDPASS_LOW}–{Config.BANDPASS_HIGH} Hz ≈ {Config.BANDPASS_LOW * 60}–{Config.BANDPASS_HIGH * 60} BPM), 
                we isolate the frequency band where a human heart rate would appear.
                The result is a cleaner periodic signal. If a clear wave is visible here, the rPPG extraction is working — 
                this is the signal whose frequency we measure.
              </p>
            </InfoBox>
            <div className="mt-3">
              <Line
                data={{
                  labels: result.signalFiltered.map((_, i) => String(i)),
                  datasets: [{
                    label: "Filtered signal",
                    data: result.signalFiltered,
                    borderColor: "#a78bfa",
                    backgroundColor: "rgba(167,139,250,0.08)",
                    fill: true,
                    borderWidth: 1.5,
                  }],
                }}
                options={chartOpts}
              />
            </div>
          </Card>

          {/* Viz overlay video */}
          <Card className="animate-slide-up">
            <SectionTitle icon="🎬">Video overlay visualization</SectionTitle>
            <InfoBox>
              <p>
                Generate a version of your video with the <strong className="text-[var(--text-primary)]">face detection bounding box</strong> and <strong className="text-[var(--text-primary)]">forehead ROI overlay</strong> drawn on every frame.
                This lets you see exactly what the algorithm tracks throughout the video.
              </p>
            </InfoBox>
            <div className="flex flex-wrap gap-3 mt-4">
              <Btn onClick={generateVizVideo} disabled={vizRunning}>
                {vizRunning ? "⏳ Generating…" : "🎨 Generate viz overlay"}
              </Btn>
              {vizRunning && <Btn variant="danger" onClick={cancelViz}>✕ Cancel</Btn>}
            </div>
            {vizRunning && <ProgressBar value={vizProgress} label="Rendering overlay on each frame…" />}
            {vizVideoUrl && (
              <div className="mt-4">
                <video
                  src={vizVideoUrl}
                  controls
                  className="w-full max-w-[640px] mx-auto rounded-xl ring-1 ring-[var(--border)]"
                />
              </div>
            )}
          </Card>

          {/* Frequency spectrum chart */}
          <Card className="animate-slide-up">
            <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Frequency spectrum</h3>
            <InfoBox>
              <p>
                This is the <strong className="text-[var(--text-primary)]">FFT power spectrum</strong> of the filtered signal — 
                it shows the strength of each frequency component.
                The <em>tallest peak</em> corresponds to the dominant frequency, which we convert to BPM (freq × 60).
                For encoding, we inject artificial peaks at specific frequencies ({Config.FREQ_BIT_0} Hz for bit 0, {Config.FREQ_BIT_1} Hz for bit 1) — 
                as long as we can detect peaks in this spectrum, we can read them back.
              </p>
            </InfoBox>
            <div className="mt-3">
              <Line
                data={{
                  labels: result.specFreqs.map((f) => f.toFixed(2)),
                  datasets: [{
                    label: "Spectral power",
                    data: result.specPower,
                    borderColor: "#fb923c",
                    backgroundColor: "rgba(251,146,60,0.08)",
                    fill: true,
                    borderWidth: 1.5,
                  }],
                }}
                options={{
                  ...chartOpts,
                  scales: {
                    ...chartOpts.scales,
                    x: { ...chartOpts.scales.x, title: { display: true, text: "Frequency (Hz)", color: "#6b7280" } },
                  },
                }}
              />
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/**
 * Render a single frame with the face bounding box and forehead ROI overlay
 * drawn on top. Returns a data URL.
 */
function renderRoiOverlay(frame: ImageData, roi: FaceROI): string {
  const scale = 2;
  const w = frame.width * scale;
  const h = frame.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Draw the original frame scaled up
  const tmp = document.createElement("canvas");
  tmp.width = frame.width;
  tmp.height = frame.height;
  tmp.getContext("2d")!.putImageData(frame, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, w, h);

  // Compute face bounding box from forehead ROI
  const [rX, rY, rW, rH] = Config.FOREHEAD_RATIO;
  // forehead: fx = faceX + rX*faceW, fy = faceY + rY*faceH, fw = rW*faceW, fh = rH*faceH
  // So we can invert: faceW = fw / rW, faceX = fx - rX * faceW, etc.
  const faceW = roi.fw / rW;
  const faceH = roi.fh / rH;
  const faceX = roi.fx - rX * faceW;
  const faceY = roi.fy - rY * faceH;

  // Draw face bounding box
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(faceX * scale, faceY * scale, faceW * scale, faceH * scale);
  ctx.setLineDash([]);

  // Draw forehead ROI filled overlay
  ctx.fillStyle = "rgba(52, 211, 153, 0.25)";
  ctx.fillRect(roi.fx * scale, roi.fy * scale, roi.fw * scale, roi.fh * scale);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 2;
  ctx.strokeRect(roi.fx * scale, roi.fy * scale, roi.fw * scale, roi.fh * scale);

  // Labels
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = "#34d399";
  ctx.fillText("Face", faceX * scale + 4, faceY * scale - 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Forehead ROI", roi.fx * scale + 4, roi.fy * scale - 6);

  return canvas.toDataURL("image/png");
}

/**
 * Draw face bounding box + forehead ROI overlay on a frame.
 * Returns a new ImageData with the overlay baked in (same dimensions as input).
 */
function drawFrameOverlay(frame: ImageData, roi: FaceROI | null): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d")!;

  // Draw the original frame
  const tmp = document.createElement("canvas");
  tmp.width = frame.width;
  tmp.height = frame.height;
  tmp.getContext("2d")!.putImageData(frame, 0, 0);
  ctx.drawImage(tmp, 0, 0);

  if (roi) {
    // Compute face bounding box from forehead ROI
    const [rX, rY, rW, rH] = Config.FOREHEAD_RATIO;
    const faceW = roi.fw / rW;
    const faceH = roi.fh / rH;
    const faceX = roi.fx - rX * faceW;
    const faceY = roi.fy - rY * faceH;

    // Face bounding box (dashed)
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(faceX, faceY, faceW, faceH);
    ctx.setLineDash([]);

    // Forehead ROI overlay
    ctx.fillStyle = "rgba(52, 211, 153, 0.2)";
    ctx.fillRect(roi.fx, roi.fy, roi.fw, roi.fh);
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1;
    ctx.strokeRect(roi.fx, roi.fy, roi.fw, roi.fh);

    // Label
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#34d399";
    ctx.fillText("ROI", roi.fx + 2, roi.fy + 10);
  } else {
    // No face detected
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#f87171";
    ctx.fillText("No face", 4, 14);
  }

  return ctx.getImageData(0, 0, frame.width, frame.height);
}
