import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_BACKUP_BYTES, openBackup, sealBackup } from "../../scripts/backup-envelope";

// Synthetic keys stay in test memory. This proves the GCM envelope contract,
// not Windows DPAPI, managed Auth, off-device recovery or a hosted restore.
function vault() {
  let saved: Buffer;
  const wrapped = randomBytes(96);
  return {
    protect(key: Buffer) { saved = Buffer.from(key); return Buffer.from(wrapped); },
    unprotect(value: Buffer) {
      if (!value.equals(wrapped)) throw new Error("Synthetic vault rejected key.");
      return Buffer.from(saved);
    },
  };
}

describe("authenticated local backup envelope", () => {
  it("round-trips without plaintext or raw keys in the envelope", () => {
    const keys = vault();
    const payload = Buffer.from("SYNTHETIC PRIVATE BACKUP PAYLOAD");
    const sealed = sealBackup(payload, keys.protect);
    expect(sealed.includes(payload)).toBe(false);
    expect(openBackup(sealed, keys.unprotect)).toEqual(payload);
    expect(openBackup(sealed, keys.unprotect)).toEqual(payload);
  });

  it.each(["header", "payload", "tag"])("rejects modified %s bytes", (part) => {
    const keys = vault();
    const sealed = sealBackup(Buffer.from("synthetic data to authenticate"), keys.protect);
    const headerStart = Buffer.byteLength("SHAGUN-LOCAL-BACKUP-1\n") + 4;
    const offset = part === "header" ? headerStart + 2 : part === "payload" ? sealed.length - 18 : sealed.length - 1;
    sealed[offset] ^= 1;
    expect(() => openBackup(sealed, keys.unprotect)).toThrow();
  });

  it("rejects a wrong key and truncated or excessive envelopes", () => {
    const keys = vault();
    const sealed = sealBackup(Buffer.from("synthetic content"), keys.protect);
    expect(() => openBackup(sealed, () => randomBytes(32))).toThrow();
    expect(() => openBackup(sealed.subarray(0, 20), keys.unprotect)).toThrow();
    expect(() => sealBackup(Buffer.alloc(0), keys.protect)).toThrow();
    expect(() => sealBackup(Buffer.alloc(MAX_BACKUP_BYTES + 1), keys.protect)).toThrow();
    expect(() => sealBackup(Buffer.from("fixture"), () => Buffer.alloc(1))).toThrow();
  });
});