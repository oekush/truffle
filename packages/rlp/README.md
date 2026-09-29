# `@truffle/rlp`

Encode and decode [Recursive Length Prefix (RLP)][rlp], the serialization
format Ethereum uses for transactions, blocks, receipts, and the state trie.

- No dependencies. Works with `Uint8Array`, so it runs in Node and browsers.
  Node's `Buffer` is accepted anywhere bytes are.
- Decoding is **strict**. It rejects truncated input, trailing bytes, and
  every non-canonical encoding, so each value has exactly one encoding that
  decodes.
- Decoding is **iterative**. Deeply nested untrusted input can't overflow
  the call stack.
- Tested against the Ethereum Foundation's shared [RLP test vectors][tests].

[rlp]: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
[tests]: https://github.com/ethereum/tests/tree/develop/RLPTests

## Usage

```typescript
import { encode, decode, bytesToHex } from "@truffle/rlp";

bytesToHex(encode("dog")); // "0x83646f67"
bytesToHex(encode(["cat", ["dog", 1024]])); // "0xcc83636174c783646f67820400"

decode("0xcc83636174c783646f67820400");
// [Uint8Array [0x63, 0x61, 0x74], [Uint8Array [0x64, 0x6f, 0x67], Uint8Array [0x04, 0x00]]]
```

## How RLP works

RLP only knows two kinds of item: **byte strings** and **lists** of items.
Each item gets a prefix that says which kind it is and how long it is:

| Item                                | Encoding                                          |
| ----------------------------------- | ------------------------------------------------- |
| single byte in `[0x00, 0x7f]`       | the byte itself                                   |
| byte string of 0–55 bytes           | `0x80 + length`, then the bytes                   |
| byte string of more than 55 bytes   | `0xb7 + length-of-length`, length, then the bytes |
| list whose payload is 0–55 bytes    | `0xc0 + length`, then the payload                 |
| list whose payload is over 55 bytes | `0xf7 + length-of-length`, length, then payload   |

A list's payload is its items' encodings, concatenated. Lengths are written
big-endian with no leading zeros.

## API

### `encode(input: Input): Uint8Array`

Encodes a value. `Input` is any of these:

| Input                   | Treated as                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| `Uint8Array` / `Buffer` | bytes, as-is                                                         |
| `string` starting `0x`  | hex bytes (an odd digit count is left-padded, so `"0x1"` is `0x01`)  |
| any other `string`      | UTF-8 bytes                                                          |
| `number` / `bigint`     | non-negative integer, big-endian with no leading zeros; `0` is empty |
| `null` / `undefined`    | the empty byte string                                                |
| array                   | a list, whose items can be any `Input`, nested to any depth          |

Negative numbers, non-integers, and numbers above `Number.MAX_SAFE_INTEGER`
throw. Use a `bigint` for large values such as wei amounts.

> **Note:** `0` and `"0x00"` encode differently. `0` is the empty byte string
> (`0x80`), because RLP integers have no leading zeros. `"0x00"` is the
> single byte `0x00`. Pass integer fields such as nonces and values as
> numbers or bigints.

### `decode(input: Uint8Array | string): Decoded`

Decodes one item that spans all of `input`. `input` is bytes, or a hex
string with or without `0x`. The result is a
`Decoded = Uint8Array | Decoded[]` tree. Byte strings come back as fresh
`Uint8Array` copies, never views of the input.

RLP doesn't record whether bytes were an integer, an address, or text, so
you interpret them yourself. [`bytesToBigInt`](#helpers) and
[`bytesToHex`](#helpers) cover the common cases.

`decode` throws an `RlpError` if the input:

- ends early, or an item overruns the list that contains it
- has bytes left over after the first item (use `decodeFirst` for streams)
- is non-canonical: a single byte below `0x80` with a prefix, the long form
  used for a length of 55 or less, or a length with leading zeros

### `decodeFirst(input: Uint8Array | string): { decoded, remainder }`

Decodes the item at the start of `input` and returns the bytes after it.
Use it to read items that were written back to back:

```typescript
let rest = bytes;
while (rest.length > 0) {
  const { decoded, remainder } = decodeFirst(rest);
  handle(decoded);
  rest = remainder;
}
```

### `RlpError`

The error class for everything this package throws, both for values that
can't be encoded and for invalid RLP.

### Helpers

- `bytesToHex(bytes)`: returns a lowercase, `0x`-prefixed hex string
- `hexToBytes(hex)`: parses hex with or without `0x`
- `utf8ToBytes(text)`: encodes text as UTF-8. Unpaired surrogates become
  U+FFFD, as with `TextEncoder`
- `integerToBytes(n)`: returns the minimal big-endian bytes of a
  non-negative `number` or `bigint`
- `bytesToBigInt(bytes)`: reads big-endian bytes as a `bigint`. The empty
  byte string is `0n`

## Examples

### A legacy transaction

This is the example from [EIP-155][eip155]:

```typescript
import { encode, decode, bytesToHex, bytesToBigInt } from "@truffle/rlp";

const signed = encode([
  9, // nonce
  20000000000, // gas price
  21000, // gas limit
  "0x3535353535353535353535353535353535353535", // to
  BigInt("1000000000000000000"), // value (1 ether, in wei)
  "0x", // data
  37, // v
  "0x28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276", // r
  "0x67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83" // s
]);

bytesToHex(signed); // "0xf86c098504a817c8008252089435...3b6d83"

const [nonce, gasPrice, gasLimit, to, value] = decode(signed) as Uint8Array[];
bytesToBigInt(value); // 1000000000000000000n
bytesToHex(to); // "0x3535353535353535353535353535353535353535"
```

[eip155]: https://eips.ethereum.org/EIPS/eip-155#example

### A contract's address

`CREATE` puts a new contract at the last 20 bytes of
`keccak256(rlp([sender, nonce]))`. This package produces the RLP part;
Keccak comes from a hashing library such as
[`ethereum-cryptography`](https://github.com/ethereum/js-ethereum-cryptography):

```typescript
import { encode, bytesToHex } from "@truffle/rlp";
import { keccak256 } from "ethereum-cryptography/keccak";

const sender = "0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0";
const address = bytesToHex(keccak256(encode([sender, 0])).slice(12));
// "0xcd234a471b72ba2f1ccf0a70fcaba648a5eecd8d"
```
