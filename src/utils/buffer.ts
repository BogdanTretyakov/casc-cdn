export class BufferReader {
  private offset = 0;
  private bitOffset = 0;

  constructor(private readonly buf: Buffer) {}

  get position(): number {
    return this.offset;
  }

  get length(): number {
    return this.buf.length;
  }

  private ensureAvailable(bytes: number): void {
    if (this.offset + bytes > this.buf.length) {
      throw new RangeError(
        `BufferReader out of range: need ${bytes} bytes, ` +
          `but only ${this.buf.length - this.offset} available`,
      );
    }
  }

  private alignToByte(): void {
    if (this.bitOffset !== 0) {
      this.bitOffset = 0;
      this.offset++;
    }
  }

  seek(position: number): void {
    if (position < 0 || position > this.buf.length) {
      throw new RangeError(`seek out of bounds: ${position}`);
    }
    this.offset = position;
    this.bitOffset = 0;
  }

  skip(bytes: number): void {
    this.seek(this.offset + bytes);
  }

  uint8(): number {
    this.alignToByte();
    this.ensureAvailable(1);
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  uint16be(): number {
    this.alignToByte();
    this.ensureAvailable(2);
    const v = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  uint24be(): number {
    this.alignToByte();
    this.ensureAvailable(3);
    const b0 = this.uint8();
    const b1 = this.uint8();
    const b2 = this.uint8();
    return (b0 << 16) | (b1 << 8) | b2;
  }

  uint32be(): number {
    this.alignToByte();
    this.ensureAvailable(4);
    const v = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  uint64be(): bigint {
    this.alignToByte();
    this.ensureAvailable(8);
    const v = this.buf.readBigUInt64BE(this.offset);
    this.offset += 8;
    return v;
  }

  uint16le(): number {
    this.alignToByte();
    this.ensureAvailable(2);
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  uint32le(): number {
    this.alignToByte();
    this.ensureAvailable(4);
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  int32le(): number {
    this.alignToByte();
    this.ensureAvailable(4);
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  uint64le(): bigint {
    this.alignToByte();
    this.ensureAvailable(8);
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  string(length: number, encoding: BufferEncoding = 'utf8'): string {
    this.alignToByte();
    this.ensureAvailable(length);
    const v = this.buf.toString(encoding, this.offset, this.offset + length);
    this.offset += length;
    return v;
  }

  raw(length?: number): Buffer {
    if (length === undefined) {
      length = this.remaining;
    }
    this.alignToByte();
    this.ensureAvailable(length);
    const v = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return v;
  }

  reader(length?: number): BufferReader {
    return new BufferReader(this.raw(length));
  }

  bits(count: number): number {
    if (count <= 0 || count > 32) {
      throw new RangeError(`bits count must be between 1 and 32, got ${count}`);
    }

    let result = 0;

    for (let i = 0; i < count; i++) {
      this.ensureAvailable(1);

      const byte = this.buf[this.offset]!;
      const bit = (byte >> (7 - this.bitOffset)) & 1;

      result = (result << 1) | bit;

      this.bitOffset++;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.offset++;
      }
    }

    return result;
  }

  eof(): boolean {
    return this.offset >= this.buf.length;
  }

  get remaining(): number {
    return this.buf.length - this.offset;
  }
}
