"""Encode a secret message into a video by modulating the apparent heart rate."""

import math

import cv2
import numpy as np

from heart_codec.config import Config
from heart_codec.face import FaceDetector


# ---------------------------------------------------------------------------
# Binary conversion helpers
# ---------------------------------------------------------------------------

def text_to_bits(text: str) -> list[int]:
    """Convert a text string to a list of bits with an 8-bit length prefix."""
    data = text.encode("utf-8")
    length = len(data)
    if length > 255:
        raise ValueError("Secret must be ≤ 255 bytes (UTF-8 encoded)")

    bits: list[int] = []
    # 8-bit length prefix
    for i in range(7, -1, -1):
        bits.append((length >> i) & 1)
    # payload
    for byte in data:
        for i in range(7, -1, -1):
            bits.append((byte >> i) & 1)
    return bits


# ---------------------------------------------------------------------------
# Encoder
# ---------------------------------------------------------------------------

def encode(input_video: str, output_video: str, secret: str,
           segment_duration: float = Config.SEGMENT_DURATION,
           amplitude: float = Config.MODULATION_AMPLITUDE,
           freq0: float = Config.FREQ_BIT_0,
           freq1: float = Config.FREQ_BIT_1) -> dict:
    """Encode *secret* into *input_video* and write the result to *output_video*.

    Each bit of the secret (including 8-bit length header) occupies one
    *segment_duration*-second segment.  The forehead skin region is modulated
    with a sine wave at *freq0* (bit 0) or *freq1* (bit 1).

    Returns a summary dict with keys: bits, total_segments, video_duration_needed.
    """
    bits = text_to_bits(secret)
    n_bits = len(bits)

    # Open input video
    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {input_video}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frames_per_segment = int(round(segment_duration * fps))
    frames_needed = frames_per_segment * n_bits

    if total_frames < frames_needed:
        cap.release()
        raise ValueError(
            f"Video too short: need {frames_needed} frames "
            f"({n_bits} bits × {frames_per_segment} frames/bit) "
            f"but video has only {total_frames} frames. "
            f"Use a longer video or a shorter secret."
        )

    # Set up writer
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError(f"Cannot create output video: {output_video}")

    detector = FaceDetector()
    frame_idx = 0

    print(f"Encoding {n_bits} bits ({len(secret)} chars) into video …")

    for bit_idx, bit in enumerate(bits):
        target_freq = freq1 if bit else freq0
        for seg_frame in range(frames_per_segment):
            ret, frame = cap.read()
            if not ret:
                break

            roi = detector.detect(frame)
            if roi is not None:
                fx, fy, fw, fh = roi
                t = seg_frame / fps
                modulation = amplitude * math.sin(2.0 * math.pi * target_freq * t)

                # Apply modulation to the green channel in the ROI
                patch = frame[fy : fy + fh, fx : fx + fw].astype(np.float32)
                patch[:, :, 1] += modulation
                frame[fy : fy + fh, fx : fx + fw] = np.clip(patch, 0, 255).astype(np.uint8)

            writer.write(frame)
            frame_idx += 1

        progress = (bit_idx + 1) / n_bits * 100
        if (bit_idx + 1) % max(1, n_bits // 20) == 0 or bit_idx == n_bits - 1:
            print(f"  [{progress:5.1f}%] encoded bit {bit_idx + 1}/{n_bits}")

    # Write any remaining frames unmodified
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        writer.write(frame)
        frame_idx += 1

    cap.release()
    writer.release()

    print(f"Done – wrote {frame_idx} frames to {output_video}")

    return {
        "bits": n_bits,
        "total_segments": n_bits,
        "frames_per_segment": frames_per_segment,
        "video_duration_needed": frames_needed / fps,
        "output": output_video,
    }
