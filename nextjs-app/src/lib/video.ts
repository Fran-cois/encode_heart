/**
 * Video frame extraction utility.
 * Reads a video file frame-by-frame using an OffscreenCanvas / HTMLVideoElement.
 */

export interface VideoMeta {
  width: number;
  height: number;
  fps: number;
  duration: number;
  totalFrames: number;
}

/**
 * Extract metadata from a video blob.
 */
export function getVideoMeta(video: HTMLVideoElement): VideoMeta {
  // Try to estimate FPS from video metadata; default to 30 if not available
  const duration = video.duration || 0;
  const width = video.videoWidth;
  const height = video.videoHeight;
  // We'll estimate fps during frame extraction
  return {
    width,
    height,
    fps: 30, // will be refined
    duration,
    totalFrames: Math.round(duration * 30),
  };
}

/**
 * Extract all frames from a video as ImageData, optionally scaled down.
 *
 * @param video - loaded HTMLVideoElement (must have loadeddata fired)
 * @param onProgress - optional progress callback (0-1)
 * @param maxWidth - optional max width; frames are scaled proportionally if the video is wider
 * @returns array of ImageData for each frame + actual fps
 */
export async function extractFrames(
  video: HTMLVideoElement,
  onProgress?: (p: number) => void,
  maxWidth: number = 320,
  signal?: AbortSignal
): Promise<{ frames: ImageData[]; fps: number }> {
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (maxWidth && w > maxWidth) {
    const scale = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const duration = await getFiniteDuration(video);
  const fps = 30;
  const dt = 1 / fps;
  const frames: ImageData[] = [];

  video.currentTime = 0;
  await waitForSeek(video);

  for (let t = 0; t < duration; t += dt) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    video.currentTime = t;
    await waitForSeek(video);
    // Stop if the video can't seek further (unknown duration fallback)
    if (video.ended || (t > 0 && Math.abs(video.currentTime - t) > dt * 2)) break;

    ctx.drawImage(video, 0, 0, w, h);
    frames.push(ctx.getImageData(0, 0, w, h));

    if (onProgress) onProgress(t / duration);
  }

  if (onProgress) onProgress(1);
  return { frames, fps };
}

/**
 * Process video frames one-by-one in a streaming fashion (no bulk storage).
 * Calls `onFrame` for each frame with the ImageData and frame index.
 * The ImageData is reused between calls, so the callback must extract
 * whatever it needs before returning.
 */
export async function forEachFrame(
  video: HTMLVideoElement,
  onFrame: (frame: ImageData, index: number) => void | Promise<void>,
  onProgress?: (p: number) => void,
  maxWidth: number = 320,
  signal?: AbortSignal
): Promise<{ count: number; fps: number; width: number; height: number }> {
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (maxWidth && w > maxWidth) {
    const scale = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const duration = await getFiniteDuration(video);
  const fps = 30;
  const dt = 1 / fps;
  let index = 0;

  video.currentTime = 0;
  await waitForSeek(video);

  for (let t = 0; t < duration; t += dt) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    video.currentTime = t;
    await waitForSeek(video);
    // Stop if the video can't seek further (unknown duration fallback)
    if (video.ended || (t > 0 && Math.abs(video.currentTime - t) > dt * 2)) break;

    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    await onFrame(frame, index);
    index++;

    if (onProgress) onProgress(t / duration);
  }

  if (onProgress) onProgress(1);
  return { count: index, fps, width: w, height: h };
}

function waitForSeek(video: HTMLVideoElement, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (!video.seeking) {
      resolve();
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    video.addEventListener("seeked", settle, { once: true });
    video.addEventListener("ended", settle, { once: true });
    setTimeout(settle, timeoutMs);
  });
}

/**
 * Resolve the finite duration of a video.
 * MediaRecorder-produced WebM files often have duration = Infinity.
 * This seeks to the end to force the browser to resolve the real duration.
 */
async function getFiniteDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }
  // Seek to a very large time to force the browser to calculate the real duration
  video.currentTime = 1e10;
  await waitForSeek(video, 5000);
  const dur = video.duration;
  video.currentTime = 0;
  await waitForSeek(video);
  if (Number.isFinite(dur) && dur > 0) return dur;

  // If duration is still unknown, extract frames until the video ends
  // Use a generous fallback — callers will stop when seek stops advancing
  console.warn("Could not determine video duration; falling back to 120s cap.");
  return 120;
}

/**
 * Load a File/Blob into an HTMLVideoElement, wait until metadata is ready.
 * Note: we do NOT revoke the blob URL here because the video element needs
 * the source to remain accessible for seeking & canvas drawing (revoking
 * early taints the canvas in some browsers).
 */
export function loadVideo(file: File | Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(file);
    video.src = url;
    video.addEventListener("loadeddata", () => {
      resolve(video);
    }, { once: true });
    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot load video"));
    }, { once: true });
  });
}

/**
 * Build a video blob from a series of frames using MediaRecorder + canvas.
 * This renders frames onto a canvas and captures via MediaRecorder.
 */
export async function framesToVideoBlob(
  frames: ImageData[],
  fps: number,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = frames[0].width;
  canvas.height = frames[0].height;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(0); // 0 = manual frame push
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };

  // Try VP9 first, fall back to VP8, then any
  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  recorder.start();

  const frameDuration = 1000 / fps;
  for (let i = 0; i < frames.length; i++) {
    ctx.putImageData(frames[i], 0, 0);
    // Request a frame capture
    if (track.requestFrame) {
      track.requestFrame();
    }
    // Wait for frame duration
    await new Promise((r) => setTimeout(r, frameDuration));
    if (onProgress) onProgress(i / frames.length);
  }

  recorder.stop();
  if (onProgress) onProgress(1);
  return done;
}
