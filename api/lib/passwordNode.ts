import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";

/** Matches browser `src/lib/password.ts` (PBKDF2-SHA256, 100k iterations, 32-byte key). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith("pbkdf2:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
    if (expected.length !== hash.length) return false;
    return timingSafeEqual(expected, hash);
  } catch {
    return false;
  }
}
