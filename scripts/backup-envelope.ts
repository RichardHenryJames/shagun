import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("SHAGUN-LOCAL-BACKUP-1\n", "ascii");
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const TAG_BYTES = 16;

export type ProtectKey = (key: Buffer) => Buffer;

function bytes(value: unknown, min: number, max: number): Buffer {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid backup envelope.");
  }
  const result = Buffer.from(value, "base64");
  if (result.length < min || result.length > max) throw new Error("Invalid backup envelope.");
  return result;
}

/** Local encryption only; key wrapping is supplied by the Windows DPAPI caller. */
export function sealBackup(payload: Buffer, protectKey: ProtectKey): Buffer {
  if (!payload.length || payload.length > MAX_BACKUP_BYTES) throw new Error("Backup payload limit exceeded.");
  const key = randomBytes(32);
  try {
    const nonce = randomBytes(12);
    const wrapped = protectKey(key);
    if (wrapped.length < 32 || wrapped.length > 8192) throw new Error("Invalid protected backup key.");
    const header = Buffer.from(JSON.stringify({ version: 1, cipher: "AES-256-GCM", keyProtection: "Windows-DPAPI-CurrentUser",
      nonce: nonce.toString("base64"), wrappedKey: wrapped.toString("base64") }));
    const size = Buffer.alloc(4);
    size.writeUInt32BE(header.length);
    const aad = Buffer.concat([MAGIC, size, header]);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);
    return Buffer.concat([aad, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
  } finally { key.fill(0); }
}

/** Authenticate the entire header and payload before returning any plaintext. */
export function openBackup(envelope: Buffer, unprotectKey: ProtectKey): Buffer {
  if (envelope.length < MAGIC.length + 4 + TAG_BYTES || envelope.length > MAX_BACKUP_BYTES + MAX_HEADER_BYTES + MAGIC.length + 4 + TAG_BYTES
      || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Invalid backup envelope.");
  const headerSize = envelope.readUInt32BE(MAGIC.length);
  const offset = MAGIC.length + 4 + headerSize;
  if (headerSize > MAX_HEADER_BYTES || offset + TAG_BYTES >= envelope.length) throw new Error("Invalid backup envelope.");
  const header: unknown = JSON.parse(envelope.subarray(MAGIC.length + 4, offset).toString("utf8"));
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error("Invalid backup envelope.");
  const record = header as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "cipher,keyProtection,nonce,version,wrappedKey" || record.version !== 1
      || record.cipher !== "AES-256-GCM" || record.keyProtection !== "Windows-DPAPI-CurrentUser") throw new Error("Invalid backup envelope.");
  const nonce = bytes(record.nonce, 12, 12);
  const wrapped = bytes(record.wrappedKey, 32, 8192);
  const key = unprotectKey(wrapped);
  try {
    if (key.length !== 32) throw new Error("Invalid unprotected backup key.");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(envelope.subarray(0, offset));
    decipher.setAuthTag(envelope.subarray(-TAG_BYTES));
    const pending = decipher.update(envelope.subarray(offset, -TAG_BYTES));
    try { return Buffer.concat([pending, decipher.final()]); }
    finally { pending.fill(0); }
  } finally { key.fill(0); }
}