"""Configuration constants for heart rate encoding/decoding."""


class Config:
    # Segment duration in seconds: each bit of the secret is encoded in one segment.
    # Minimum ~1.5s needed for FFT to distinguish the two frequencies.
    SEGMENT_DURATION = 2.0

    # Frequencies used for binary encoding (Hz)
    # Chosen ABOVE the natural heart-rate band (0.7-4 Hz) so the injected
    # modulation never interferes with the real pulse signal.
    FREQ_BIT_0 = 5.0    # encodes bit 0
    FREQ_BIT_1 = 8.0    # encodes bit 1

    # Amplitude of the synthetic pulse modulation (pixel intensity units).
    # Must be large enough to dominate the natural pulse (~0.5 px) and survive
    # lossy video compression, yet small enough to be imperceptible to the eye.
    MODULATION_AMPLITUDE = 10.0

    # Bandpass filter bounds for rPPG signal extraction (Hz)
    BANDPASS_LOW = 0.7    # ~42 BPM
    BANDPASS_HIGH = 4.0   # ~240 BPM

    # Bandpass for decode: isolates the encoding frequencies, rejects pulse
    DECODE_BANDPASS_LOW = 4.0
    DECODE_BANDPASS_HIGH = 10.0

    # Forehead ROI relative to the face bounding box (x_start, y_start, x_end, y_end)
    FOREHEAD_RATIO = (0.2, 0.0, 0.8, 0.3)

    # Face tracking: exponential smoothing factor (0 = no smoothing, 1 = no tracking)
    FACE_SMOOTH_ALPHA = 0.3

    # Maximum frames without face detection before giving up on tracking
    FACE_LOST_MAX_FRAMES = 30
