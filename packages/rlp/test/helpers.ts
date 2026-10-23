import { bytesToHex, Decoded } from "../lib";

export type HexTree = string | HexTree[];

// makes decoded values readable in assertions
export function toHexTree(decoded: Decoded): HexTree {
  return decoded instanceof Uint8Array
    ? bytesToHex(decoded)
    : decoded.map(toHexTree);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
