"use client";

import { useState, useCallback } from "react";
import type { AppState } from "@/app/page";
import { Card, Btn, ProgressBar, BitGrid, StatPill } from "./ui";
import { loadVideo, extractFrames } from "@/lib/video";
import { decode, DecodeResult } from "@/lib/decoder";
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

export default function DecodeTab({ state, setVideo }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DecodeResult | null>(null);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) setVideo(f);
    },
    [setVideo]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("video/")) setVideo(f);
    },
    [setVideo]
  );

  const runDecode = useCallback(async () => {
    if (!state.videoFile) return;
    setRunning(true);
    setError("");
    setResult(null);

    try {
      setPhase("Chargement de la vidéo…");
      setProgress(0);
      const video = await loadVideo(state.videoFile);

      setPhase("Extraction des frames…");
      const { frames, fps } = await extractFrames(video, (p) => setProgress(p * 40));

      setPhase("Décodage du message…");
      const decResult = await decode(frames, fps, undefined, (p) => setProgress(40 + p * 60));

      setResult(decResult);
      setProgress(100);
      setPhase("");
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
      x: {
        ticks: { color: "#6b7280", maxTicksLimit: 10 },
        grid: { color: "#1f2937" },
        title: { display: true, text: "Fréquence (Hz)", color: "#9ca3af" },
      },
      y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
    },
    plugins: { legend: { labels: { color: "#d1d5db" } } },
    elements: { point: { radius: 0 } },
  };

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold mb-4">🔓 Décoder un message secret</h2>

        {/* File upload zone (for encoded video) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-[#2a2d3a] rounded-lg p-8 text-center hover:border-green-400/50 transition-colors cursor-pointer mb-4"
          onClick={() => document.getElementById("decode-file-input")?.click()}
        >
          <p className="text-gray-400 mb-1">Glissez-déposez une vidéo encodée, ou cliquez pour sélectionner</p>
          <p className="text-xs text-gray-600">Envoyez la vidéo encodée générée par l&apos;onglet Encoder</p>
          <input
            id="decode-file-input"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {state.videoFile && (
          <>
            <video src={state.videoUrl} controls className="w-full max-w-[640px] rounded-lg mb-4" />
            <Btn onClick={runDecode} disabled={running}>
              {running ? "⏳ Décodage en cours…" : "🔍 Décoder"}
            </Btn>
            {running && <ProgressBar value={progress} label={phase} />}
          </>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500/40 text-red-400 rounded-lg p-3 mt-4 text-sm">{error}</div>
        )}
      </Card>

      {result && (
        <>
          <Card>
            <h3 className="text-md font-semibold mb-3">🎉 Message décodé</h3>
            <div className="bg-green-900/20 border border-green-500/40 rounded-lg p-6 text-center mb-4">
              <p className="text-2xl font-bold text-green-400 break-all">
                {result.message || <span className="text-gray-500">(vide)</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 mb-4">
              <StatPill value={result.bits.length} label="Bits décodés" />
              <StatPill value={result.segments.length} label="Segments" />
            </div>

            <h4 className="text-sm font-medium text-gray-400 mb-2">Bits décodés</h4>
            <BitGrid bits={result.bits} />
          </Card>

          {/* Spectrum per segment (first few) */}
          <Card>
            <h3 className="text-md font-semibold mb-3">📊 Spectre par segment (premiers)</h3>
            {result.segments.slice(0, 6).map((seg, idx) => (
              <div key={idx} className="mb-4 p-3 bg-[#0f1117] rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      seg.bit === 0
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    bit={seg.bit}
                  </span>
                  <span className="text-xs text-gray-500">
                    Segment {seg.segment} {seg.isHeader ? "(header)" : "(payload)"} — P0={seg.powerF0} P1={seg.powerF1}
                  </span>
                </div>
                {seg.specFreqs.length > 0 && (
                  <Line
                    data={{
                      labels: seg.specFreqs.map((f) => f.toFixed(1)),
                      datasets: [{
                        label: "Spectre",
                        data: seg.specPower,
                        borderColor: seg.bit === 0 ? "#3b82f6" : "#ef4444",
                        backgroundColor: seg.bit === 0 ? "rgba(59,130,246,0.1)" : "rgba(239,68,68,0.1)",
                        fill: true,
                        borderWidth: 1,
                      }],
                    }}
                    options={chartOpts}
                  />
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
