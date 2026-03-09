/**
 * DSP utilities: bandpass filter and power-spectrum computation.
 * All processing runs in the browser — no server required.
 */

/**
 * 2nd-order Butterworth bandpass filter (biquad cascade).
 * Returns the filtered signal (same length).
 */
export function bandpassFilter(
  signal: number[],
  fps: number,
  low: number,
  high: number
): number[] {
  const n = signal.length;
  if (n < 6) return signal;

  // Normalized frequencies
  const nyq = fps / 2;
  const wl = low / nyq;
  const wh = high / nyq;

  if (wl >= 1 || wh >= 1 || wl <= 0 || wh <= 0 || wl >= wh) return signal;

  // Compute biquad coefficients for a 2nd order bandpass
  const w0 = Math.PI * (wl + wh);
  const bw = Math.PI * (wh - wl);
  const alpha = Math.sin(bw) / 2;
  const cosw0 = Math.cos(w0);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  // Normalize
  const nb0 = b0 / a0,
    nb1 = b1 / a0,
    nb2 = b2 / a0;
  const na1 = a1 / a0,
    na2 = a2 / a0;

  // Forward pass
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = signal[i];
    const x1 = i >= 1 ? signal[i - 1] : 0;
    const x2 = i >= 2 ? signal[i - 2] : 0;
    const y1 = i >= 1 ? y[i - 1] : 0;
    const y2 = i >= 2 ? y[i - 2] : 0;
    y[i] = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
  }

  // Backward pass (zero-phase filtering like scipy filtfilt)
  const yy = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = y[i];
    const x1 = i < n - 1 ? y[i + 1] : 0;
    const x2 = i < n - 2 ? y[i + 2] : 0;
    const y1 = i < n - 1 ? yy[i + 1] : 0;
    const y2 = i < n - 2 ? yy[i + 2] : 0;
    yy[i] = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
  }

  return Array.from(yy);
}

/**
 * Compute PSD via FFT (real input, Cooley-Tukey).
 * Returns { freqs: number[], power: number[] }.
 */
export function computeSpectrum(
  signal: number[],
  fps: number
): { freqs: number[]; power: number[] } {
  // Zero-pad to next power of 2
  let n = 1;
  while (n < signal.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i];

  fft(re, im, false);

  const half = n >> 1;
  const freqs: number[] = [];
  const power: number[] = [];
  for (let i = 0; i <= half; i++) {
    freqs.push((i * fps) / n);
    power.push(re[i] * re[i] + im[i] * im[i]);
  }
  return { freqs, power };
}

/**
 * Matched-filter correlation: compute power at a specific frequency.
 * Returns the squared magnitude of the DTFT at that frequency.
 */
export function correlationPower(signal: number[], fps: number, freq: number): number {
  let sumSin = 0,
    sumCos = 0;
  for (let i = 0; i < signal.length; i++) {
    const t = i / fps;
    const angle = 2 * Math.PI * freq * t;
    sumSin += signal[i] * Math.sin(angle);
    sumCos += signal[i] * Math.cos(angle);
  }
  return sumSin * sumSin + sumCos * sumCos;
}

/**
 * In-place radix-2 FFT.
 */
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Cooley-Tukey
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = ((inverse ? -1 : 1) * 2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1,
        curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const uRe = re[i + j],
          uIm = im[i + j];
        const vRe = re[i + j + halfLen] * curRe - im[i + j + halfLen] * curIm;
        const vIm = re[i + j + halfLen] * curIm + im[i + j + halfLen] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + halfLen] = uRe - vRe;
        im[i + j + halfLen] = uIm - vIm;
        const tmpRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmpRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}
