# encode_heart – Heart-Rate Steganography

Hide a secret message inside a video of a person by modulating the
**apparent heart rate** detected through remote photoplethysmography (rPPG).

## How it works

| Step | What happens |
|------|-------------|
| **Detect** | A face is detected (Haar cascade). The mean green-channel intensity of the forehead ROI is tracked over time, bandpass-filtered (0.7 – 4 Hz), and the dominant frequency is extracted via FFT → BPM. |
| **Encode** | The secret string is converted to bits (8-bit length prefix + UTF-8 payload). The video is split into fixed-duration *segments* (default 5 s). For each bit, a sinusoidal modulation at frequency **f₀** (bit 0 → 60 BPM) or **f₁** (bit 1 → 100 BPM) is added to the green channel of the forehead skin region. The modulation is imperceptible to the eye (~6/255 intensity) but detectable by rPPG analysis. |
| **Decode** | The same segmentation and ROI extraction is performed on the encoded video. For each segment, the FFT power at f₀ vs f₁ determines the bit value. The length prefix tells the decoder how many payload bytes to read. |

## Quick start

```bash
pip install -r requirements.txt

# 1 – Detect heart rate from a face video
python main.py detect path/to/video.mp4

# 2 – Encode a secret into the video
python main.py encode path/to/video.mp4 "HELLO" -o encoded.mp4

# 3 – Decode the secret from the encoded video
python main.py decode encoded.mp4
```

## CLI reference

```
python main.py detect <video>
python main.py encode <video> <secret> [-o OUTPUT] [--segment-duration S] [--amplitude A]
python main.py decode <video> [--segment-duration S]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-o / --output` | `encoded.mp4` | Output path for the encoded video |
| `--segment-duration` | `5.0` | Seconds of video per encoded bit |
| `--amplitude` | `6.0` | Modulation strength in pixel intensity units |

> **Note:** `--segment-duration` must match between encode and decode.

## Requirements

- Python ≥ 3.10
- OpenCV, NumPy, SciPy (see `requirements.txt`)
- Input video must show a person's face with reasonable lighting and ≥ 15 FPS.

## Video length needed

Each bit requires one segment (default 5 s).  
Bits = 8 (length prefix) + 8 × len(secret in UTF-8 bytes).

| Secret | Bits | Video needed (@ 5 s/bit) |
|--------|------|--------------------------|
| `"Hi"` | 24 | 2 min |
| `"HELLO"` | 48 | 4 min |
| `"Secret123"` | 80 | 6 min 40 s |

## Project structure

```
encode_heart/
├── main.py                 # CLI entry point
├── requirements.txt
├── README.md
└── heart_codec/
    ├── __init__.py
    ├── config.py            # Tunable parameters
    ├── face.py              # Face detection + forehead ROI
    ├── rppg.py              # rPPG signal extraction & HR estimation
    ├── encoder.py           # Secret → modulated video
    └── decoder.py           # Modulated video → secret
```

## Limitations & future work

- The Haar cascade face detector can lose tracking if the subject moves quickly or turns away.
- Lossy codecs (H.264/H.265) compress colour information and can degrade the signal – consider using MJPEG or FFV1 for lossless output.
- A more robust approach could use Euler Video Magnification or chrominance-based rPPG (CHROM/POS) for better signal-to-noise.
- Error-correction codes (e.g. Hamming, Reed–Solomon) would improve resilience.
