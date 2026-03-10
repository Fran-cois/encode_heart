/**
 * Lightweight face detection using the browser FaceDetector API
 * with a Haar-cascade-like fallback using skin color detection.
 *
 * For browsers without the FaceDetector API, we use a simple skin-color
 * heuristic to locate the face region.
 */

import { Config } from "./config";

export interface FaceROI {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

let smoothedRect: { x: number; y: number; w: number; h: number } | null = null;

/**
 * Try to use the browser's native FaceDetector API.
 * Returns null if not available.
 */
let nativeDetector: FaceDetector | null = null;
let nativeDetectorChecked = false;

// Type declarations for the FaceDetector API (Chromium-only)
declare class FaceDetector {
  constructor(opts?: { fastMode?: boolean; maxDetectedFaces?: number });
  detect(image: ImageBitmapSource): Promise<DetectedFace[]>;
}
interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}

async function getNativeDetector(): Promise<FaceDetector | null> {
  if (nativeDetectorChecked) return nativeDetector;
  nativeDetectorChecked = true;
  try {
    if ("FaceDetector" in window) {
      nativeDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      // Test it
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 10;
      testCanvas.height = 10;
      await nativeDetector.detect(testCanvas);
      return nativeDetector;
    }
  } catch {
    nativeDetector = null;
  }
  return null;
}

/**
 * Detect face in an ImageData and return the forehead ROI.
 * Uses native FaceDetector when available, otherwise falls back to
 * skin-color detection.
 */
export async function detectFace(
  imageData: ImageData | HTMLCanvasElement | HTMLVideoElement,
  width: number,
  height: number
): Promise<FaceROI | null> {
  let faceRect: { x: number; y: number; w: number; h: number } | null = null;

  // Try native API first
  const detector = await getNativeDetector();
  if (detector) {
    try {
      const faces = await detector.detect(imageData as ImageBitmapSource);
      if (faces.length > 0) {
        const bb = faces[0].boundingBox;
        faceRect = {
          x: Math.round(bb.x),
          y: Math.round(bb.y),
          w: Math.round(bb.width),
          h: Math.round(bb.height),
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: simple skin-color based detection
  if (!faceRect) {
    faceRect = detectFaceBySkinColor(imageData, width, height);
  }

  if (!faceRect) {
    return null;
  }

  // Temporal smoothing
  const alpha = Config.FACE_SMOOTH_ALPHA;
  if (smoothedRect) {
    smoothedRect = {
      x: Math.round(smoothedRect.x * (1 - alpha) + faceRect.x * alpha),
      y: Math.round(smoothedRect.y * (1 - alpha) + faceRect.y * alpha),
      w: Math.round(smoothedRect.w * (1 - alpha) + faceRect.w * alpha),
      h: Math.round(smoothedRect.h * (1 - alpha) + faceRect.h * alpha),
    };
  } else {
    smoothedRect = { ...faceRect };
  }

  // Compute forehead ROI
  const [rxs, rys, rxe, rye] = Config.FOREHEAD_RATIO;
  const fx = smoothedRect.x + Math.round(smoothedRect.w * rxs);
  const fy = smoothedRect.y + Math.round(smoothedRect.h * rys);
  const fw = Math.round(smoothedRect.w * (rxe - rxs));
  const fh = Math.round(smoothedRect.h * (rye - rys));

  if (fw <= 0 || fh <= 0 || fx < 0 || fy < 0 || fx + fw > width || fy + fh > height) {
    return null;
  }

  return { fx, fy, fw, fh };
}

export function resetFaceSmoothing() {
  smoothedRect = null;
}

/**
 * Simple skin-color detection fallback.
 * Finds the largest connected region of skin-colored pixels and returns a bounding rect.
 */
function detectFaceBySkinColor(
  source: ImageData | HTMLCanvasElement | HTMLVideoElement,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  let pixels: Uint8ClampedArray;

  if (source instanceof ImageData) {
    pixels = source.data;
  } else {
    const canvas = document.createElement("canvas");
    // Downsample for performance
    const scale = Math.min(1, 320 / width);
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source as CanvasImageSource, 0, 0, sw, sh);
    const id = ctx.getImageData(0, 0, sw, sh);
    pixels = id.data;
    width = sw;
    height = sh;
  }

  // Count skin pixels per row/column to find the face bounding box
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  let skinCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2];
      // YCbCr skin-color detection (works across diverse skin tones)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        skinCount++;
      }
    }
  }

  // Need at least some skin pixels
  if (skinCount < (width * height) * 0.01) return null;

  // Apply inverse scale
  const scale = Math.min(1, 320 / (source instanceof ImageData ? source.width : width));
  const invScale = 1 / (scale || 1);

  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 20 || h < 20) return null;

  return {
    x: Math.round(minX * invScale),
    y: Math.round(minY * invScale),
    w: Math.round(w * invScale),
    h: Math.round(h * invScale),
  };
}
