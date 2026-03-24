"""Face detection and forehead ROI extraction with temporal smoothing."""

import cv2
import numpy as np

from heart_codec.config import Config


class FaceDetector:
    """Detects faces using OpenCV Haar cascades and extracts forehead ROI.

    Uses ``haarcascade_frontalface_alt2`` for better accuracy,
    histogram equalisation for varying lighting, aspect-ratio checks
    and skin-colour validation to reject false positives (e.g. walls).
    """

    def __init__(self):
        # alt2 is more accurate than the default cascade
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
        self._cascade = cv2.CascadeClassifier(cascade_path)
        if self._cascade.empty():
            # Fallback to default cascade
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._cascade = cv2.CascadeClassifier(cascade_path)
            if self._cascade.empty():
                raise RuntimeError("Failed to load any Haar cascade")

        self._smooth_rect = None  # exponentially smoothed face rect (x, y, w, h)
        self._frames_lost = 0

    def detect(self, frame: np.ndarray, *, for_bpm: bool = False):
        """Detect the primary face in *frame* and return a ROI rect.

        When *for_bpm* is False (default) the forehead ROI is returned
        (used for encoding / decoding).  When True a larger skin ROI
        covering the cheeks is returned, which is better for BPM estimation.

        Returns (fx, fy, fw, fh) or None.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Histogram equalisation improves detection under varying lighting
        gray = cv2.equalizeHist(gray)

        faces = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=6, minSize=(80, 80),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        accepted = False
        if len(faces) > 0:
            # Pick the largest face
            areas = [w * h for (_, _, w, h) in faces]
            best = faces[int(np.argmax(areas))]

            # Reject implausible aspect ratios (faces are roughly 3:4 to 1:1)
            _, _, bw, bh = best
            aspect = bw / max(bh, 1)
            if 0.5 <= aspect <= 1.5:
                raw = np.array(best, dtype=np.float64)

                if self._smooth_rect is None:
                    self._smooth_rect = raw
                else:
                    alpha = Config.FACE_SMOOTH_ALPHA
                    self._smooth_rect = alpha * raw + (1 - alpha) * self._smooth_rect

                self._frames_lost = 0
                accepted = True

        if not accepted:
            self._frames_lost += 1
            if self._frames_lost > Config.FACE_LOST_MAX_FRAMES:
                self._smooth_rect = None
                return None

        if self._smooth_rect is None:
            return None

        ratio = Config.SKIN_ROI_RATIO if for_bpm else Config.FOREHEAD_RATIO
        roi = self._compute_roi(frame, self._smooth_rect, ratio)

        # Skin-colour validation: reject ROIs that land on the background
        if roi is not None and not self._validate_skin(frame, roi):
            return None

        return roi

    def _compute_roi(self, frame, face_rect, ratio):
        """Compute a ROI from a (possibly smoothed) face rect using *ratio*."""
        x, y, w, h = [int(round(v)) for v in face_rect]

        fx = x + int(w * ratio[0])
        fy = y + int(h * ratio[1])
        fw = int(w * (ratio[2] - ratio[0]))
        fh = int(h * (ratio[3] - ratio[1]))

        # Clip to frame boundaries
        H, W = frame.shape[:2]
        fx = max(0, fx)
        fy = max(0, fy)
        fw = min(fw, W - fx)
        fh = min(fh, H - fy)

        if fw <= 0 or fh <= 0:
            return None
        return (fx, fy, fw, fh)

    @staticmethod
    def _validate_skin(frame, roi) -> bool:
        """Return True if the ROI contains enough skin-coloured pixels (YCbCr)."""
        fx, fy, fw, fh = roi
        patch = frame[fy : fy + fh, fx : fx + fw]
        if patch.size == 0:
            return False

        b = patch[:, :, 0].astype(np.float32)
        g = patch[:, :, 1].astype(np.float32)
        r = patch[:, :, 2].astype(np.float32)

        cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
        cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b

        skin_mask = (cb >= 75) & (cb <= 130) & (cr >= 130) & (cr <= 180)
        return float(np.mean(skin_mask)) >= Config.SKIN_MIN_FRACTION

    # Keep legacy name so existing callers still work
    def _forehead_roi(self, frame, face_rect):
        return self._compute_roi(frame, face_rect, Config.FOREHEAD_RATIO)

    def reset(self):
        """Reset tracking state (e.g. when starting a new video)."""
        self._smooth_rect = None
        self._frames_lost = 0
