"use client";

import { useState, useCallback, useRef } from "react";
import type { AppState } from "@/app/page";
import { Card, Btn, ProgressBar, StatPill } from "./ui";
import { loadVideo, extractFrames } from "@/lib/video";
import { detectFace, resetFaceSmoothing } from "@/lib/face";
import { extractGreenMean } from "@/lib/rppg";
import { bandpassFilter, computeSpectrum } from "@/lib/dsp";
import { estimateHeartRate } from "@/lib/rppg";
import { Config } from "@/lib/config";
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
  setVideo: (f: File) => void;
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
}

export default function DetectTab({ state }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef(false);

  const run = useCallback(async () => {
    if (!state.videoFile) return;
    setRunning(true);
    setError("");
    setResult(null);
    abortRef.current = false;

    try {
      setPhase("Chargement de la vidéo…");
      setProgress(0);
      const video = await loadVideo(state.videoFile);

      setPhase("Extraction des frames…");
      const { frames, fps } = await extractFrames(video, (p) => setProgress(p * 50));

      if (abortRef.current) return;

      setPhase("Détection du visage et extraction du signal rPPG…");
      resetFaceSmoothing();
      const greenSignal: number[] = [];

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const roi = await detectFace(frame, frame.width, frame.height);
        if (roi) {
          greenSignal.push(extractGreenMean(frame, roi));
        } else {
          greenSignal.push(greenSignal.length > 0 ? greenSignal[greenSignal.length - 1] : 0);
        }
        if (i % 10 === 0) setProgress(50 + (i / frames.length) * 40);
      }

      if (abortRef.current) return;

      setPhase("Analyse fréquentielle…");
      setProgress(90);

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

      setResult({ bpm, peakFreq, signalRaw: rawDown, signalFiltered: filtDown, specFreqs: specF, specPower: specP, fps, totalFrames: frames.length });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [state.videoFile]);

  const chartOpts = {
    responsive: true,
    animation: false as const,
    scales: {
      x: { ticks: { color: "#6b7280", maxTicksLimit: 10 }, grid: { color: "#1f2937" } },
      y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
    },
    plugins: { legend: { labels: { color: "#d1d5db" } } },
    elements: { point: { radius: 0 } },
  };

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold mb-4">💓 Détection du rythme cardiaque (rPPG)</h2>
        {!state.videoFile ? (
          <p className="text-gray-500 text-sm">Veuillez d&apos;abord enregistrer ou importer une vidéo.</p>
        ) : (
          <>
            <Btn onClick={run} disabled={running}>
              {running ? "⏳ Analyse en cours…" : "🔬 Lancer l'analyse"}
            </Btn>
            {running && (
              <ProgressBar value={progress} label={phase} />
            )}
          </>
        )}
        {error && (
          <div className="bg-red-900/20 border border-red-500/40 text-red-400 rounded-lg p-3 mt-4 text-sm">{error}</div>
        )}
      </Card>

      {result && (
        <>
          <Card>
            <h3 className="text-md font-semibold mb-3">📊 Résultats</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <StatPill value={`${result.bpm}`} label="BPM estimé" />
              <StatPill value={`${result.peakFreq.toFixed(2)} Hz`} label="Fréq. dominante" />
              <StatPill value={`${result.totalFrames}`} label="Frames" />
              <StatPill value={`${result.fps}`} label="FPS" />
            </div>
          </Card>

          <Card>
            <h3 className="text-md font-semibold mb-3">Signal brut (vert moyen du front)</h3>
            <Line
              data={{
                labels: result.signalRaw.map((_, i) => String(i)),
                datasets: [{
                  label: "Signal brut",
                  data: result.signalRaw,
                  borderColor: "#22c55e",
                  backgroundColor: "rgba(34,197,94,0.1)",
                  fill: true,
                  borderWidth: 1,
                }],
              }}
              options={chartOpts}
            />
          </Card>

          <Card>
            <h3 className="text-md font-semibold mb-3">Signal filtré (bandpass {Config.BANDPASS_LOW}–{Config.BANDPASS_HIGH} Hz)</h3>
            <Line
              data={{
                labels: result.signalFiltered.map((_, i) => String(i)),
                datasets: [{
                  label: "Signal filtré",
                  data: result.signalFiltered,
                  borderColor: "#a78bfa",
                  backgroundColor: "rgba(167,139,250,0.1)",
                  fill: true,
                  borderWidth: 1,
                }],
              }}
              options={chartOpts}
            />
          </Card>

          <Card>
            <h3 className="text-md font-semibold mb-3">Spectre fréquentiel</h3>
            <Line
              data={{
                labels: result.specFreqs.map((f) => f.toFixed(2)),
                datasets: [{
                  label: "Puissance spectrale",
                  data: result.specPower,
                  borderColor: "#f97316",
                  backgroundColor: "rgba(249,115,22,0.1)",
                  fill: true,
                  borderWidth: 1,
                }],
              }}
              options={{
                ...chartOpts,
                scales: {
                  ...chartOpts.scales,
                  x: { ...chartOpts.scales.x, title: { display: true, text: "Fréquence (Hz)", color: "#9ca3af" } },
                },
              }}
            />
          </Card>
        </>
      )}
    </>
  );
}
