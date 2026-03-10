/**
 * Decoder: extract a secret message from encoded video frames.
 * Uses matched-filter correlation at the two encoding frequencies.
 *
 * 100% client-side.
 */

import { Config } from "./config";
import { bitsToText } from "./bits";
import { detectFace, resetFaceSmoothing } from "./face";
import { extractGreenMean } from "./rppg";
import { bandpassFilter, correlationPower, computeSpectrum } from "./dsp";

const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

export interface DecodeSegmentInfo {
  segment: number;
  isHeader: boolean;
  bit: number;
  powerF0: number;
  powerF1: number;
  confidence: number;
  specFreqs: number[];
  specPower: number[];
}

export interface DecodeResult {
  message: string;
  bits: number[];
  segments: DecodeSegmentInfo[];
  avgConfidence: number;
}

/**
 * Decode a secret from encoded video frames.
 */
export async function decode(
  frames: ImageData[],
  fps: number,
  segmentDuration: number = Config.SEGMENT_DURATION,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<DecodeResult> {
  const framesPerSeg = Math.round(segmentDuration * fps);
  const totalSegments = Math.floor(frames.length / framesPerSeg);

  if (totalSegments < 8) {
    throw new Error(
      `Video too short: need at least 8 segments (${8 * framesPerSeg} frames) but has ${frames.length} frames (${totalSegments} segments)`
    );
  }

  resetFaceSmoothing();

  const allBits: number[] = [];
  const allSegments: DecodeSegmentInfo[] = [];
  let segIdx = 0;

  // Read a segment: extract green signal from ROI
  async function readSegment(segIndex: number): Promise<number[]> {
    const signal: number[] = [];
    const start = segIndex * framesPerSeg;
    for (let sf = 0; sf < framesPerSeg; sf++) {
      const fi = start + sf;
      if (fi >= frames.length) break;
      const frame = frames[fi];
      const roi = await detectFace(frame, frame.width, frame.height);
      if (roi) {
        signal.push(extractGreenMean(frame, roi));
      }
    }
    return signal;
  }

  function decodeBit(signal: number[]): { bit: number; p0: number; p1: number; confidence: number; freqs: number[]; power: number[] } {
    if (signal.length < 4) return { bit: 0, p0: 0, p1: 0, confidence: 0, freqs: [], power: [] };

    // Remove mean
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    let centered = signal.map((v) => v - mean);

    // Bandpass filter in decode range [4–10 Hz]
    centered = bandpassFilter(centered, fps, Config.DECODE_BANDPASS_LOW, Config.DECODE_BANDPASS_HIGH);

    // Matched-filter correlation at exact frequencies
    const p0 = correlationPower(centered, fps, Config.FREQ_BIT_0);
    const p1 = correlationPower(centered, fps, Config.FREQ_BIT_1);
    const bit = p1 > p0 ? 1 : 0;
    const confidence = Math.abs(p1 - p0) / (p1 + p0 + 1e-10);

    // FFT for visualization
    const { freqs, power } = computeSpectrum(centered, fps);

    return { bit, p0, p1, confidence, freqs, power };
  }

  // Phase 1: read 8-bit header
  for (let i = 0; i < 8; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const sig = await readSegment(segIdx);
    const { bit, p0, p1, confidence, freqs, power } = decodeBit(sig);
    allBits.push(bit);

    // Downsample spectrum for viz
    const step = Math.max(1, Math.floor(freqs.length / 200));
    allSegments.push({
      segment: segIdx,
      isHeader: true,
      bit,
      powerF0: Math.round(p0 * 100) / 100,
      powerF1: Math.round(p1 * 100) / 100,
      confidence: Math.round(confidence * 1000) / 1000,
      specFreqs: freqs.filter((_, j) => j % step === 0),
      specPower: power.filter((_, j) => j % step === 0),
    });

    segIdx++;
    if (onProgress) onProgress(segIdx / (totalSegments < 300 ? totalSegments : 300));
    await yieldToUI();
  }

  // Parse header → message length
  let msgLength = 0;
  for (let i = 0; i < 8; i++) msgLength = (msgLength << 1) | allBits[i];

  if (msgLength === 0) {
    return { message: "", bits: allBits, segments: allSegments, avgConfidence: 0 };
  }

  const payloadBits = msgLength * 8;
  const totalBitsNeeded = 8 + payloadBits;

  if (segIdx + payloadBits > totalSegments) {
    throw new Error(
      `Need ${totalBitsNeeded} segments but video has only ${totalSegments}`
    );
  }

  // Phase 2: read payload bits
  for (let i = 0; i < payloadBits; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const sig = await readSegment(segIdx);
    const { bit, p0, p1, confidence, freqs, power } = decodeBit(sig);
    allBits.push(bit);

    const step = Math.max(1, Math.floor(freqs.length / 200));
    allSegments.push({
      segment: segIdx,
      isHeader: false,
      bit,
      powerF0: Math.round(p0 * 100) / 100,
      powerF1: Math.round(p1 * 100) / 100,
      confidence: Math.round(confidence * 1000) / 1000,
      specFreqs: freqs.filter((_, j) => j % step === 0),
      specPower: power.filter((_, j) => j % step === 0),
    });

    segIdx++;
    if (onProgress) onProgress(segIdx / totalBitsNeeded);
    if (i % 4 === 3) await yieldToUI();
  }

  const message = bitsToText(allBits);
  const avgConfidence = allSegments.reduce((s, seg) => s + seg.confidence, 0) / allSegments.length;
  return { message, bits: allBits, segments: allSegments, avgConfidence: Math.round(avgConfidence * 1000) / 1000 };
}
