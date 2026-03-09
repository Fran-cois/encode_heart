"use client";

import { useState, useCallback, Dispatch, SetStateAction } from "react";
import type { AppState, TabId } from "@/app/page";
import { Card, Btn, ProgressBar, BitGrid, StatPill } from "./ui";
import { Config } from "@/lib/config";
import { textToBits } from "@/lib/bits";
import { loadVideo, extractFrames, framesToVideoBlob } from "@/lib/video";
import { encode, EncodeResult } from "@/lib/encoder";
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

  // Viz state
  const [vizProgress, setVizProgress] = useState(0);
  const [wizRunning, setWizRunning] = useState(false);
  const [vizUrl, setVizUrl] = useState("");

  // Estimate
  const estimateBits = secret ? textToBits(secret).length : 0;
  const framesPerSeg = Math.round(segDur * (state.fps || 30));
  const framesNeeded = framesPerSeg * estimateBits;

  const runEncode = useCallback(async () => {
    if (!state.videoFile || !secret.trim()) return;
    setRunning(true);
    setError("");
    setEncResult(null);

    try {
      setPhase("Chargement de la vidéo…");
      setProgress(0);
      const video = await loadVideo(state.videoFile);
      
      setPhase("Extraction des frames…");
      const { frames, fps } = await extractFrames(video, (p) => setProgress(p * 30));

      setPhase("Encodage du secret…");
      const result = await encode(frames, fps, secret, amplitude, segDur, (p) => setProgress(30 + p * 40));

      setPhase("Génération du fichier vidéo…");
      const blob = await framesToVideoBlob(result.frames, fps, (p) => setProgress(70 + p * 30));

      setState((s) => ({
        ...s,
        encodedFrames: result.frames,
        sourceFrames: frames,
        fps,
        encodedBlob: blob,
      }));

      setEncResult(result);
      setProgress(100);
      setPhase("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
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
        (p) => setVizProgress(p * 60)
      );

      const blob = await framesToVideoBlob(vizFrames, state.fps, (p) => setVizProgress(60 + p * 40));
      if (vizUrl) URL.revokeObjectURL(vizUrl);
      setVizUrl(URL.createObjectURL(blob));
      setVizProgress(100);
    } catch {
      setError("Erreur lors de la création de la visualisation");
    } finally {
      setWizRunning(false);
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
      x: { ticks: { color: "#6b7280", maxTicksLimit: 8 }, grid: { color: "#1f2937" } },
      y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
    },
    plugins: { legend: { labels: { color: "#d1d5db" } } },
    elements: { point: { radius: 0 } },
  };

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold mb-4">🔐 Encoder un secret</h2>

        {!state.videoFile ? (
          <p className="text-gray-500 text-sm">Veuillez d&apos;abord enregistrer ou importer une vidéo.</p>
        ) : (
          <>
            {/* Secret input */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Message secret</label>
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Entrez votre message secret ici…"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg p-3 text-sm text-gray-200 resize-y min-h-[80px] focus:border-green-400 outline-none"
                maxLength={255}
              />
              <p className="text-xs text-gray-600 mt-1">
                {secret.length}/255 caractères · {estimateBits} bits (8 header + {Math.max(0, estimateBits - 8)} payload) · ~{framesNeeded} frames nécessaires
              </p>
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Amplitude : {amplitude}</label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={amplitude}
                  onChange={(e) => setAmplitude(parseFloat(e.target.value))}
                  className="w-full accent-green-400"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Durée segment : {segDur}s</label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={segDur}
                  onChange={(e) => setSegDur(parseFloat(e.target.value))}
                  className="w-full accent-green-400"
                />
              </div>
            </div>

            <Btn onClick={runEncode} disabled={running || !secret.trim()}>
              {running ? "⏳ Encodage en cours…" : "🚀 Encoder"}
            </Btn>

            {running && <ProgressBar value={progress} label={phase} />}
          </>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500/40 text-red-400 rounded-lg p-3 mt-4 text-sm">{error}</div>
        )}
      </Card>

      {encResult && (
        <>
          <Card>
            <h3 className="text-md font-semibold mb-3">✅ Encodage terminé</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <StatPill value={encResult.bits.length} label="Bits totaux" />
              <StatPill value={`${encResult.fps}`} label="FPS" />
              <StatPill value={encResult.framesPerSegment} label="Frames/segment" />
              <StatPill value={`${encResult.segments[0]?.freqHz ?? ""} / ${Config.FREQ_BIT_1} Hz`} label="Fréquences" />
            </div>

            <h4 className="text-sm font-medium text-gray-400 mb-2">Bits encodés</h4>
            <BitGrid bits={encResult.bits} />

            <div className="flex gap-3 mt-4">
              <Btn onClick={downloadEncoded}>💾 Télécharger la vidéo encodée</Btn>
              <Btn variant="secondary" onClick={goToDecode}>🔓 Décoder</Btn>
            </div>
          </Card>

          {/* Modulation chart for first few segments */}
          <Card>
            <h3 className="text-md font-semibold mb-3">📈 Modulation (premiers segments)</h3>
            {encResult.segments.slice(0, 4).map((seg, idx) => (
              <div key={idx} className="mb-4 p-3 bg-[#0f1117] rounded-lg">
                <p className="text-xs text-gray-500 mb-2">
                  Segment {seg.bitIndex} — bit={seg.bitValue} — {seg.freqHz} Hz{" "}
                  {seg.isHeader ? "(header)" : "(payload)"}
                </p>
                <Line
                  data={{
                    labels: seg.signalAfter.map((_, i) => String(i)),
                    datasets: [
                      {
                        label: "Avant",
                        data: seg.signalBefore,
                        borderColor: "#6b7280",
                        borderWidth: 1,
                      },
                      {
                        label: "Après",
                        data: seg.signalAfter,
                        borderColor: "#22c55e",
                        borderWidth: 1,
                      },
                      {
                        label: "Modulation",
                        data: seg.modulation,
                        borderColor: "#f97316",
                        borderWidth: 1,
                        borderDash: [4, 4],
                      },
                    ],
                  }}
                  options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: true, labels: { color: "#d1d5db", boxWidth: 10, font: { size: 10 } } } } }}
                />
              </div>
            ))}
          </Card>

          {/* Visualization */}
          <Card>
            <h3 className="text-md font-semibold mb-3">👁 Visualisation de l&apos;encodage</h3>
            <Btn onClick={runViz} disabled={wizRunning}>
              {wizRunning ? "⏳ Génération…" : "🎨 Générer la heatmap"}
            </Btn>
            {wizRunning && <ProgressBar value={vizProgress} label="Rendu de la visualisation…" />}
            {vizUrl && (
              <video
                src={vizUrl}
                controls
                className="w-full max-w-[640px] rounded-lg mt-4"
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
