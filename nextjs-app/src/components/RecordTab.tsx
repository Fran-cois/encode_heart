"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { AppState, TabId } from "@/app/page";
import { Card, Btn, SectionTitle, DropZone, ErrorBanner } from "./ui";

const MIN_RECORDING_SECONDS = 35;

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
      setCameraOn(true);
    } catch (e: unknown) {
      setError(`Unable to access camera: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Bind stream to video element once it's rendered
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

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

  // Validate video duration before accepting
  const validateAndSetVideo = useCallback(
    (file: File) => {
      setError("");
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (el.duration < MIN_RECORDING_SECONDS) {
          setError(
            `Video is too short (${Math.floor(el.duration)}s). Minimum duration is ${MIN_RECORDING_SECONDS}s.`
          );
        } else {
          setVideo(file);
        }
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Unable to read video file.");
      };
      el.src = url;
    },
    [setVideo]
  );

  // File upload
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) validateAndSetVideo(f);
    },
    [validateAndSetVideo]
  );

  // Drag and drop
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("video/")) validateAndSetVideo(f);
    },
    [validateAndSetVideo]
  );

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <Card>
        <SectionTitle icon="📹">Record or import a video</SectionTitle>

        {error && <ErrorBanner message={error} />}

        {cameraOn ? (
          <>
            {/* Camera preview – full width inside the card */}
            <div className="relative bg-black rounded-xl overflow-hidden mb-5 aspect-video mx-auto ring-1 ring-[var(--border)]">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-recording-pulse" />
                  <span className="text-red-400 text-sm font-mono font-semibold">{fmt(elapsed)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {recording ? (
                <Btn
                  variant="danger"
                  onClick={stopRecording}
                  disabled={elapsed < MIN_RECORDING_SECONDS}
                >
                  {elapsed < MIN_RECORDING_SECONDS
                    ? `⏳ Wait ${MIN_RECORDING_SECONDS - elapsed}s…`
                    : "⬛ Stop recording"}
                </Btn>
              ) : (
                <>
                  <Btn onClick={startRecording}>🔴 Record</Btn>
                  <Btn variant="secondary" onClick={stopCamera}>
                    Close camera
                  </Btn>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Option 1 – Start camera */}
            <button
              type="button"
              onClick={startCamera}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] p-8 transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 cursor-pointer"
            >
              <span className="text-4xl">📷</span>
              <span className="text-sm font-medium text-[var(--text)]">Start camera</span>
              <span className="text-xs text-[var(--text-muted)]">Record directly from your webcam</span>
            </button>

            {/* Option 2 – Import a file */}
            <DropZone
              id="file-input"
              onFileChange={onFileChange}
              onDrop={onDrop}
              title="Import a video file"
              subtitle="MP4, WebM, AVI, MOV…"
            />
          </div>
        )}
      </Card>

      {state.videoFile && (
        <Card className="animate-slide-up">
          <SectionTitle icon="✅">Video ready</SectionTitle>
          <video
            src={state.videoUrl}
            controls
            className="w-full max-w-[640px] mx-auto rounded-xl mb-5 ring-1 ring-[var(--border)]"
          />
          <div className="flex gap-3">
            <Btn onClick={() => switchTab("detect")}>💓 Detect BPM</Btn>
            <Btn variant="secondary" onClick={() => switchTab("encode")}>
              🔐 Encode a secret
            </Btn>
          </div>
        </Card>
      )}
    </>
  );
}
