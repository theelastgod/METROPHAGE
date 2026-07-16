"use strict";

const MAX_BYTES = 1_048_576;

function asBuffer(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError("expected Buffer or Uint8Array");
  }
  if (value.byteLength > MAX_BYTES) throw new RangeError("buffer is too large");
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function checkedWidth(width) {
  if (!Number.isSafeInteger(width) || width < 0 || width > MAX_BYTES) {
    throw new RangeError("width must be a safe integer between 0 and 1048576");
  }
  return width;
}

function checkedBigInt(value) {
  if (typeof value !== "bigint") throw new TypeError("expected bigint");
  if (value < 0n) throw new RangeError("negative bigint is not supported");
  return value;
}

function toBigIntBE(value) {
  const buf = asBuffer(value);
  if (buf.length === 0) return 0n;
  return BigInt(`0x${buf.toString("hex")}`);
}

function toBigIntLE(value) {
  const buf = Buffer.from(asBuffer(value));
  buf.reverse();
  return toBigIntBE(buf);
}

function toBufferBE(value, requestedWidth) {
  const num = checkedBigInt(value);
  const width = checkedWidth(requestedWidth);
  if (width === 0) return Buffer.alloc(0);
  let hex = num.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const raw = Buffer.from(hex, "hex");
  if (raw.length > width) throw new RangeError("bigint does not fit requested width");
  const out = Buffer.alloc(width);
  raw.copy(out, width - raw.length);
  return out;
}

function toBufferLE(value, width) {
  return Buffer.from(toBufferBE(value, width)).reverse();
}

module.exports = { toBigIntLE, toBigIntBE, toBufferLE, toBufferBE };
