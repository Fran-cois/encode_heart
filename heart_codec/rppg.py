"""Remote photoplethysmography (rPPG) – extract pulse signal and estimate heart rate."""

import numpy as np
from scipy.signal import butter, filtfilt

from heart_codec.config import Config
from heart_codec.face import FaceDetector


def extract_green_signal(frames: list[np.ndarray], fps: float) -> np.ndarray:
    """Extract the spatially-averaged green channel from the forehead ROI per frame.

    Returns a 1-D float array of length <= len(frames). Frames where the face
    is not detected are filled with the previous valid value (sample-and-hold).
    """
    detector = FaceDetector()
    signal = []
    last_val = None

    for frame in frames:
        roi = detector.detect(frame)
        if roi is not None:
            fx, fy, fw, fh = roi
            patch = frame[fy : fy + fh, fx : fx + fw]
            green_mean = float(np.mean(patch[:, :, 1]))  # BGR → G channel
            last_val = green_mean
        if last_val is not None:
            signal.append(last_val)
        else:
            signal.append(0.0)

    return np.array(signal, dtype=np.float64)


def bandpass_filter(signal: np.ndarray, fps: float,
                    low: float = Config.BANDPASS_LOW,
                    high: float = Config.BANDPASS_HIGH) -> np.ndarray:
    """Apply a 4th-order Butterworth bandpass filter."""
    nyq = fps / 2.0
    # Clamp to valid Nyquist range
    low_n = max(low / nyq, 0.01)
    high_n = min(high / nyq, 0.99)
    order = 4
    # filtfilt needs padlen >= 3*max(len(a),len(b)), reduce order for short signals
    min_len = 3 * (2 * order + 1)
    while order > 1 and len(signal) < min_len:
        order -= 1
        min_len = 3 * (2 * order + 1)
    if len(signal) < min_len:
        return np.zeros_like(signal)
    b, a = butter(order, [low_n, high_n], btype="band")
    return filtfilt(b, a, signal)


def estimate_heart_rate(signal: np.ndarray, fps: float) -> tuple[float, np.ndarray, np.ndarray]:
    """Estimate heart rate from a green-channel time series.

    Returns (bpm, freqs, power_spectrum).
    """
    filtered = bandpass_filter(signal, fps)

    # Window the signal (Hanning) to reduce spectral leakage
    windowed = filtered * np.hanning(len(filtered))

    # Zero-pad to 4× length for finer frequency resolution
    n_padded = len(windowed) * 4
    fft_vals = np.abs(np.fft.rfft(windowed, n=n_padded))
    freqs = np.fft.rfftfreq(n_padded, d=1.0 / fps)

    # Search within the bandpass range only
    mask = (freqs >= Config.BANDPASS_LOW) & (freqs <= Config.BANDPASS_HIGH)
    if not np.any(mask):
        return 0.0, freqs, fft_vals

    idx = np.argmax(fft_vals[mask])
    peak_freq = freqs[mask][idx]
    bpm = peak_freq * 60.0

    return bpm, freqs, fft_vals


def estimate_heart_rate_from_video(video_path: str) -> tuple[float, float]:
    """Convenience: open a video file and return (bpm, fps)."""
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
    cap.release()

    if len(frames) < int(fps * 2):
        raise ValueError("Video too short for reliable heart rate estimation (need ≥ 2 s)")

    signal = extract_green_signal(frames, fps)
    bpm, _, _ = estimate_heart_rate(signal, fps)
    return bpm, fps
