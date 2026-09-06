/**
 * Minimal incremental SHA-256 over bytes.
 *
 * The Worker runtime's `crypto.subtle.digest` needs the whole message at
 * once, which would force upload-confirm to buffer a second copy of objects
 * up to the 50 MB ticket maximum (~100 MB transient). This implementation
 * processes `ReadableStream` chunks as they arrive and keeps only the
 * 32-byte state plus one 64-byte block in memory.
 *
 * Standard FIPS 180-4 SHA-256. Verified against `crypto.subtle.digest` and
 * NIST vectors in `test/sha256.test.ts`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export interface IncrementalSha256 { update(chunk: Uint8Array): void; digestHex(): string; }

export function createSha256(): IncrementalSha256 {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const block = new Uint8Array(64);
  let blockLen = 0;
  let totalLen = 0;
  let finalized = false;

  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

  function compress(view: Uint8Array, offset: number): void {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i += 1) {
      w[i] = ((view[offset + i * 4]! << 24) | (view[offset + i * 4 + 1]! << 16) | (view[offset + i * 4 + 2]! << 8) | view[offset + i * 4 + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return {
    update(chunk: Uint8Array): void {
      if (finalized) throw new Error("SHA-256 already finalized");
      totalLen += chunk.byteLength;
      let offset = 0;
      while (offset < chunk.byteLength) {
        const take = Math.min(64 - blockLen, chunk.byteLength - offset);
        block.set(chunk.subarray(offset, offset + take), blockLen);
        blockLen += take;
        offset += take;
        if (blockLen === 64) { compress(block, 0); blockLen = 0; }
      }
    },
    digestHex(): string {
      if (finalized) throw new Error("SHA-256 already finalized");
      finalized = true;
      const bitLenHi = Math.floor((totalLen * 8) / 0x1_0000_0000);
      const bitLenLo = (totalLen * 8) >>> 0;
      // Padding: 0x80, zeros, then the 64-bit big-endian length. At most two blocks.
      const pad = new Uint8Array(blockLen < 56 ? 64 - blockLen : 128 - blockLen);
      pad[0] = 0x80;
      pad[pad.length - 8] = (bitLenHi >>> 24) & 0xff;
      pad[pad.length - 7] = (bitLenHi >>> 16) & 0xff;
      pad[pad.length - 6] = (bitLenHi >>> 8) & 0xff;
      pad[pad.length - 5] = bitLenHi & 0xff;
      pad[pad.length - 4] = (bitLenLo >>> 24) & 0xff;
      pad[pad.length - 3] = (bitLenLo >>> 16) & 0xff;
      pad[pad.length - 2] = (bitLenLo >>> 8) & 0xff;
      pad[pad.length - 1] = bitLenLo & 0xff;
      let offset = 0;
      const saved = block.slice(0, blockLen);
      const combined = new Uint8Array(saved.length + pad.length);
      combined.set(saved, 0);
      combined.set(pad, saved.length);
      while (offset < combined.length) { compress(combined, offset); offset += 64; }
      return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
    },
  };
}

/** Hash a streamed body with O(1) memory: chunks are digested as read. */
export async function sha256StreamHex(stream: ReadableStream<Uint8Array>): Promise<string> {
  const hasher = createSha256();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) hasher.update(value);
  }
  try { reader.releaseLock(); } catch { /* already closed */ }
  return hasher.digestHex();
}
