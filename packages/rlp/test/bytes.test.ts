import {
  bytesToBigInt,
  bytesToHex,
  hexToBytes,
  integerToBytes,
  RlpError
} from "../lib";

describe("byte helpers", () => {
  it("converts between bytes and hex", () => {
    expect(bytesToHex(new Uint8Array(0))).toBe("0x");
    expect(bytesToHex(Uint8Array.of(0, 1, 0xab, 0xff))).toBe("0x0001abff");
    expect(hexToBytes("0x0001abff")).toEqual(Uint8Array.of(0, 1, 0xab, 0xff));
    expect(hexToBytes("0001ABFF")).toEqual(Uint8Array.of(0, 1, 0xab, 0xff));
    expect(hexToBytes("0x")).toEqual(new Uint8Array(0));
  });

  it("left-pads hex with an odd number of digits", () => {
    expect(hexToBytes("0x1")).toEqual(Uint8Array.of(1));
    expect(hexToBytes("0x123")).toEqual(Uint8Array.of(0x01, 0x23));
  });

  it("rejects malformed hex", () => {
    for (const hex of ["0xg0", "0x 1", "0x0x12", "-0x1"]) {
      expect(() => hexToBytes(hex)).toThrow(RlpError);
    }
  });

  it("converts between integers and minimal bytes", () => {
    expect(integerToBytes(0)).toEqual(new Uint8Array(0));
    expect(integerToBytes(0x0100)).toEqual(Uint8Array.of(1, 0));
    expect(integerToBytes(BigInt("0xdeadbeef"))).toEqual(
      Uint8Array.of(0xde, 0xad, 0xbe, 0xef)
    );
    expect(bytesToBigInt(new Uint8Array(0))).toBe(BigInt(0));
    expect(bytesToBigInt(Uint8Array.of(0xde, 0xad, 0xbe, 0xef))).toBe(
      BigInt(0xdeadbeef)
    );
  });
});
