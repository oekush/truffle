import { RlpError } from "./errors";

const hexByte: string[] = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, "0")
);

/**
 * Converts bytes to a lowercase, `0x`-prefixed hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexByte[bytes[i]];
  }
  return hex;
}

/**
 * Converts a hex string (with or without `0x`) to bytes. An odd number of
 * digits is left-padded with a zero, so `"0x1"` is `[0x01]`.
 */
export function hexToBytes(hex: string): Uint8Array {
  let digits = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(digits)) {
    throw new RlpError(`Invalid hex string: ${JSON.stringify(hex)}`);
  }
  if (digits.length % 2 === 1) {
    digits = "0" + digits;
  }
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(digits.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Encodes a string as UTF-8. Unpaired surrogates become U+FFFD, matching
 * `TextEncoder`.
 */
export function utf8ToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Converts a non-negative integer to its minimal big-endian bytes, as RLP
 * expects for scalars: no leading zeros, and `0` is the empty byte string.
 */
export function integerToBytes(value: number | bigint): Uint8Array {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RlpError(
      `Cannot encode ${value}: numbers must be safe integers (use a bigint for larger values)`
    );
  }
  if (value < 0) {
    throw new RlpError(`Cannot encode ${value}: integers must be non-negative`);
  }
  if (value === 0 || value === BigInt(0)) {
    return new Uint8Array(0);
  }
  return hexToBytes(value.toString(16));
}

/**
 * Reads bytes as a big-endian unsigned integer; the empty byte string is `0`.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? BigInt(0) : BigInt(bytesToHex(bytes));
}
