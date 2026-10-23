import { bytesToHex, encode, Input, RlpError } from "../lib";

const hex = (input: Input) => bytesToHex(encode(input));

describe("encode", () => {
  describe("byte strings", () => {
    it("encodes a single byte below 0x80 as itself", () => {
      expect(hex(Uint8Array.of(0x00))).toBe("0x00");
      expect(hex(Uint8Array.of(0x7f))).toBe("0x7f");
    });

    it("prefixes a single byte of 0x80 or more", () => {
      expect(hex(Uint8Array.of(0x80))).toBe("0x8180");
      expect(hex(Uint8Array.of(0xff))).toBe("0x81ff");
    });

    it("encodes every kind of empty value as 0x80", () => {
      for (const empty of [new Uint8Array(0), "", "0x", 0, BigInt(0), null]) {
        expect(hex(empty)).toBe("0x80");
      }
      expect(hex(undefined)).toBe("0x80");
    });

    it("uses the short form for up to 55 bytes", () => {
      expect(hex(new Uint8Array(55).fill(0xaa))).toBe("0xb7" + "aa".repeat(55));
    });

    it("uses the long form from 56 bytes", () => {
      expect(hex(new Uint8Array(56).fill(0xaa))).toBe(
        "0xb838" + "aa".repeat(56)
      );
      expect(hex(new Uint8Array(1024).fill(0xaa))).toBe(
        "0xb90400" + "aa".repeat(1024)
      );
      expect(hex(new Uint8Array(0x10000).fill(0xaa))).toBe(
        "0xba010000" + "aa".repeat(0x10000)
      );
    });

    it("does not modify its input", () => {
      const bytes = Uint8Array.of(1, 2, 3);
      encode([bytes, bytes]);
      expect(bytes).toEqual(Uint8Array.of(1, 2, 3));
    });
  });

  describe("strings", () => {
    it("reads 0x-prefixed strings as hex", () => {
      expect(hex("0x0400")).toBe("0x820400");
      expect(hex("0xABCD")).toBe("0x82abcd");
      expect(hex("0x00")).toBe("0x00");
    });

    it("left-pads hex with an odd number of digits", () => {
      expect(hex("0xabc")).toBe("0x820abc");
    });

    it("encodes other strings as UTF-8", () => {
      expect(hex("dog")).toBe("0x83646f67");
      expect(hex("héllo 🌍")).toBe("0x8b68c3a96c6c6f20f09f8c8d");
    });

    it("replaces unpaired surrogates with U+FFFD, like TextEncoder", () => {
      expect(hex("\ud800x")).toBe("0x84efbfbd78");
      expect(hex("x\udc00")).toBe("0x8478efbfbd");
    });

    it("rejects malformed hex", () => {
      expect(() => encode("0xzz")).toThrow(RlpError);
      expect(() => encode("0x12 34")).toThrow(RlpError);
    });
  });

  describe("integers", () => {
    it("encodes big-endian with no leading zeros", () => {
      expect(hex(1)).toBe("0x01");
      expect(hex(127)).toBe("0x7f");
      expect(hex(128)).toBe("0x8180");
      expect(hex(256)).toBe("0x820100");
      expect(hex(1000)).toBe("0x8203e8");
      expect(hex(Number.MAX_SAFE_INTEGER)).toBe("0x871fffffffffffff");
    });

    it("encodes bigints the same way as numbers", () => {
      for (const n of [1, 127, 128, 256, 1000, Number.MAX_SAFE_INTEGER]) {
        expect(hex(BigInt(n))).toBe(hex(n));
      }
      expect(hex(BigInt(2) ** BigInt(256))).toBe("0xa101" + "00".repeat(32));
    });

    it("rejects negative integers", () => {
      expect(() => encode(-1)).toThrow(RlpError);
      expect(() => encode(BigInt(-1))).toThrow(RlpError);
    });

    it("rejects numbers that are not safe integers", () => {
      for (const n of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => encode(n)).toThrow(/safe integers/);
      }
    });
  });

  describe("lists", () => {
    it("encodes the empty list as 0xc0", () => {
      expect(hex([])).toBe("0xc0");
    });

    it("encodes nested lists", () => {
      expect(hex([[], [[]], [[], [[]]]])).toBe("0xc7c0c1c0c3c0c1c0");
      expect(hex(["zw", [4], 1])).toBe("0xc6827a77c10401");
    });

    it("uses the long form once the payload exceeds 55 bytes", () => {
      const items = new Array(14).fill("abc"); // 14 * 4 = 56 payload bytes
      expect(hex(items)).toBe("0xf838" + "83616263".repeat(14));
    });

    it("mixes all kinds of input", () => {
      expect(
        hex([Uint8Array.of(0xff), "0x01", "a", 2, BigInt(3), null, []])
      ).toBe("0xc881ff0161020380c0");
    });
  });

  it("rejects values it cannot encode", () => {
    for (const value of [true, {}, () => 0, Symbol("x")]) {
      expect(() => encode(value as unknown as Input)).toThrow(RlpError);
    }
  });

  describe("Ethereum structures", () => {
    // https://eips.ethereum.org/EIPS/eip-155#example
    const transaction = {
      nonce: 9,
      gasPrice: 20000000000,
      gasLimit: 21000,
      to: "0x3535353535353535353535353535353535353535",
      value: BigInt("1000000000000000000"),
      data: "0x"
    };
    const fields = Object.values(transaction);

    it("encodes the EIP-155 signing payload", () => {
      expect(hex([...fields, 1, 0, 0])).toBe(
        "0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080"
      );
    });

    it("encodes the EIP-155 signed transaction", () => {
      const v = 37;
      const r =
        "0x28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276";
      const s =
        "0x67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";

      expect(hex([...fields, v, r, s])).toBe(
        "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83"
      );
    });

    it("encodes [sender, nonce], whose keccak256 gives a CREATE address", () => {
      const sender = "0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0";
      expect(hex([sender, 0])).toBe(
        "0xd6946ac7ea33f8831ea9dcc53393aaa88b25a785dbf080"
      );
      expect(hex([sender, 1])).toBe(
        "0xd6946ac7ea33f8831ea9dcc53393aaa88b25a785dbf001"
      );
    });
  });
});
