# 💓 Heart Codec – Heart-Rate Steganography

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Deploy](https://github.com/Fran-cois/encode_heart/actions/workflows/deploy.yml/badge.svg)](https://github.com/Fran-cois/encode_heart/actions/workflows/deploy.yml)

> **[Live demo →](https://fran-cois.github.io/encode_heart)**

Hide a secret message inside a video by modulating the **apparent heart rate**
detected through remote photoplethysmography (rPPG).

- **Web app** — Record, detect, encode & decode entirely in the browser (Next.js).
- **Python CLI** — Same algorithms available offline via a command-line tool.
- **Open source** — MIT-licensed, contributions welcome.

---

## How it works

| Step | What happens |
|------|-------------|
| **Detect** | A face is detected (Haar cascade). The mean green-channel intensity of the forehead ROI is tracked, bandpass-filtered (0.7 – 4 Hz), and the dominant frequency is extracted via FFT → BPM. |
| **Encode** | The secret string is converted to bits (8-bit length prefix + UTF-8 payload). The video is split into fixed-duration *segments*. For each bit a sinusoidal modulation at **f₀** (bit 0) or **f₁** (bit 1) is added to the green channel of the forehead skin region. The modulation is imperceptible to the eye (~10/255) but detectable by rPPG analysis. |
| **Decode** | The same segmentation and ROI extraction is performed on the encoded video. For each segment the FFT power at f₀ vs f₁ determines the bit value. The length prefix tells the decoder how many payload bytes to read. |

```
Secret ──▶ bits ──▶ sin(f₀) / sin(f₁) per segment ──▶ modulated video
                                                          │
modulated video ──▶ rPPG per segment ──▶ FFT peak ──▶ bits ──▶ Secret
```

### The core idea

Every heartbeat pushes blood through capillaries beneath the skin, subtly
changing how it reflects light — especially in the **green** wavelength
(~540 nm). A camera can pick up this micro-flush even though it's invisible
to the naked eye.

**Remote photoplethysmography (rPPG)** recovers the pulse signal from video:
average the green-channel intensity over a skin region (forehead), bandpass-
filter the time series, and read the dominant frequency with an FFT.

If we can *read* a heart-rate frequency we can also *write* one.
`encode_heart` adds a faint sinusoidal modulation at a chosen frequency into
the forehead ROI — one frequency for bit 0, another for bit 1 — creating a
covert data channel inside an ordinary face video.

---

## Web app

The Next.js frontend reimplements all algorithms in TypeScript so everything
runs in the browser — no server, no data upload.

```bash
cd nextjs-app
npm install
npm run dev          # http://localhost:3000
```

The app is automatically deployed to GitHub Pages on every push:
**https://fran-cois.github.io/encode_heart**

---

## Python CLI

```bash
pip install -r requirements.txt

# Detect heart rate
python main.py detect path/to/video.mp4

# Encode a secret
python main.py encode path/to/video.mp4 "HELLO" -o encoded.mp4

# Decode the secret
python main.py decode encoded.mp4
```

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `-o / --output` | `encoded.mp4` | Output path for the encoded video |
| `--segment-duration` | `5.0` | Seconds of video per encoded bit |
| `--amplitude` | `6.0` | Modulation strength in pixel intensity units |

> `--segment-duration` must match between encode and decode.

### Video length needed

Each bit requires one segment (default 5 s for CLI, 2 s for the web app).

| Secret | Bits | Video needed (@ 5 s/bit) |
|--------|------|--------------------------|
| `"Hi"` | 24 | 2 min |
| `"HELLO"` | 48 | 4 min |
| `"Secret123"` | 80 | 6 min 40 s |

---

## Project structure

```
encode_heart/
├── LICENSE
├── README.md
├── main.py                  # Python CLI entry point
├── requirements.txt
├── heart_codec/             # Python package
│   ├── config.py
│   ├── face.py
│   ├── rppg.py
│   ├── encoder.py
│   └── decoder.py
├── nextjs-app/              # Web frontend (Next.js)
│   ├── src/
│   │   ├── app/             # Pages & layout
│   │   ├── components/      # UI components
│   │   └── lib/             # TS algorithms (encoder, decoder, rppg, dsp…)
│   ├── public/              # Static assets
│   └── package.json
└── .github/workflows/       # CI — build & deploy to GitHub Pages
```

## Requirements

- **Web app**: A modern browser with webcam access (HTTPS required).
- **Python CLI**: Python ≥ 3.10, OpenCV, NumPy, SciPy (see `requirements.txt`).
- Input video must show a person's face with reasonable lighting and ≥ 15 FPS.

## Limitations & future work

- The Haar cascade face detector can lose tracking if the subject moves quickly or turns away.
- Lossy codecs (H.264/H.265) compress colour information and can degrade the signal — consider using MJPEG or FFV1 for lossless output.
- A more robust approach could use Euler Video Magnification or chrominance-based rPPG (CHROM/POS) for better signal-to-noise.
- Error-correction codes (e.g. Hamming, Reed–Solomon) would improve resilience.

## License

[MIT](LICENSE) — Fran-cois
