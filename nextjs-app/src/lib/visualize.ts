/**
 * Generate a visualization video: amplified heatmap of the encoding modulation.
 * Returns an array of ImageData frames with the heatmap overlay + HUD.
 */

import { Config } from "./config";
import { textToBits } from "./bits";
import { detectFace, resetFaceSmoothing } from "./face";

const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * Render a heatmap visualization of the difference between source and encoded frames.
 */
export async function renderVisualization(
  sourceFrames: ImageData[],
  encodedFrames: ImageData[],
  fps: number,
  secret: string,
  amplitude: number = Config.MODULATION_AMPLITUDE,
  segmentDuration: number = Config.SEGMENT_DURATION,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<ImageData[]> {
  const bits = secret ? textToBits(secret) : [];
  const framesPerSeg = Math.round(segmentDuration * fps);
  const count = Math.min(sourceFrames.length, encodedFrames.length);
  const ampFactor = 128 / Math.max(amplitude, 1);

  resetFaceSmoothing();

  const width = encodedFrames[0].width;
  const height = encodedFrames[0].height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const outFrames: ImageData[] = [];

  for (let fi = 0; fi < count; fi++) {
    const srcFrame = sourceFrames[fi];
    const encFrame = encodedFrames[fi];

    // Start with encoded frame
    const out = new ImageData(width, height);
    out.data.set(encFrame.data);

    const roi = await detectFace(encFrame, width, height);

    if (roi) {
      const { fx, fy, fw, fh } = roi;

      // Compute green-channel difference and apply JET colormap
      for (let y = fy; y < fy + fh && y < height; y++) {
        for (let x = fx; x < fx + fw && x < width; x++) {
          const i = (y * width + x) * 4;
          const srcG = srcFrame.data[i + 1];
          const encG = encFrame.data[i + 1];
          const diff = encG - srcG;
          const norm = Math.max(0, Math.min(255, Math.round(diff * ampFactor + 128)));

          // JET colormap approximation
          const [jr, jg, jb] = jetColor(norm);

          // Blend 55% heatmap + 45% original
          const alpha = 0.55;
          out.data[i] = Math.round(encFrame.data[i] * (1 - alpha) + jr * alpha);
          out.data[i + 1] = Math.round(encFrame.data[i + 1] * (1 - alpha) + jg * alpha);
          out.data[i + 2] = Math.round(encFrame.data[i + 2] * (1 - alpha) + jb * alpha);
        }
      }

      // Dim area outside ROI
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x >= fx && x < fx + fw && y >= fy && y < fy + fh) continue;
          const i = (y * width + x) * 4;
          out.data[i] = Math.round(out.data[i] * 0.55);
          out.data[i + 1] = Math.round(out.data[i + 1] * 0.55);
          out.data[i + 2] = Math.round(out.data[i + 2] * 0.55);
        }
      }

      // Draw ROI border (green)
      drawRect(out, fx, fy, fw, fh, 0, 230, 118);
    }

    // HUD overlay via canvas
    ctx.putImageData(out, 0, 0);

    if (bits.length > 0 && framesPerSeg > 0) {
      const segIdx = Math.floor(fi / framesPerSeg);
      const segFrame = fi % framesPerSeg;

      if (segIdx < bits.length) {
        const bitVal = bits[segIdx];
        const freq = bitVal ? Config.FREQ_BIT_1 : Config.FREQ_BIT_0;
        const isHeader = segIdx < 8;
        const label = isHeader ? "HEADER" : "PAYLOAD";
        const t = segFrame / fps;
        const modVal = amplitude * Math.sin(2 * Math.PI * freq * t);

        // Background bar
        const barY = height - 50;
        ctx.fillStyle = "rgba(20, 20, 30, 0.85)";
        ctx.fillRect(10, barY - 5, width - 20, 45);

        // Text
        ctx.font = "14px monospace";
        ctx.fillStyle = "#ccc";
        ctx.fillText(`Bit ${segIdx}: ${bitVal}  |  ${freq.toFixed(0)} Hz  |  ${label}`, 18, barY + 18);

        // Modulation gauge
        const gaugeX = width - 180;
        const gaugeW = 150;
        const gaugeMid = gaugeX + gaugeW / 2;

        ctx.fillStyle = "rgba(40, 40, 50, 0.9)";
        ctx.fillRect(gaugeX, barY + 2, gaugeW, 20);

        ctx.strokeStyle = "#666";
        ctx.beginPath();
        ctx.moveTo(gaugeMid, barY + 2);
        ctx.lineTo(gaugeMid, barY + 22);
        ctx.stroke();

        const fillPx = (modVal / amplitude) * (gaugeW / 2);
        if (fillPx > 0) {
          ctx.fillStyle = "#00b4ff";
          ctx.fillRect(gaugeMid, barY + 4, fillPx, 16);
        } else if (fillPx < 0) {
          ctx.fillStyle = "#ff6633";
          ctx.fillRect(gaugeMid + fillPx, barY + 4, -fillPx, 16);
        }
      }
    }

    outFrames.push(ctx.getImageData(0, 0, width, height));
    if (onProgress) onProgress((fi + 1) / count);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (fi % 10 === 9) await yieldToUI();
  }

  return outFrames;
}

/**
 * JET colormap approximation (0–255 → RGB).
 */
function jetColor(v: number): [number, number, number] {
  const n = v / 255;
  let r = 0, g = 0, b = 0;

  if (n < 0.125) {
    b = 0.5 + n * 4;
  } else if (n < 0.375) {
    b = 1;
    g = (n - 0.125) * 4;
  } else if (n < 0.625) {
    g = 1;
    b = 1 - (n - 0.375) * 4;
    r = (n - 0.375) * 4;
  } else if (n < 0.875) {
    r = 1;
    g = 1 - (n - 0.625) * 4;
  } else {
    r = 1 - (n - 0.875) * 2;
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Draw a rectangle border on ImageData.
 */
function drawRect(
  img: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number
) {
  const { data, width: imgW, height: imgH } = img;
  const thickness = 2;

  for (let t = 0; t < thickness; t++) {
    // Top & bottom
    for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < imgW) {
        const yt = y + t;
        const yb = y + h - 1 - t;
        if (yt >= 0 && yt < imgH) {
          const i = (yt * imgW + px) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
        if (yb >= 0 && yb < imgH) {
          const i = (yb * imgW + px) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
      }
    }
    // Left & right
    for (let py = y; py < y + h; py++) {
      if (py >= 0 && py < imgH) {
        const xl = x + t;
        const xr = x + w - 1 - t;
        if (xl >= 0 && xl < imgW) {
          const i = (py * imgW + xl) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
        if (xr >= 0 && xr < imgW) {
          const i = (py * imgW + xr) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
      }
    }
  }
}
