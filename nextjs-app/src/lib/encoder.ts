/**
 * Encoder: inject a secret message into video frames by modulating the
 * green channel of the forehead ROI with sine waves.
 *
 * 100% client-side — operates on ImageData arrays.
 */

import { Config } from "./config";
import { textToBits } from "./bits";
import { detectFace, resetFaceSmoothing, FaceROI } from "./face";
import { extractGreenMean } from "./rppg";

export interface EncodeSegmentInfo {
  bitIndex: number;
  bitValue: number;
  freqHz: number;
  isHeader: boolean;
  signalBefore: number[];
  signalAfter: number[];
  modulation: number[];
}

export interface EncodeResult {
  frames: ImageData[];
  bits: number[];
  segments: EncodeSegmentInfo[];
  fps: number;
  framesPerSegment: number;
}

/**
 * Encode a secret into video frames.
 * Returns the modified frames + visualization data.
 */
const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

export async function encode(
  frames: ImageData[],
  fps: number,
  secret: string,
  amplitude: number = Config.MODULATION_AMPLITUDE,
  segmentDuration: number = Config.SEGMENT_DURATION,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<EncodeResult> {
  const bits = textToBits(secret);
  const framesPerSeg = Math.round(segmentDuration * fps);
  const framesNeeded = framesPerSeg * bits.length;

  if (frames.length < framesNeeded) {
    throw new Error(
      `Video too short: need ${framesNeeded} frames (${bits.length} bits × ${framesPerSeg} f/bit) but has ${frames.length}`
    );
  }

  resetFaceSmoothing();

  // Clone frames (we modify in-place)
  const outFrames = frames.map((f) => {
    const copy = new ImageData(f.width, f.height);
    copy.data.set(f.data);
    return copy;
  });

  const segments: EncodeSegmentInfo[] = [];

  for (let bitIdx = 0; bitIdx < bits.length; bitIdx++) {
    const bit = bits[bitIdx];
    const targetFreq = bit ? Config.FREQ_BIT_1 : Config.FREQ_BIT_0;
    const segStart = bitIdx * framesPerSeg;

    const sigBefore: number[] = [];
    const sigAfter: number[] = [];
    const mods: number[] = [];

    for (let sf = 0; sf < framesPerSeg; sf++) {
      const fi = segStart + sf;
      if (fi >= outFrames.length) break;

      const frame = outFrames[fi];
      const roi = await detectFace(frame, frame.width, frame.height);

      if (roi) {
        const greenBefore = extractGreenMean(frame, roi);
        sigBefore.push(greenBefore);

        const t = sf / fps;
        const mod = amplitude * Math.sin(2 * Math.PI * targetFreq * t);
        mods.push(Math.round(mod * 1000) / 1000);

        // Apply modulation to green channel
        applyModulation(frame, roi, mod);

        const greenAfter = extractGreenMean(frame, roi);
        sigAfter.push(greenAfter);
      } else {
        sigBefore.push(0);
        sigAfter.push(0);
        mods.push(0);
      }
    }

    segments.push({
      bitIndex: bitIdx,
      bitValue: bit,
      freqHz: targetFreq,
      isHeader: bitIdx < 8,
      signalBefore: sigBefore,
      signalAfter: sigAfter,
      modulation: mods,
    });

    if (onProgress) onProgress((bitIdx + 1) / bits.length);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (bitIdx % 4 === 3) await yieldToUI();
  }

  return { frames: outFrames, bits, segments, fps, framesPerSegment: framesPerSeg };
}

function applyModulation(frame: ImageData, roi: FaceROI, mod: number) {
  const { fx, fy, fw, fh } = roi;
  const data = frame.data;
  const w = frame.width;

  for (let y = fy; y < fy + fh; y++) {
    for (let x = fx; x < fx + fw; x++) {
      const i = (y * w + x) * 4;
      const g = data[i + 1] + mod;
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    }
  }
}
