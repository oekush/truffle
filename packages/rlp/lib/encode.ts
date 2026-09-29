import { RlpError } from "./errors";
import { hexToBytes, integerToBytes, utf8ToBytes } from "./bytes";
import type { Input } from "./types";

/*
 * RLP (Ethereum Yellow Paper, Appendix B) serializes a tree of byte strings:
 *
 *   byte string, 1 byte < 0x80        the byte itself
 *   byte string, 0-55 bytes           0x80 + length, bytes
 *   byte string, > 55 bytes           0xb7 + length-of-length, length, bytes
 *   list, payload 0-55 bytes          0xc0 + length, payload
 *   list, payload > 55 bytes          0xf7 + length-of-length, length, payload
 *
 * where a list's payload is the concatenated encodings of its items, and
 * lengths are big-endian with no leading zeros.
 *
 * Encoding happens in two passes: the first converts the input to bytes and
 * works out the encoded size of every item, so the second can write straight
 * into a single, exactly-sized output buffer.
 */

const SHORT_STRING = 0x80;
const LONG_STRING = 0xb7;
const SHORT_LIST = 0xc0;
const LONG_LIST = 0xf7;
const MAX_SHORT_LENGTH = 55;

type Node =
  | { kind: "bytes"; bytes: Uint8Array; length: number }
  | { kind: "list"; items: Node[]; payloadLength: number; length: number };

/**
 * RLP-encodes a byte string, integer, text, or (nested) list of these.
 */
export function encode(input: Input): Uint8Array {
  const node = prepare(input);
  const output = new Uint8Array(node.length);
  write(node, output, 0);
  return output;
}

function prepare(input: Input): Node {
  if (isList(input)) {
    const items = input.map(prepare);
    const payloadLength = items.reduce((sum, item) => sum + item.length, 0);
    return {
      kind: "list",
      items,
      payloadLength,
      length: headerLength(payloadLength) + payloadLength
    };
  }

  const bytes = toBytes(input);
  const length = isSingleByte(bytes)
    ? 1
    : headerLength(bytes.length) + bytes.length;
  return { kind: "bytes", bytes, length };
}

function write(node: Node, output: Uint8Array, offset: number): number {
  if (node.kind === "bytes") {
    const { bytes } = node;
    if (isSingleByte(bytes)) {
      output[offset] = bytes[0];
      return offset + 1;
    }
    offset = writeHeader(
      SHORT_STRING,
      LONG_STRING,
      bytes.length,
      output,
      offset
    );
    output.set(bytes, offset);
    return offset + bytes.length;
  }

  offset = writeHeader(
    SHORT_LIST,
    LONG_LIST,
    node.payloadLength,
    output,
    offset
  );
  for (const item of node.items) {
    offset = write(item, output, offset);
  }
  return offset;
}

function writeHeader(
  shortBase: number,
  longBase: number,
  length: number,
  output: Uint8Array,
  offset: number
): number {
  if (length <= MAX_SHORT_LENGTH) {
    output[offset] = shortBase + length;
    return offset + 1;
  }

  const lengthOfLength = byteLength(length);
  output[offset] = longBase + lengthOfLength;
  for (let i = lengthOfLength; i > 0; i--) {
    output[offset + i] = length % 256;
    length = Math.floor(length / 256);
  }
  return offset + 1 + lengthOfLength;
}

function headerLength(length: number): number {
  return length <= MAX_SHORT_LENGTH ? 1 : 1 + byteLength(length);
}

// number of bytes needed to write `length` big-endian
function byteLength(length: number): number {
  let count = 0;
  for (; length > 0; length = Math.floor(length / 256)) {
    count++;
  }
  return count;
}

function isSingleByte(bytes: Uint8Array): boolean {
  return bytes.length === 1 && bytes[0] < SHORT_STRING;
}

function isList(input: Input): input is readonly Input[] {
  return Array.isArray(input);
}

function toBytes(input: Exclude<Input, readonly Input[]>): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input === null || input === undefined) {
    return new Uint8Array(0);
  }
  switch (typeof input) {
    case "string":
      return input.startsWith("0x") ? hexToBytes(input) : utf8ToBytes(input);
    case "number":
    case "bigint":
      return integerToBytes(input);
  }
  throw new RlpError(`Cannot encode value of type ${typeof input}`);
}
