"use client";

import { useState, useRef, useCallback } from "react";
import RecordTab from "@/components/RecordTab";
import DetectTab from "@/components/DetectTab";
import EncodeTab from "@/components/EncodeTab";
import DecodeTab from "@/components/DecodeTab";

export type TabId = "record" | "detect" | "encode" | "decode";

export interface AppState {
  videoFile: File | null;
  videoUrl: string;
  encodedFrames: ImageData[] | null;
  sourceFrames: ImageData[] | null;
  fps: number;
  encodedBlob: Blob | null;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "record", label: "Enregistrer", icon: "📹" },
  { id: "detect", label: "Détecter le BPM", icon: "💓" },
  { id: "encode", label: "Encoder", icon: "🔐" },
  { id: "decode", label: "Décoder", icon: "🔓" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("record");
  const [state, setState] = useState<AppState>({
    videoFile: null,
    videoUrl: "",
    encodedFrames: null,
    sourceFrames: null,
    fps: 30,
    encodedBlob: null,
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
    }));
  }, [state.videoUrl]);

  const switchTab = useCallback((tab: TabId) => setActiveTab(tab), []);

  return (
    <>
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1a1d27] to-[#0f1117] border-b border-[#2a2d3a] px-8 py-5 flex items-center gap-4">
        <span className="text-3xl">💓</span>
        <div>
          <h1 className="text-xl font-semibold">Heart Codec</h1>
          <p className="text-sm text-gray-500">
            Stéganographie cardiaque – cachez un secret dans le rythme cardiaque
            <span className="ml-2 text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded">
              100% navigateur
            </span>
          </p>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex bg-[#1a1d27] border-b border-[#2a2d3a]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`px-6 py-3 text-sm cursor-pointer transition-all border-b-[3px] ${
              activeTab === t.id
                ? "text-green-400 border-green-400"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {/* Video indicator */}
      {state.videoFile && (
        <div className="bg-green-900/10 border-b border-[#2a2d3a] px-6 py-2 text-xs text-green-400 flex justify-between">
          <span>
            <span className="text-gray-500">Vidéo sélectionnée : </span>
            {videoNameRef.current}
          </span>
          <button
            onClick={() =>
              setState((s) => ({ ...s, videoFile: null, videoUrl: "", encodedFrames: null, sourceFrames: null, encodedBlob: null }))
            }
            className="text-red-400 hover:underline cursor-pointer"
          >
            ✕ retirer
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-[1200px] mx-auto p-8">
        {activeTab === "record" && (
          <RecordTab state={state} setVideo={setVideo} switchTab={switchTab} />
        )}
        {activeTab === "detect" && (
          <DetectTab state={state} setVideo={setVideo} />
        )}
        {activeTab === "encode" && (
          <EncodeTab state={state} setState={setState} setVideo={setVideo} switchTab={switchTab} />
        )}
        {activeTab === "decode" && (
          <DecodeTab state={state} setVideo={setVideo} />
        )}
      </main>
    </>
  );
}
