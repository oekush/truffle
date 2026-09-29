import { bytesToHex, decode, encode, Input, RlpError } from "../lib";

import valid from "./fixtures/rlptest.json";
import invalid from "./fixtures/invalidRLPTest.json";

// fixture inputs are text, numbers, lists, or "#"-prefixed big integers
function fromFixture(value: unknown): Input {
  if (Array.isArray(value)) {
    return value.map(fromFixture);
  }
  if (typeof value === "string" && value.startsWith("#")) {
    return BigInt(value.slice(1));
  }
  return value as Input;
}

describe("ethereum/tests RLPTests", () => {
  describe("rlptest.json", () => {
    test.each(Object.entries(valid))("%s", (_name, { in: input, out }) => {
      const encoded = encode(fromFixture(input));

      expect(bytesToHex(encoded)).toBe(out.toLowerCase());
      expect(encode(decode(out))).toEqual(encoded);
    });
  });

  describe("invalidRLPTest.json", () => {
    test.each(Object.entries(invalid))("rejects %s", (_name, { out }) => {
      expect(() => decode(out)).toThrow(RlpError);
    });
  });
});
