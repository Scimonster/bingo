import { cryptoRng, type Rng } from "./rng";
import { LIMITS } from "./constants";

/** Join-code alphabet: no ambiguous 0/O, 1/I/L. */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateJoinCode(rng: Rng = cryptoRng, length: number = LIMITS.joinCodeLength): string {
  let s = "";
  for (let i = 0; i < length; i++) s += JOIN_CODE_ALPHABET[rng(JOIN_CODE_ALPHABET.length)];
  return s;
}

/** Normalizes typed input: uppercase, strip spaces/dashes, map look-alikes (O→0 is not in the alphabet, so O stays invalid). */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidJoinCode(code: string): boolean {
  return code.length === LIMITS.joinCodeLength && [...code].every((c) => JOIN_CODE_ALPHABET.includes(c));
}

/** Serial number → zero-padded doc ID (at least 3 digits): 42 → "042". */
export function formatSerial(serial: number): string {
  return String(serial).padStart(3, "0");
}

export function parseSerial(input: string): number | null {
  const t = input.trim().replace(/^№\s*/, "");
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Internal board ID for a sheet's slot. */
export function boardId(serial: number, slot: number): string {
  return `${formatSerial(serial)}-${slot}`;
}

/** URL path encoded in a sheet's QR code. */
export function sheetQrPath(gameId: string, serial: number): string {
  return `/s/${gameId}/${formatSerial(serial)}`;
}
