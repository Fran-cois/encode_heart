#!/usr/bin/env python3
"""CLI for heart-rate steganography: detect, encode, and decode."""

import argparse
import sys


def cmd_detect(args):
    """Detect heart rate from a video."""
    from heart_codec.rppg import estimate_heart_rate_from_video

    bpm, fps = estimate_heart_rate_from_video(args.video)
    print(f"Video FPS : {fps:.1f}")
    print(f"Heart rate: {bpm:.1f} BPM")


def cmd_encode(args):
    """Encode a secret into a video."""
    from heart_codec.encoder import encode

    info = encode(
        input_video=args.video,
        output_video=args.output,
        secret=args.secret,
        segment_duration=args.segment_duration,
        amplitude=args.amplitude,
    )
    print(f"\nSummary:")
    print(f"  Bits encoded       : {info['bits']}")
    print(f"  Frames per segment : {info['frames_per_segment']}")
    print(f"  Video duration used: {info['video_duration_needed']:.1f} s")
    print(f"  Output file        : {info['output']}")


def cmd_decode(args):
    """Decode a secret from an encoded video."""
    from heart_codec.decoder import decode

    message = decode(
        video_path=args.video,
        segment_duration=args.segment_duration,
    )
    print(f"\n=== Decoded secret ===")
    print(message)


def main():
    parser = argparse.ArgumentParser(
        prog="encode_heart",
        description="Heart-rate steganography – hide a secret message in a "
                    "person's apparent heart rate within a video.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── detect ──────────────────────────────────────────────────────────
    p_detect = sub.add_parser(
        "detect", help="Detect heart rate from a face video"
    )
    p_detect.add_argument("video", help="Path to the input video")
    p_detect.set_defaults(func=cmd_detect)

    # ── encode ──────────────────────────────────────────────────────────
    p_encode = sub.add_parser(
        "encode", help="Encode a secret into a video's heart rate signal"
    )
    p_encode.add_argument("video", help="Path to the input video")
    p_encode.add_argument("secret", help="The secret message to encode (≤ 255 bytes)")
    p_encode.add_argument(
        "-o", "--output", default="encoded.mp4",
        help="Path for the output video (default: encoded.mp4)",
    )
    p_encode.add_argument(
        "--segment-duration", type=float, default=5.0,
        help="Seconds per bit (default: 5.0)",
    )
    p_encode.add_argument(
        "--amplitude", type=float, default=6.0,
        help="Modulation amplitude in pixel units (default: 6.0)",
    )
    p_encode.set_defaults(func=cmd_encode)

    # ── decode ──────────────────────────────────────────────────────────
    p_decode = sub.add_parser(
        "decode", help="Decode a secret from an encoded video"
    )
    p_decode.add_argument("video", help="Path to the encoded video")
    p_decode.add_argument(
        "--segment-duration", type=float, default=5.0,
        help="Seconds per bit – must match the value used at encode time (default: 5.0)",
    )
    p_decode.set_defaults(func=cmd_decode)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
