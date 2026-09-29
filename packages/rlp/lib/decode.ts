import { RlpError } from "./errors";
import { hexToBytes } from "./bytes";
import type { Decoded } from "./types";

/*
 * Decoding is strict: besides rejecting truncated input, it rejects every
 * non-canonical encoding (a single byte below 0x80 wrapped in a header, the
 * long form used for a short length, or a length with leading zeros), so
 * each value has exactly one accepted encoding.
 *
 * Lists are decoded with an explicit stack rather than recursion, so deeply
 * nested untrusted input cannot overflow the call stack.
 */

const SHORT_STRING = 0x80;
const SHORT_LIST = 0xc0;
const MAX_SHORT_LENGTH = 55;

interface OpenList {
  items: Decoded[];
  end: number;
}

/**
 * Decodes a single RLP item that spans all of `input` (bytes, or a hex
 * string with or without `0x`). Throws `RlpError` if the input is malformed,
 * non-canonical, or has bytes left over.
 */
export function decode(input: Uint8Array | string): Decoded {
  const { decoded, remainder } = decodeFirst(input);
  if (remainder.length > 0) {
    throw new RlpError(
      `Invalid RLP: ${remainder.length} unexpected byte(s) after the first item`
    );
  }
  return decoded;
}

/**
 * Decodes the RLP item at the start of `input`, returning it along with the
 * bytes that follow it. Use this to read a stream of concatenated items.
 */
export function decodeFirst(input: Uint8Array | string): {
  decoded: Decoded;
  remainder: Uint8Array;
} {
  const bytes = typeof input === "string" ? hexToBytes(input) : input;
  if (!(bytes instanceof Uint8Array)) {
    throw new RlpError("Can only decode a Uint8Array or a hex string");
  }
  const [decoded, end] = decodeItem(bytes);
  return { decoded, remainder: copy(bytes, end, bytes.length) };
}

function decodeItem(bytes: Uint8Array): [Decoded, number] {
  const open: OpenList[] = [];
  let position = 0;

  for (;;) {
    const limit = open.length > 0 ? open[open.length - 1].end : bytes.length;
    if (position >= limit) {
      throw new RlpError("Invalid RLP: unexpected end of input");
    }

    let value: Decoded;
    const prefix = bytes[position];
    if (prefix < SHORT_STRING) {
      value = copy(bytes, position, position + 1);
      position += 1;
    } else if (prefix < SHORT_LIST) {
      const { offset, length } = readHeader(
        bytes,
        position,
        limit,
        SHORT_STRING
      );
      if (length === 1 && bytes[offset] < SHORT_STRING) {
        throw new RlpError(
          "Invalid RLP: single byte below 0x80 must be encoded as itself"
        );
      }
      value = copy(bytes, offset, offset + length);
      position = offset + length;
    } else {
      const { offset, length } = readHeader(bytes, position, limit, SHORT_LIST);
      position = offset;
      if (length > 0) {
        open.push({ items: [], end: offset + length });
        continue;
      }
      value = [];
    }

    // hand the finished value to its parent list, closing every list that
    // this value completes
    for (;;) {
      const parent = open[open.length - 1];
      if (parent === undefined) {
        return [value, position];
      }
      parent.items.push(value);
      if (position < parent.end) {
        break;
      }
      open.pop();
      value = parent.items;
    }
  }
}

function readHeader(
  bytes: Uint8Array,
  start: number,
  limit: number,
  base: number
): { offset: number; length: number } {
  let offset = start + 1;
  let length = bytes[start] - base;

  if (length > MAX_SHORT_LENGTH) {
    const lengthOfLength = length - MAX_SHORT_LENGTH;
    if (lengthOfLength > limit - offset) {
      throw new RlpError("Invalid RLP: unexpected end of input");
    }
    if (bytes[offset] === 0) {
      throw new RlpError("Invalid RLP: length has leading zeros");
    }
    length = 0;
    for (let i = 0; i < lengthOfLength; i++) {
      length *= 256;
      length += bytes[offset + i];
    }
    offset += lengthOfLength;
    if (length <= MAX_SHORT_LENGTH) {
      throw new RlpError(
        `Invalid RLP: length ${length} should use the short form`
      );
    }
  }

  if (length > limit - offset) {
    throw new RlpError(
      `Invalid RLP: item declares ${length} byte(s) but only ${
        limit - offset
      } remain`
    );
  }
  return { offset, length };
}

// copies into a plain Uint8Array (never a view, and never a Buffer)
function copy(bytes: Uint8Array, start: number, end: number): Uint8Array {
  return new Uint8Array(bytes.subarray(start, end));
}
