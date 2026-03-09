"""Decode a secret message from an encoded video."""

import cv2
import numpy as np

from heart_codec.config import Config
from heart_codec.face import FaceDetector
from heart_codec.rppg import bandpass_filter


# ---------------------------------------------------------------------------
# Binary conversion helpers
# ---------------------------------------------------------------------------

def bits_to_text(bits: list[int]) -> str:
    """Convert a bit list (with 8-bit length prefix) back to a string."""
    if len(bits) < 8:
        raise ValueError("Not enough bits to read length prefix")

    length = 0
    for i in range(8):
        length = (length << 1) | bits[i]

    needed = 8 + length * 8
    if len(bits) < needed:
        raise ValueError(
            f"Expected {needed} bits for a {length}-byte message, got {len(bits)}"
        )

    data = bytearray()
    for c in range(length):
        val = 0
        start = 8 + c * 8
        for i in range(8):
            val = (val << 1) | bits[start + i]
        data.append(val)

    return data.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Single-segment decoder
# ---------------------------------------------------------------------------

def _decode_bit(signal: np.ndarray, fps: float,
                freq0: float, freq1: float) -> int:
    """Determine whether a segment's green-channel signal encodes bit 0 or 1.

    Uses matched-filter correlation (DTFT at exact target frequencies) instead
    of binned FFT, which avoids spectral-leakage errors when the two
    frequencies are close relative to the segment length.
    """
    if len(signal) < 4:
        return 0  # fallback

    # Bandpass isolates encoding frequencies, rejects heart-rate band
    sig = bandpass_filter(signal - np.mean(signal), fps,
                          low=Config.DECODE_BANDPASS_LOW,
                          high=Config.DECODE_BANDPASS_HIGH)
    t = np.arange(len(sig)) / fps

    # Power at each target frequency via correlation (|X(f)|²)
    p0 = float(np.dot(sig, np.sin(2 * np.pi * freq0 * t)) ** 2 +
               np.dot(sig, np.cos(2 * np.pi * freq0 * t)) ** 2)
    p1 = float(np.dot(sig, np.sin(2 * np.pi * freq1 * t)) ** 2 +
               np.dot(sig, np.cos(2 * np.pi * freq1 * t)) ** 2)

    return 1 if p1 > p0 else 0


# ---------------------------------------------------------------------------
# Full decoder
# ---------------------------------------------------------------------------

def decode(video_path: str,
           segment_duration: float = Config.SEGMENT_DURATION,
           freq0: float = Config.FREQ_BIT_0,
           freq1: float = Config.FREQ_BIT_1) -> str:
    """Decode a secret message from *video_path*.

    The decoder first reads the 8-bit length prefix, then decodes the
    corresponding number of character bytes.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_per_segment = int(round(segment_duration * fps))

    # We need at least 8 segments for the length prefix
    max_segments = total_frames // frames_per_segment
    if max_segments < 8:
        cap.release()
        raise ValueError("Video too short to contain an encoded message (need ≥ 8 segments)")

    detector = FaceDetector()

    def read_segment() -> np.ndarray:
        """Read one segment and return the green-channel time series."""
        values = []
        last_val = None
        for _ in range(frames_per_segment):
            ret, frame = cap.read()
            if not ret:
                break
            roi = detector.detect(frame)
            if roi is not None:
                fx, fy, fw, fh = roi
                patch = frame[fy : fy + fh, fx : fx + fw]
                green_mean = float(np.mean(patch[:, :, 1]))
                last_val = green_mean
            if last_val is not None:
                values.append(last_val)
            else:
                values.append(0.0)
        return np.array(values, dtype=np.float64)

    print("Decoding length prefix (8 bits) …")
    # Decode length prefix
    length_bits: list[int] = []
    for i in range(8):
        sig = read_segment()
        bit = _decode_bit(sig, fps, freq0, freq1)
        length_bits.append(bit)

    msg_length = 0
    for b in length_bits:
        msg_length = (msg_length << 1) | b

    print(f"  Message length: {msg_length} bytes")

    if msg_length == 0:
        cap.release()
        return ""

    payload_bits_needed = msg_length * 8
    total_bits_needed = 8 + payload_bits_needed

    if max_segments < total_bits_needed:
        cap.release()
        raise ValueError(
            f"Video has {max_segments} segments but need {total_bits_needed} "
            f"for a {msg_length}-byte message"
        )

    # Decode payload bits
    print(f"Decoding payload ({payload_bits_needed} bits) …")
    all_bits = length_bits[:]
    for i in range(payload_bits_needed):
        sig = read_segment()
        bit = _decode_bit(sig, fps, freq0, freq1)
        all_bits.append(bit)

        progress = (i + 1) / payload_bits_needed * 100
        if (i + 1) % max(1, payload_bits_needed // 10) == 0 or i == payload_bits_needed - 1:
            print(f"  [{progress:5.1f}%] decoded bit {i + 1}/{payload_bits_needed}")

    cap.release()

    message = bits_to_text(all_bits)
    print(f"Decoded message: {message!r}")
    return message
