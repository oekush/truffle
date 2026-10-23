import * as fc from "fast-check";
import { testProp } from "jest-fast-check";

import {
  bytesToBigInt,
  decode,
  decodeFirst,
  encode,
  RlpError,
  utf8ToBytes
} from "../lib";
import type { Decoded } from "../lib";
import { concat } from "./helpers";

// byte strings of every size class, and lists of them nested a few levels
const bytes = fc.oneof(
  fc.uint8Array({ maxLength: 60 }),
  fc.uint8Array({ minLength: 50, maxLength: 1100 })
);
const { tree } = fc.letrec(tie => ({
  tree: fc.frequency(
    { weight: 3, arbitrary: bytes },
    { weight: 1, arbitrary: fc.array(tie("tree"), { maxLength: 5 }) }
  )
}));
const decodedTree = tree as fc.Arbitrary<Decoded>;

describe("properties", () => {
  testProp("decode inverts encode", [decodedTree], value => {
    expect(decode(encode(value))).toEqual(value);
  });

  testProp(
    "decodeFirst returns exactly the bytes after the item",
    [decodedTree, fc.uint8Array({ maxLength: 20 })],
    (value, extra) => {
      const { decoded, remainder } = decodeFirst(concat(encode(value), extra));

      expect(decoded).toEqual(value);
      expect(remainder).toEqual(extra);
    }
  );

  testProp(
    "every truncated encoding is rejected",
    [decodedTree, fc.nat()],
    (value, cut) => {
      const encoded = encode(value);
      const truncated = encoded.subarray(0, cut % encoded.length);

      expect(() => decode(truncated)).toThrow(RlpError);
    }
  );

  testProp(
    "integers round-trip, and numbers encode like bigints",
    [fc.maxSafeNat(), fc.bigUintN(256)],
    (number, bigint) => {
      expect(encode(number)).toEqual(encode(BigInt(number)));
      expect(bytesToBigInt(decode(encode(number)) as Uint8Array)).toBe(
        BigInt(number)
      );
      expect(bytesToBigInt(decode(encode(bigint)) as Uint8Array)).toBe(bigint);
    }
  );

  testProp("text is encoded as valid UTF-8", [fc.fullUnicodeString()], text => {
    const percentEncoded = Array.from(
      utf8ToBytes(text),
      byte => "%" + byte.toString(16).padStart(2, "0")
    ).join("");

    expect(decodeURIComponent(percentEncoded)).toBe(text);
  });
});
