/**
 * Thrown for input that cannot be encoded, and for bytes that are not
 * valid, canonical RLP.
 */
export class RlpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RlpError";
  }
}
