"""Flask web application for heart-rate steganography."""

import io
import json
import math
import os
import subprocess
import sys
import tempfile
import traceback
import uuid

# Ensure the project root is on sys.path so heart_codec is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from heart_codec.config import Config
from heart_codec.decoder import _decode_bit, bits_to_text
from heart_codec.encoder import text_to_bits
from heart_codec.face import FaceDetector
from heart_codec.rppg import bandpass_filter, estimate_heart_rate, extract_green_signal

app = Flask(__name__, template_folder="templates", static_folder="static")

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "heart_codec_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Limit upload size to 200 MB
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024

ALLOWED_EXTENSIONS = {"mp4", "webm", "avi", "mov", "mkv"}


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _unique_path(ext: str = "mp4") -> str:
    return os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}.{ext}")


def _convert_to_mp4(src: str, dst: str) -> bool:
    """Use ffmpeg to convert any video to a reliable MP4 (H.264 + yuv420p)."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", src,
                "-c:v", "libx264", "-preset", "fast",
                "-pix_fmt", "yuv420p", "-an", dst,
            ],
            check=True, capture_output=True, timeout=120,
        )
        return os.path.isfile(dst)
    except Exception:
        return False


def _reencode_with_fps(src: str, dst: str, fps: float) -> bool:
    """Re-encode a cv2-written video, forcing correct FPS and near-lossless quality."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-r", str(fps),  # force input framerate
                "-i", src,
                "-c:v", "libx264", "-preset", "fast",
                "-crf", "1",     # near-lossless to preserve signal modulation
                "-pix_fmt", "yuv420p", "-an",
                "-r", str(fps),  # force output framerate
                dst,
            ],
            check=True, capture_output=True, timeout=120,
        )
        return os.path.isfile(dst)
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Pages
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ──────────────────────────────────────────────────────────────────────────────
# API: upload video
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
def upload_video():
    """Upload a video file (or webcam recording). Returns a video_id."""
    if "video" not in request.files:
        return jsonify(error="No video file in request"), 400

    f = request.files["video"]
    if not f.filename:
        return jsonify(error="Empty filename"), 400

    # Determine extension from uploaded file
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else "webm"
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify(error=f"File type .{ext} not allowed"), 400

    video_id = uuid.uuid4().hex
    raw_path = os.path.join(UPLOAD_DIR, f"{video_id}_raw.{ext}")
    f.save(raw_path)
    print(f"[upload] Saved raw file: {raw_path} ({os.path.getsize(raw_path)} bytes)", flush=True)

    # Always convert to MP4 via ffmpeg for reliable OpenCV handling
    mp4_path = os.path.join(UPLOAD_DIR, f"{video_id}.mp4")
    print(f"[upload] Converting to MP4 via ffmpeg...", flush=True)
    if ext == "mp4":
        # Still re-encode to ensure consistent codec
        ok = _convert_to_mp4(raw_path, mp4_path)
    else:
        ok = _convert_to_mp4(raw_path, mp4_path)

    if not ok:
        print(f"[upload] ffmpeg conversion failed, using raw file", flush=True)
        # Fallback: try using the raw file directly
        mp4_path = raw_path
    else:
        print(f"[upload] Conversion OK: {mp4_path} ({os.path.getsize(mp4_path)} bytes)", flush=True)
        # Remove the raw upload
        try:
            os.remove(raw_path)
        except OSError:
            pass

    # Validate it can be opened by OpenCV
    cap = cv2.VideoCapture(mp4_path)
    if not cap.isOpened():
        for p in (mp4_path, raw_path):
            try:
                os.remove(p)
            except OSError:
                pass
        return jsonify(error="Cannot open video – format not supported"), 400

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0  # sensible default for webcam recordings

    # Count frames by reading (CAP_PROP_FRAME_COUNT is unreliable for some codecs)
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    # If frame count is 0/bogus, do a quick count
    if n_frames <= 0:
        cap2 = cv2.VideoCapture(mp4_path)
        n_frames = 0
        while True:
            ret, _ = cap2.read()
            if not ret:
                break
            n_frames += 1
        cap2.release()

    return jsonify(
        video_id=video_id,
        ext="mp4",
        fps=round(fps, 2),
        frames=n_frames,
        width=width,
        height=height,
        duration=round(n_frames / fps, 2) if fps > 0 else 0,
    )


# ──────────────────────────────────────────────────────────────────────────────
# API: detect heart rate  (returns signal + spectrum for visualization)
# ──────────────────────────────────────────────────────────────────────────────

def _find_video(video_id: str) -> str | None:
    for ext in ALLOWED_EXTENSIONS:
        p = os.path.join(UPLOAD_DIR, f"{video_id}.{ext}")
        if os.path.isfile(p):
            return p
    return None


@app.route("/api/detect", methods=["POST"])
def detect_hr():
    """Analyse video and return rPPG signal, spectrum, BPM, and ROI info."""
    data = request.get_json(force=True)
    video_id = data.get("video_id", "")
    if not video_id:
        return jsonify(error="video_id required"), 400

    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404

    try:
        import time as _time
        t0 = _time.time()
        print(f"[detect] Starting analysis for {video_id}", flush=True)

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            return jsonify(error="Cannot open video file"), 400

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0

        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Resize factor: process at ~320px wide for speed
        MAX_W = 320
        scale = min(1.0, MAX_W / max(orig_w, 1))

        # Single pass: detect face + extract green signal
        detector = FaceDetector()
        green_signal = []
        rois = []
        n_frames = 0
        last_green = None
        last_roi = None

        # Face detection every N frames for speed (interpolate between)
        DETECT_EVERY = 3

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Resize for faster processing
            if scale < 1.0:
                small = cv2.resize(frame, (0, 0), fx=scale, fy=scale)
            else:
                small = frame

            n_frames += 1

            # Run face detection only every N frames
            if n_frames % DETECT_EVERY == 1 or DETECT_EVERY == 1:
                roi = detector.detect(small)
                last_roi = roi
            else:
                roi = last_roi

            rois.append(roi)

            if roi is not None:
                fx, fy, fw, fh = roi
                patch = small[fy:fy+fh, fx:fx+fw, 1]
                if patch.size > 0:
                    green_mean = float(np.mean(patch))
                    last_green = green_mean

            green_signal.append(last_green if last_green is not None else 0.0)

        cap.release()
        print(f"[detect] Read {n_frames} frames in {_time.time()-t0:.1f}s", flush=True)

        min_frames = max(int(fps), 10)  # Need at least ~1 second
        if n_frames < min_frames:
            return jsonify(error=f"Vidéo trop courte ({n_frames} frames, besoin de ≥ {min_frames}). Enregistrez au moins 3 secondes."), 400

        signal = np.array(green_signal, dtype=np.float64)
        filtered = bandpass_filter(signal, fps)
        bpm, freqs, power = estimate_heart_rate(signal, fps)
        print(f"[detect] BPM={bpm:.1f}, total time={_time.time()-t0:.1f}s", flush=True)

        # Downsample for JSON (keep at most 2000 pts)
        step = max(1, len(signal) // 2000)
        t = [round(i / fps, 3) for i in range(0, len(signal), step)]
        raw_ds = signal[::step].tolist()
        filt_ds = filtered[::step].tolist()

        # Spectrum – keep from 0 to 4 Hz
        mask = freqs <= 4.5
        spec_freqs = freqs[mask].tolist()
        spec_power = power[mask].tolist()

        # ROI rectangles (sampled) – scale back to original resolution
        inv_scale = 1.0 / scale if scale > 0 else 1.0
        roi_list = []
        for i in range(0, len(rois), step):
            r = rois[i]
            if r:
                roi_list.append([int(v * inv_scale) for v in r])
            else:
                roi_list.append(None)

        return jsonify(
            bpm=round(bpm, 1),
            fps=round(fps, 2),
            n_frames=n_frames,
            time=t,
            raw_signal=_round_list(raw_ds),
            filtered_signal=_round_list(filt_ds),
            spec_freqs=_round_list(spec_freqs, 4),
            spec_power=_round_list(spec_power, 2),
            rois=roi_list,
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=f"Detection failed: {str(e)}"), 500


def _round_list(lst, decimals=2):
    return [round(v, decimals) if v is not None else None for v in lst]


# ──────────────────────────────────────────────────────────────────────────────
# API: encode secret
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/encode", methods=["POST"])
def encode_secret():
    """Encode a secret into the uploaded video. Returns encoding visualization data
    and a download id for the encoded video."""
    data = request.get_json(force=True)
    video_id = data.get("video_id", "")
    secret = data.get("secret", "")
    amplitude = float(data.get("amplitude", Config.MODULATION_AMPLITUDE))
    segment_duration = float(data.get("segment_duration", Config.SEGMENT_DURATION))

    if not video_id:
        return jsonify(error="video_id required"), 400
    if not secret:
        return jsonify(error="secret required"), 400
    if len(secret.encode("utf-8")) > 255:
        return jsonify(error="Secret must be ≤ 255 UTF-8 bytes"), 400

    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404

    bits = text_to_bits(secret)
    n_bits = len(bits)

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frames_per_segment = int(round(segment_duration * fps))
    frames_needed = frames_per_segment * n_bits

    if total_frames < frames_needed:
        cap.release()
        return jsonify(
            error=f"Video too short: need {frames_needed} frames ({n_bits} bits × "
                  f"{frames_per_segment} f/bit) but has {total_frames}."
        ), 400

    # Encode – write raw AVI first (lossless), then re-encode to H.264
    out_id = uuid.uuid4().hex
    raw_avi_path = os.path.join(UPLOAD_DIR, f"{out_id}_raw.avi")
    out_path = os.path.join(UPLOAD_DIR, f"{out_id}.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"RGBA")
    writer = cv2.VideoWriter(raw_avi_path, fourcc, fps, (width, height))

    detector = FaceDetector()
    frame_idx = 0

    # Collect per-segment visualization data
    segment_info = []

    for bit_idx, bit in enumerate(bits):
        target_freq = Config.FREQ_BIT_1 if bit else Config.FREQ_BIT_0
        seg_signal_before = []
        seg_signal_after = []
        modulations = []

        for seg_frame in range(frames_per_segment):
            ret, frame = cap.read()
            if not ret:
                break

            roi = detector.detect(frame)
            if roi is not None:
                fx, fy, fw, fh = roi
                green_before = float(np.mean(frame[fy:fy+fh, fx:fx+fw, 1]))
                seg_signal_before.append(green_before)

                t = seg_frame / fps
                mod = amplitude * math.sin(2.0 * math.pi * target_freq * t)
                modulations.append(round(mod, 3))

                patch = frame[fy:fy+fh, fx:fx+fw].astype(np.float32)
                patch[:, :, 1] += mod
                frame[fy:fy+fh, fx:fx+fw] = np.clip(patch, 0, 255).astype(np.uint8)

                green_after = float(np.mean(frame[fy:fy+fh, fx:fx+fw, 1]))
                seg_signal_after.append(green_after)
            else:
                seg_signal_before.append(None)
                seg_signal_after.append(None)
                modulations.append(0)

            writer.write(frame)
            frame_idx += 1

        # Downsample per segment for viz (max 100 pts)
        step = max(1, len(seg_signal_before) // 100)
        segment_info.append({
            "bit_index": bit_idx,
            "bit_value": bit,
            "freq_hz": round(target_freq, 3),
            "bpm": round(target_freq * 60, 1),
            "is_header": bit_idx < 8,
            "signal_before": _round_list(seg_signal_before[::step]),
            "signal_after": _round_list(seg_signal_after[::step]),
            "modulation": modulations[::step],
        })

    # Write remaining frames
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        writer.write(frame)
        frame_idx += 1

    cap.release()
    writer.release()

    # Re-encode raw AVI to high-quality H.264 MP4 (preserves modulation signal)
    if _reencode_with_fps(raw_avi_path, out_path, fps):
        try:
            os.remove(raw_avi_path)
        except OSError:
            pass
    else:
        # Fallback: rename AVI as mp4 (not ideal but functional)
        print(f"[encode] Warning: ffmpeg re-encode failed", flush=True)
        os.replace(raw_avi_path, out_path)

    return jsonify(
        encoded_video_id=out_id,
        bits=bits,
        n_bits=n_bits,
        frames_per_segment=frames_per_segment,
        fps=round(fps, 2),
        total_frames_written=frame_idx,
        segments=segment_info,
        secret_display=secret,
    )


# ──────────────────────────────────────────────────────────────────────────────
# API: decode
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/decode", methods=["POST"])
def decode_secret():
    """Decode a secret from an encoded video. Returns per-segment spectrum + bits."""
    data = request.get_json(force=True)
    video_id = data.get("video_id", "")
    segment_duration = float(data.get("segment_duration", Config.SEGMENT_DURATION))

    if not video_id:
        return jsonify(error="video_id required"), 400

    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_per_segment = int(round(segment_duration * fps))
    max_segments = total_frames // frames_per_segment

    if max_segments < 8:
        cap.release()
        return jsonify(error="Video too short for decoding (need ≥ 8 segments)"), 400

    detector = FaceDetector()

    def read_segment():
        values = []
        last_val = None
        for _ in range(frames_per_segment):
            ret, frame = cap.read()
            if not ret:
                break
            roi = detector.detect(frame)
            if roi is not None:
                fx, fy, fw, fh = roi
                patch = frame[fy:fy+fh, fx:fx+fw]
                green_mean = float(np.mean(patch[:, :, 1]))
                last_val = green_mean
            if last_val is not None:
                values.append(last_val)
            else:
                values.append(0.0)
        return np.array(values, dtype=np.float64)

    def segment_spectrum(sig):
        """Return (freqs, power, decoded_bit, p0, p1) for a segment signal."""
        if len(sig) < 4:
            return [], [], 0, 0, 0

        sig_centered = sig - np.mean(sig)
        # Bandpass isolates encoding frequencies (4-10 Hz), rejects heart-rate
        filtered = bandpass_filter(sig_centered, fps,
                                   low=Config.DECODE_BANDPASS_LOW,
                                   high=Config.DECODE_BANDPASS_HIGH)

        # --- Bit decision via matched-filter correlation (exact DTFT) ---
        t = np.arange(len(filtered)) / fps
        p0 = float(np.dot(filtered, np.sin(2 * np.pi * Config.FREQ_BIT_0 * t)) ** 2 +
                    np.dot(filtered, np.cos(2 * np.pi * Config.FREQ_BIT_0 * t)) ** 2)
        p1 = float(np.dot(filtered, np.sin(2 * np.pi * Config.FREQ_BIT_1 * t)) ** 2 +
                    np.dot(filtered, np.cos(2 * np.pi * Config.FREQ_BIT_1 * t)) ** 2)
        bit = 1 if p1 > p0 else 0

        # --- FFT spectrum for visualization only ---
        windowed = filtered * np.hanning(len(filtered))
        n_padded = len(windowed) * 4
        fft_vals = np.abs(np.fft.rfft(windowed, n=n_padded))
        freqs = np.fft.rfftfreq(n_padded, d=1.0 / fps)

        mask = freqs <= 12.0
        return freqs[mask].tolist(), fft_vals[mask].tolist(), bit, p0, p1

    # Decode length prefix
    segments_viz = []
    all_bits = []

    for i in range(8):
        sig = read_segment()
        freqs, power, bit, p0, p1 = segment_spectrum(sig)
        all_bits.append(bit)
        step = max(1, len(freqs) // 200)
        segments_viz.append({
            "segment": i,
            "is_header": True,
            "bit": bit,
            "power_f0": round(p0, 2),
            "power_f1": round(p1, 2),
            "spec_freqs": _round_list(freqs[::step], 4) if freqs else [],
            "spec_power": _round_list(power[::step], 2) if power else [],
        })

    msg_length = 0
    for b in all_bits:
        msg_length = (msg_length << 1) | b
    if msg_length == 0:
        cap.release()
        return jsonify(message="", bits=all_bits, segments=segments_viz)

    payload_needed = msg_length * 8
    total_needed = 8 + payload_needed

    if max_segments < total_needed:
        cap.release()
        return jsonify(error=f"Need {total_needed} segments, video has {max_segments}"), 400

    for i in range(payload_needed):
        sig = read_segment()
        freqs, power, bit, p0, p1 = segment_spectrum(sig)
        all_bits.append(bit)

        step = max(1, len(freqs) // 200)
        segments_viz.append({
            "segment": 8 + i,
            "is_header": False,
            "bit": bit,
            "power_f0": round(p0, 2),
            "power_f1": round(p1, 2),
            "spec_freqs": _round_list(freqs[::step], 4) if freqs else [],
            "spec_power": _round_list(power[::step], 2) if power else [],
        })

    cap.release()

    message = bits_to_text(all_bits)
    return jsonify(
        message=message,
        bits=all_bits,
        msg_length=msg_length,
        segments=segments_viz,
    )


# ──────────────────────────────────────────────────────────────────────────────
# API: render encoding visualization
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/render-viz", methods=["POST"])
def render_viz():
    """Generate a visualization video that amplifies the encoding modulation
    so it becomes visible.  Requires both the source and encoded video IDs."""
    data = request.get_json(force=True)
    source_id = data.get("source_video_id", "")
    encoded_id = data.get("encoded_video_id", "")
    segment_duration = float(data.get("segment_duration", Config.SEGMENT_DURATION))
    secret = data.get("secret", "")
    amplitude = float(data.get("amplitude", Config.MODULATION_AMPLITUDE))

    if not source_id or not encoded_id:
        return jsonify(error="source_video_id and encoded_video_id required"), 400

    src_path = _find_video(source_id)
    enc_path = _find_video(encoded_id)
    if not src_path:
        return jsonify(error="Source video not found"), 404
    if not enc_path:
        return jsonify(error="Encoded video not found"), 404

    cap_src = cv2.VideoCapture(src_path)
    cap_enc = cv2.VideoCapture(enc_path)
    if not cap_src.isOpened() or not cap_enc.isOpened():
        return jsonify(error="Cannot open video(s)"), 500

    fps = cap_enc.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap_enc.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap_enc.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap_enc.get(cv2.CAP_PROP_FRAME_COUNT))

    # Compute bits for HUD overlay
    bits = text_to_bits(secret) if secret else []
    frames_per_seg = int(round(segment_duration * fps))

    # Write lossless AVI, then re-encode
    viz_id = uuid.uuid4().hex
    raw_path = os.path.join(UPLOAD_DIR, f"{viz_id}_raw.avi")
    out_path = os.path.join(UPLOAD_DIR, f"{viz_id}.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"RGBA")
    writer = cv2.VideoWriter(raw_path, fourcc, fps, (width, height))

    detector = FaceDetector()
    # Amplification factor: map ±amplitude pixels → full colormap range
    amp_factor = 128.0 / max(amplitude, 1)
    frame_idx = 0

    while True:
        ret_s, frame_s = cap_src.read()
        ret_e, frame_e = cap_enc.read()
        if not ret_s or not ret_e:
            break

        out = frame_e.copy()
        roi = detector.detect(frame_e)

        if roi is not None:
            fx, fy, fw, fh = roi

            # Compute green-channel difference in ROI
            src_g = frame_s[fy:fy+fh, fx:fx+fw, 1].astype(np.float32)
            enc_g = frame_e[fy:fy+fh, fx:fx+fw, 1].astype(np.float32)
            diff = enc_g - src_g  # typically in [-amplitude, +amplitude]

            # Normalize to 0–255 for colormap
            diff_norm = np.clip(diff * amp_factor + 128, 0, 255).astype(np.uint8)
            heatmap = cv2.applyColorMap(diff_norm, cv2.COLORMAP_JET)

            # Blend heatmap into ROI region
            alpha = 0.55
            blended = cv2.addWeighted(
                frame_e[fy:fy+fh, fx:fx+fw], 1.0 - alpha,
                heatmap, alpha, 0,
            )
            out[fy:fy+fh, fx:fx+fw] = blended

            # Slightly dim area outside ROI to draw focus
            mask = np.full(out.shape[:2], 0.55, dtype=np.float32)
            mask[fy:fy+fh, fx:fx+fw] = 1.0
            out = (out.astype(np.float32) * mask[:, :, np.newaxis]).astype(np.uint8)

            # Draw ROI border (green)
            cv2.rectangle(out, (fx, fy), (fx + fw, fy + fh), (0, 230, 118), 2)

        # HUD overlay — bit info
        if bits and frames_per_seg > 0:
            seg_idx = frame_idx // frames_per_seg
            seg_frame = frame_idx % frames_per_seg
            if seg_idx < len(bits):
                bit_val = bits[seg_idx]
                freq = Config.FREQ_BIT_1 if bit_val else Config.FREQ_BIT_0
                is_header = seg_idx < 8
                label = "HEADER" if is_header else "PAYLOAD"
                t = seg_frame / fps
                mod_val = amplitude * math.sin(2.0 * math.pi * freq * t)

                # Background bar
                bar_y = height - 50
                cv2.rectangle(out, (10, bar_y - 5), (width - 10, height - 10), (20, 20, 30), -1)

                # Bit info text
                txt = f"Bit {seg_idx}: {bit_val}  |  {freq:.0f} Hz  |  {label}"
                cv2.putText(out, txt, (18, bar_y + 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1, cv2.LINE_AA)

                # Modulation gauge — centered bar showing current mod value
                gauge_x = width - 180
                gauge_w = 150
                gauge_mid = gauge_x + gauge_w // 2
                # Draw gauge background
                cv2.rectangle(out, (gauge_x, bar_y + 2), (gauge_x + gauge_w, bar_y + 22), (40, 40, 50), -1)
                cv2.line(out, (gauge_mid, bar_y + 2), (gauge_mid, bar_y + 22), (100, 100, 100), 1)
                # Draw gauge fill
                fill_px = int((mod_val / amplitude) * (gauge_w // 2))
                if fill_px > 0:
                    cv2.rectangle(out, (gauge_mid, bar_y + 4), (gauge_mid + fill_px, bar_y + 20), (0, 180, 255), -1)
                elif fill_px < 0:
                    cv2.rectangle(out, (gauge_mid + fill_px, bar_y + 4), (gauge_mid, bar_y + 20), (255, 100, 50), -1)

        writer.write(out)
        frame_idx += 1

    cap_src.release()
    cap_enc.release()
    writer.release()

    # Re-encode to H.264 MP4
    if _reencode_with_fps(raw_path, out_path, fps):
        try:
            os.remove(raw_path)
        except OSError:
            pass
    else:
        os.replace(raw_path, out_path)

    return jsonify(viz_video_id=viz_id)


# ──────────────────────────────────────────────────────────────────────────────
# API: download encoded video
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/download/<video_id>")
def download_video(video_id):
    """Download an encoded video by ID."""
    # Sanitize: only hex chars allowed
    if not all(c in "0123456789abcdef" for c in video_id):
        return jsonify(error="Invalid video_id"), 400

    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404

    return send_file(path, as_attachment=True, download_name="encoded.mp4")


@app.route("/api/video/<video_id>")
def serve_video(video_id):
    """Stream a video for in-browser playback."""
    if not all(c in "0123456789abcdef" for c in video_id):
        return jsonify(error="Invalid video_id"), 400
    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404
    return send_file(path, mimetype="video/mp4")


@app.route("/api/video-info/<video_id>")
def video_info(video_id):
    """Return metadata for a video (fps, frames, duration, resolution).
    Used to restore UI state from a URL video_id after page reload."""
    if not all(c in "0123456789abcdef" for c in video_id):
        return jsonify(error="Invalid video_id"), 400
    path = _find_video(video_id)
    if not path:
        return jsonify(error="Video not found"), 404

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return jsonify(error="Cannot open video"), 500

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    if n_frames <= 0:
        cap2 = cv2.VideoCapture(path)
        n_frames = 0
        while True:
            ret, _ = cap2.read()
            if not ret:
                break
            n_frames += 1
        cap2.release()

    return jsonify(
        video_id=video_id,
        fps=round(fps, 2),
        frames=n_frames,
        width=width,
        height=height,
        duration=round(n_frames / fps, 2) if fps > 0 else 0,
    )


# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)
