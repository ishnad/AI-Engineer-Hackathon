// μ-law (Twilio, 8 kHz) ↔ linear PCM16 conversion.
// Twilio Media Streams send/receive base64-encoded G.711 μ-law mono at 8 kHz.
// Gemini Live expects PCM16 @ 16 kHz; OpenAI Realtime expects PCM16 @ 24 kHz.
// We do nearest-neighbour / linear-interp resampling — fine for voice, terrible for music.

const MU = 0xff;
const BIAS = 0x84;

function muLawDecodeSample(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}

function muLawEncodeSample(pcm: number): number {
  const sign = pcm < 0 ? 0x80 : 0x00;
  if (pcm < 0) pcm = -pcm;
  if (pcm > 32635) pcm = 32635;
  pcm += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & MU;
}

export function muLaw8kToPcm16k(b64: string): ArrayBuffer {
  const ulaw = base64ToBytes(b64);
  // Upsample 8 kHz → 16 kHz by sample doubling.
  const out = new Int16Array(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) {
    const s = muLawDecodeSample(ulaw[i]!);
    out[i * 2] = s;
    out[i * 2 + 1] = s;
  }
  return out.buffer;
}

export function pcm16kToMuLaw8k(pcm: ArrayBuffer): string {
  const view = new Int16Array(pcm);
  // Decimate 16 kHz → 8 kHz by dropping every other sample.
  const out = new Uint8Array(Math.floor(view.length / 2));
  for (let i = 0, j = 0; j < out.length; i += 2, j++) {
    out[j] = muLawEncodeSample(view[i]!);
  }
  return bytesToBase64(out);
}

export function muLaw8kToPcm24k(b64: string): ArrayBuffer {
  const ulaw = base64ToBytes(b64);
  // Upsample 8 kHz → 24 kHz with linear interpolation between adjacent samples.
  const out = new Int16Array(ulaw.length * 3);
  let prev = ulaw.length > 0 ? muLawDecodeSample(ulaw[0]!) : 0;
  for (let i = 0; i < ulaw.length; i++) {
    const cur = muLawDecodeSample(ulaw[i]!);
    const d = cur - prev;
    out[i * 3] = (prev + ((d * 1) / 3)) | 0;
    out[i * 3 + 1] = (prev + ((d * 2) / 3)) | 0;
    out[i * 3 + 2] = cur;
    prev = cur;
  }
  return out.buffer;
}

export function pcm24kToMuLaw8k(pcm: ArrayBuffer): string {
  const view = new Int16Array(pcm);
  // Decimate 24 kHz → 8 kHz by taking every third sample.
  const out = new Uint8Array(Math.floor(view.length / 3));
  for (let i = 0, j = 0; j < out.length; i += 3, j++) {
    out[j] = muLawEncodeSample(view[i]!);
  }
  return bytesToBase64(out);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
