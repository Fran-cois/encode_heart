/**
 * Binary conversion helpers — 8-bit length prefix + UTF-8 payload.
 */

export function textToBits(text: string): number[] {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  if (data.length > 255) throw new Error("Secret must be ≤ 255 UTF-8 bytes");

  const bits: number[] = [];
  // 8-bit length prefix
  for (let i = 7; i >= 0; i--) bits.push((data.length >> i) & 1);
  // payload
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

export function bitsToText(bits: number[]): string {
  if (bits.length < 8) return "";
  // Read 8-bit length prefix
  let length = 0;
  for (let i = 0; i < 8; i++) length = (length << 1) | bits[i];
  if (length === 0) return "";

  const totalBits = 8 + length * 8;
  if (bits.length < totalBits) return "";

  const bytes = new Uint8Array(length);
  for (let b = 0; b < length; b++) {
    let val = 0;
    for (let i = 0; i < 8; i++) {
      val = (val << 1) | bits[8 + b * 8 + i];
    }
    bytes[b] = val;
  }
  return new TextDecoder().decode(bytes);
}
