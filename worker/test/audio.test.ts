import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  muLaw8kToPcm16k,
  muLaw8kToPcm24k,
  pcm16kToMuLaw8k,
  pcm24kToMuLaw8k,
} from "../src/audio";

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 17, 200]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("encodes empty input", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toEqual(new Uint8Array(0));
  });
});

describe("muLaw8kToPcm16k", () => {
  it("upsamples 8 kHz → 16 kHz by sample doubling (length 2x)", () => {
    const ulaw = new Uint8Array([0xff, 0x80, 0x00, 0x7f]);
    const pcm = new Int16Array(muLaw8kToPcm16k(bytesToBase64(ulaw)));
    expect(pcm.length).toBe(ulaw.length * 2);
    // Each adjacent pair should be identical (nearest-neighbour upsample).
    for (let i = 0; i < pcm.length; i += 2) {
      expect(pcm[i]).toBe(pcm[i + 1]);
    }
  });

  it("decodes μ-law silence (0xff) to ~zero", () => {
    const silence = bytesToBase64(new Uint8Array(8).fill(0xff));
    const pcm = new Int16Array(muLaw8kToPcm16k(silence));
    for (const s of pcm) expect(Math.abs(s)).toBeLessThan(16);
  });

  it("decoded samples stay within int16 range", () => {
    // Sweep every μ-law byte once.
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const pcm = new Int16Array(muLaw8kToPcm16k(bytesToBase64(all)));
    for (const s of pcm) {
      expect(s).toBeGreaterThanOrEqual(-32768);
      expect(s).toBeLessThanOrEqual(32767);
    }
  });
});

describe("muLaw8kToPcm24k", () => {
  it("upsamples 8 kHz → 24 kHz with 3x linear interpolation (length 3x)", () => {
    const ulaw = new Uint8Array([0xff, 0x80, 0x00, 0x7f]);
    const pcm = new Int16Array(muLaw8kToPcm24k(bytesToBase64(ulaw)));
    expect(pcm.length).toBe(ulaw.length * 3);
    // Every third sample lands exactly on a μ-law sample boundary.
    for (let i = 0; i < ulaw.length; i++) {
      const direct = new Int16Array(muLaw8kToPcm16k(bytesToBase64(ulaw.slice(i, i + 1))));
      expect(pcm[i * 3 + 2]).toBe(direct[0]);
    }
  });

  it("decoded samples stay within int16 range", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const pcm = new Int16Array(muLaw8kToPcm24k(bytesToBase64(all)));
    for (const s of pcm) {
      expect(s).toBeGreaterThanOrEqual(-32768);
      expect(s).toBeLessThanOrEqual(32767);
    }
  });
});

describe("pcm24kToMuLaw8k", () => {
  it("decimates 24 kHz → 8 kHz (length /3)", () => {
    const pcm = new Int16Array(12);
    for (let i = 0; i < pcm.length; i++) pcm[i] = i * 1000;
    const ulaw = base64ToBytes(pcm24kToMuLaw8k(pcm.buffer));
    expect(ulaw.length).toBe(pcm.length / 3);
  });

  it("survives a 24k PCM → μ-law → 24k PCM round-trip with bounded loss", () => {
    const orig = new Int16Array(32);
    for (let i = 0; i < orig.length; i++) {
      orig[i] = Math.round(Math.sin(i / 4) * 8000);
    }
    // Pretend orig is 8 kHz; expand 3x to 24 kHz.
    const expanded = new Int16Array(orig.length * 3);
    for (let i = 0; i < orig.length; i++) {
      expanded[i * 3] = orig[i]!;
      expanded[i * 3 + 1] = orig[i]!;
      expanded[i * 3 + 2] = orig[i]!;
    }
    const ulawB64 = pcm24kToMuLaw8k(expanded.buffer);
    const back = new Int16Array(muLaw8kToPcm24k(ulawB64));
    expect(back.length).toBe(expanded.length);
    for (let i = 0; i < orig.length; i++) {
      const err = Math.abs(back[i * 3 + 2]! - orig[i]!);
      expect(err).toBeLessThan(1500);
    }
  });
});

describe("pcm16kToMuLaw8k", () => {
  it("decimates 16 kHz → 8 kHz (length /2)", () => {
    const pcm = new Int16Array(8);
    for (let i = 0; i < pcm.length; i++) pcm[i] = i * 1000;
    const ulaw = base64ToBytes(pcm16kToMuLaw8k(pcm.buffer));
    expect(ulaw.length).toBe(pcm.length / 2);
  });

  it("survives an end-to-end PCM → μ-law → PCM round-trip with bounded loss", () => {
    // Voice-band amplitudes; μ-law is logarithmic so absolute error grows
    // with magnitude but relative error stays small.
    const orig = new Int16Array(32);
    for (let i = 0; i < orig.length; i++) {
      orig[i] = Math.round(Math.sin(i / 4) * 8000);
    }
    // Encode at 8 kHz: pretend orig is already 8 kHz by doubling first.
    const doubled = new Int16Array(orig.length * 2);
    for (let i = 0; i < orig.length; i++) {
      doubled[i * 2] = orig[i]!;
      doubled[i * 2 + 1] = orig[i]!;
    }
    const ulawB64 = pcm16kToMuLaw8k(doubled.buffer);
    const back = new Int16Array(muLaw8kToPcm16k(ulawB64));
    expect(back.length).toBe(doubled.length);
    for (let i = 0; i < orig.length; i++) {
      const err = Math.abs(back[i * 2]! - orig[i]!);
      // μ-law at this amplitude: error well under 5% of full scale.
      expect(err).toBeLessThan(1500);
    }
  });
});
