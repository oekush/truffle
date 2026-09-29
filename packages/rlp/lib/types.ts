/**
 * A value that can be RLP-encoded.
 *
 * - `Uint8Array` (including Node's `Buffer`): encoded as-is
 * - `string`: if it starts with `0x`, it is read as hex; otherwise it is
 *   encoded as UTF-8
 * - `number` / `bigint`: a non-negative integer, encoded big-endian with no
 *   leading zero bytes (so `0` encodes the same as the empty byte string)
 * - `null` / `undefined`: the empty byte string
 * - an array: a list, whose elements may themselves be any `Input`
 */
export type Input =
  | Uint8Array
  | string
  | number
  | bigint
  | null
  | undefined
  | readonly Input[];

/**
 * The result of decoding RLP: RLP only knows byte strings and lists, so
 * interpreting the bytes (as integers, addresses, text, ...) is up to you.
 */
export type Decoded = Uint8Array | Decoded[];
