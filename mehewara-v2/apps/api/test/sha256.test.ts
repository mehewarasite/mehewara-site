import { describe, expect, it } from "vitest";
import { createSha256, sha256StreamHex } from "../src/shared/sha256";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= chunks.length) { c.close(); return; }
      c.enqueue(chunks[i]!);
      i += 1;
    },
  });
}

async function subtleHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("incremental SHA-256", () => {
  it("matches NIST vectors", () => {
    const empty = createSha256();
    expect(empty.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const abc = createSha256();
    abc.update(new TextEncoder().encode("abc"));
    expect(abc.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches subtle.digest across block boundaries and chunk splits", async () => {
    // Lengths chosen around the 55/56/64-byte padding boundaries.
    for (const len of [0, 1, 55, 56, 57, 64, 65, 119, 128, 1000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
      const expected = await subtleHex(bytes);
      // Whole message in one update.
      const one = createSha256();
      one.update(bytes);
      expect(one.digestHex()).toBe(expected);
      // One byte at a time.
      const split = createSha256();
      for (let i = 0; i < len; i += 1) split.update(bytes.subarray(i, i + 1));
      expect(split.digestHex()).toBe(expected);
      // Through a stream split into odd chunks.
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < len; i += 13) chunks.push(bytes.subarray(i, Math.min(i + 13, len)));
      expect(await sha256StreamHex(streamOf(chunks))).toBe(expected);
    }
  });

  it("hashes 1 MiB identically to subtle.digest", async () => {
    const bytes = new Uint8Array(1_048_576);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i & 0xff;
    const hasher = createSha256();
    for (let i = 0; i < bytes.length; i += 65_537) hasher.update(bytes.subarray(i, Math.min(i + 65_537, bytes.length)));
    expect(hasher.digestHex()).toBe(await subtleHex(bytes));
  });
});
