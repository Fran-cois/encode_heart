"""Face detection and forehead ROI extraction with temporal smoothing."""

import cv2
import numpy as np

from heart_codec.config import Config


class FaceDetector:
    """Detects faces using OpenCV Haar cascades and extracts forehead ROI."""

    def __init__(self):
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._cascade = cv2.CascadeClassifier(cascade_path)
        if self._cascade.empty():
            raise RuntimeError(f"Failed to load Haar cascade from {cascade_path}")

        self._smooth_rect = None  # exponentially smoothed face rect (x, y, w, h)
        self._frames_lost = 0

    def detect(self, frame: np.ndarray):
        """Detect the primary face in *frame* and return the forehead ROI rect.

        Returns (fx, fy, fw, fh) for the forehead region, or None if no face
        is found (and tracking has expired).
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80)
        )

        if len(faces) > 0:
            # Pick the largest face
            areas = [w * h for (_, _, w, h) in faces]
            best = faces[int(np.argmax(areas))]
            raw = np.array(best, dtype=np.float64)

            if self._smooth_rect is None:
                self._smooth_rect = raw
            else:
                alpha = Config.FACE_SMOOTH_ALPHA
                self._smooth_rect = alpha * raw + (1 - alpha) * self._smooth_rect

            self._frames_lost = 0
        else:
            self._frames_lost += 1
            if self._frames_lost > Config.FACE_LOST_MAX_FRAMES:
                self._smooth_rect = None
                return None

        if self._smooth_rect is None:
            return None

        return self._forehead_roi(frame, self._smooth_rect)

    def _forehead_roi(self, frame, face_rect):
        """Compute forehead ROI from a (possibly smoothed) face rect."""
        x, y, w, h = [int(round(v)) for v in face_rect]
        r = Config.FOREHEAD_RATIO  # (x_start, y_start, x_end, y_end) relative

        fx = x + int(w * r[0])
        fy = y + int(h * r[1])
        fw = int(w * (r[2] - r[0]))
        fh = int(h * (r[3] - r[1]))

        # Clip to frame boundaries
        H, W = frame.shape[:2]
        fx = max(0, fx)
        fy = max(0, fy)
        fw = min(fw, W - fx)
        fh = min(fh, H - fy)

        if fw <= 0 or fh <= 0:
            return None
        return (fx, fy, fw, fh)

    def reset(self):
        """Reset tracking state (e.g. when starting a new video)."""
        self._smooth_rect = None
        self._frames_lost = 0
