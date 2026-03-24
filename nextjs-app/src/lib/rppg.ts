/**
 * rPPG signal extraction: extract green channel mean from forehead ROI
 * and CHROM-based multi-channel extraction for robust BPM estimation.
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
 * Extract mean R, G, B values from a ROI.
 * Used by the CHROM method for BPM estimation.
 */
export function extractRGBMeans(
  frame: ImageData,
  roi: FaceROI
): { r: number; g: number; b: number } {
  const { fx, fy, fw, fh } = roi;
  const { data, width } = frame;
  let rSum = 0, gSum = 0, bSum = 0;
  let count = 0;

  for (let y = fy; y < fy + fh; y++) {
    for (let x = fx; x < fx + fw; x++) {
      const i = (y * width + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

/**
 * Compute pulse signal from per-frame RGB means using CHROM
 * (de Haan & Jeanne, 2013).
 *
 * CHROM rejects ambient illumination changes (e.g. wall reflections)
 * by combining chrominance signals and produces a cleaner pulse
 * waveform than the green channel alone.
 */
export function chromSignal(
  rMeans: number[],
  gMeans: number[],
  bMeans: number[]
): number[] {
  const n = rMeans.length;
  if (n < 3) return new Array(n).fill(0);

  // Temporal mean normalisation
  const rMean = rMeans.reduce((a, b) => a + b, 0) / n || 1;
  const gMean = gMeans.reduce((a, b) => a + b, 0) / n || 1;
  const bMean = bMeans.reduce((a, b) => a + b, 0) / n || 1;

  const rn = rMeans.map((v) => v / rMean);
  const gn = gMeans.map((v) => v / gMean);
  const bn = bMeans.map((v) => v / bMean);

  // CHROM chrominance signals
  const xs = rn.map((r, i) => 3.0 * r - 2.0 * gn[i]);
  const ys = rn.map((r, i) => 1.5 * r + gn[i] - 1.5 * bn[i]);

  // Standard deviations
  const xsMean = xs.reduce((a, b) => a + b, 0) / n;
  const ysMean = ys.reduce((a, b) => a + b, 0) / n;
  const xsStd = Math.sqrt(xs.reduce((s, v) => s + (v - xsMean) ** 2, 0) / n);
  const ysStd = Math.sqrt(ys.reduce((s, v) => s + (v - ysMean) ** 2, 0) / n);

  const alpha = xsStd / (ysStd + 1e-10);

  // Combine and detrend (remove linear trend)
  const signal = xs.map((x, i) => x - alpha * ys[i]);

  // Linear detrend
  const indices = signal.map((_, i) => i);
  const iMean = (n - 1) / 2;
  const sMean = signal.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (indices[i] - iMean) * (signal[i] - sMean);
    den += (indices[i] - iMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = sMean - slope * iMean;

  return signal.map((v, i) => v - (slope * i + intercept));
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
