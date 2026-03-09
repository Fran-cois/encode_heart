/**
 * rPPG signal extraction: extract green channel mean from forehead ROI.
 */

import { FaceROI } from "./face";

/**
 * Extract the mean green-channel value from the forehead ROI in an ImageData.
 */
export function extractGreenMean(frame: ImageData, roi: FaceROI): number {
  const { fx, fy, fw, fh } = roi;
  const { data, width } = frame;
  let sum = 0;
  let count = 0;

  for (let y = fy; y < fy + fh; y++) {
    for (let x = fx; x < fx + fw; x++) {
      const i = (y * width + x) * 4;
      sum += data[i + 1]; // green channel
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Estimate heart rate from a signal using FFT peak detection.
 */
export function estimateHeartRate(
  signal: number[],
  fps: number,
  lowHz: number,
  highHz: number
): { bpm: number; peakFreq: number } {
  // Import dynamically to avoid circular deps
  const n = signal.length;
  if (n < 8) return { bpm: 0, peakFreq: 0 };

  // Compute FFT manually (inline to keep this self-contained)
  let fftSize = 1;
  while (fftSize < n) fftSize <<= 1;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const mean = signal.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) re[i] = signal[i] - mean;

  // Bit-reversal + FFT
  for (let i = 1, j = 0; i < fftSize; i++) {
    let bit = fftSize >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= fftSize; len <<= 1) {
    const half = len >> 1;
    const angle = (2 * Math.PI) / len;
    const wRe = Math.cos(angle), wIm = Math.sin(angle);
    for (let i = 0; i < fftSize; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * cRe - im[i + j + half] * cIm;
        const vIm = re[i + j + half] * cIm + im[i + j + half] * cRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const tmp = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = tmp;
      }
    }
  }

  // Find peak in heart rate band
  let peakPower = 0;
  let peakIdx = 0;
  const half = fftSize >> 1;
  for (let i = 1; i <= half; i++) {
    const freq = (i * fps) / fftSize;
    if (freq < lowHz || freq > highHz) continue;
    const power = re[i] * re[i] + im[i] * im[i];
    if (power > peakPower) {
      peakPower = power;
      peakIdx = i;
    }
  }

  const peakFreq = (peakIdx * fps) / fftSize;
  return { bpm: Math.round(peakFreq * 60), peakFreq };
}
