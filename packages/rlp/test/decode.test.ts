import { decode, decodeFirst, hexToBytes, RlpError } from "../lib";
import { HexTree, toHexTree } from "./helpers";

function listHeader(payloadLength: number): number[] {
  if (payloadLength <= 55) {
    return [0xc0 + payloadLength];
  }
  const length: number[] = [];
  for (let n = payloadLength; n > 0; n = Math.floor(n / 256)) {
    length.unshift(n % 256);
  }
  return [0xf7 + length.length, ...length];
}

describe("decode", () => {
  it("decodes byte strings", () => {
    expect(toHexTree(decode("0x80"))).toBe("0x");
    expect(toHexTree(decode("0x7f"))).toBe("0x7f");
    expect(toHexTree(decode("0x8180"))).toBe("0x80");
    expect(toHexTree(decode("0x83646f67"))).toBe("0x646f67");
  });

  it("decodes nested lists", () => {
    expect(toHexTree(decode("0xc0"))).toEqual([]);
    expect(toHexTree(decode("0xc7c0c1c0c3c0c1c0"))).toEqual([
      [],
      [[]],
      [[], [[]]]
    ]);
    expect(toHexTree(decode("0xc6827a77c10401"))).toEqual([
      "0x7a77",
      ["0x04"],
      "0x01"
    ]);
  });

  it("decodes long-form strings and lists", () => {
    expect(toHexTree(decode("0xb838" + "aa".repeat(56)))).toBe(
      "0x" + "aa".repeat(56)
    );
    expect(toHexTree(decode("0xf838" + "83616263".repeat(14)))).toEqual(
      new Array(14).fill("0x616263")
    );
  });

  it("accepts bytes, or hex with or without 0x", () => {
    const expected = ["0x646f67"];
    expect(toHexTree(decode(hexToBytes("0xc483646f67")))).toEqual(expected);
    expect(toHexTree(decode("0xc483646f67"))).toEqual(expected);
    expect(toHexTree(decode("c483646f67"))).toEqual(expected);
  });

  it("returns copies, not views of the input", () => {
    const input = hexToBytes("0x83646f67");
    const decoded = decode(input) as Uint8Array;

    expect(decoded.constructor).toBe(Uint8Array);
    decoded[0] = 0;
    expect(input).toEqual(hexToBytes("0x83646f67"));
  });

  describe("rejects non-canonical encodings", () => {
    it("a single byte below 0x80 given a header", () => {
      expect(() => decode("0x8100")).toThrow(/encoded as itself/);
      expect(() => decode("0x817f")).toThrow(/encoded as itself/);
    });

    it("the long form for a length of 55 or less", () => {
      expect(() => decode("0xb837" + "aa".repeat(55))).toThrow(/short form/);
      expect(() => decode("0xf80180")).toThrow(/short form/);
    });

    it("lengths with leading zeros", () => {
      expect(() => decode("0xb90038" + "aa".repeat(56))).toThrow(
        /leading zeros/
      );
      expect(() => decode("0xf90038" + "80".repeat(56))).toThrow(
        /leading zeros/
      );
    });
  });

  describe("rejects truncated input", () => {
    it.each([
      ["empty input", "0x"],
      ["a string missing bytes", "0x83646f"],
      ["a missing long-form length", "0xb9"],
      ["a partial long-form length", "0xb904"],
      ["a list missing items", "0xc3"],
      ["a list missing part of an item", "0xc483646f"]
    ])("%s", (_description, input) => {
      expect(() => decode(input)).toThrow(RlpError);
    });

    it("an item that overruns its list, even if bytes follow", () => {
      // the list holds 2 bytes, but its item claims 3
      expect(() => decode("0xc283646f67")).toThrow(/only 1 remain/);
    });

    it("lengths too large to be real", () => {
      expect(() => decode("0xbfffffffffffffffff00")).toThrow(RlpError);
    });
  });

  it("rejects trailing bytes", () => {
    expect(() => decode("0x8080")).toThrow(/1 unexpected byte/);
  });

  it("rejects malformed hex", () => {
    expect(() => decode("0x8g")).toThrow(/Invalid hex/);
  });

  it("decodes very deep nesting without recursion", () => {
    const depth = 100000;
    // build [[[...[]...]]] from the inside out
    const headers: number[][] = [];
    let length = 1;
    for (let i = 0; i < depth; i++) {
      const header = listHeader(length);
      headers.push(header);
      length += header.length;
    }
    const input = Uint8Array.from([...headers.reverse().flat(), 0xc0]);

    let node = decode(input);
    let levels = 0;
    while (Array.isArray(node) && node.length === 1) {
      node = node[0];
      levels++;
    }
    expect(levels).toBe(depth);
    expect(node).toEqual([]);
  });
});

describe("decodeFirst", () => {
  it("returns the first item and the bytes after it", () => {
    const { decoded, remainder } = decodeFirst("0x83646f6780c0");

    expect(toHexTree(decoded)).toBe("0x646f67");
    expect(remainder).toEqual(hexToBytes("0x80c0"));
  });

  it("reads a stream of concatenated items", () => {
    let rest = hexToBytes("0x01c0c18083636174");
    const items: HexTree[] = [];
    while (rest.length > 0) {
      const { decoded, remainder } = decodeFirst(rest);
      items.push(toHexTree(decoded));
      rest = remainder;
    }
    expect(items).toEqual(["0x01", [], ["0x"], "0x636174"]);
  });

  it("still rejects a truncated first item", () => {
    expect(() => decodeFirst("0x83646f")).toThrow(RlpError);
  });
});
