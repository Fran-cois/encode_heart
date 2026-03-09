"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { AppState, TabId } from "@/app/page";
import { Card, Btn } from "./ui";

interface Props {
  state: AppState;
  setVideo: (f: File) => void;
  switchTab: (t: TabId) => void;
}

export default function RecordTab({ state, setVideo, switchTab }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState("");

  // Start camera
  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e: unknown) {
      setError(`Impossible d'accéder à la caméra : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    }

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `heart_${Date.now()}.webm`, { type: mimeType });
      setVideo(file);
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [setVideo]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // File upload
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) setVideo(f);
    },
    [setVideo]
  );

  // Drag and drop
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("video/")) setVideo(f);
    },
    [setVideo]
  );

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold mb-4">📹 Enregistrer une vidéo</h2>

        {error && (
          <div className="bg-red-900/20 border border-red-500/40 text-red-400 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Camera preview */}
        <div className="relative bg-black rounded-lg overflow-hidden mb-4 aspect-video max-w-[640px]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600">
              <span className="text-5xl">📷</span>
            </div>
          )}
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-400 text-sm font-mono">{fmt(elapsed)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {!cameraOn ? (
            <Btn onClick={startCamera}>📷 Démarrer la caméra</Btn>
          ) : recording ? (
            <Btn variant="danger" onClick={stopRecording}>
              ⬛ Arrêter l&apos;enregistrement
            </Btn>
          ) : (
            <>
              <Btn onClick={startRecording}>🔴 Enregistrer</Btn>
              <Btn variant="secondary" onClick={stopCamera}>
                Fermer la caméra
              </Btn>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-4">📂 Ou importer un fichier vidéo</h2>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-[#2a2d3a] rounded-lg p-10 text-center hover:border-green-400/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <p className="text-gray-400 mb-2">Glissez-déposez un fichier vidéo ici, ou cliquez pour sélectionner</p>
          <p className="text-xs text-gray-600">Format : MP4, WebM, AVI, MOV…</p>
          <input
            id="file-input"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </Card>

      {state.videoFile && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">✅ Vidéo prête</h2>
          <video
            src={state.videoUrl}
            controls
            className="w-full max-w-[640px] rounded-lg mb-4"
          />
          <div className="flex gap-3">
            <Btn onClick={() => switchTab("detect")}>💓 Détecter le BPM</Btn>
            <Btn variant="secondary" onClick={() => switchTab("encode")}>
              🔐 Encoder un secret
            </Btn>
          </div>
        </Card>
      )}
    </>
  );
}
