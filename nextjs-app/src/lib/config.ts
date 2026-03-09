/**
 * Heart Codec configuration — matches the Python version exactly.
 */
export const Config = {
  SEGMENT_DURATION: 2.0,
  FREQ_BIT_0: 5.0,
  FREQ_BIT_1: 8.0,
  MODULATION_AMPLITUDE: 10.0,
  BANDPASS_LOW: 0.7,
  BANDPASS_HIGH: 4.0,
  DECODE_BANDPASS_LOW: 4.0,
  DECODE_BANDPASS_HIGH: 10.0,
  FOREHEAD_RATIO: [0.2, 0.0, 0.8, 0.3] as const,
  FACE_SMOOTH_ALPHA: 0.3,
};
