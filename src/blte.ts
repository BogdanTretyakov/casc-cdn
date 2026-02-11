import zlib from 'zlib';
import lz4 from 'lz4';
import { BufferReader } from './utils/buffer';

interface BLTEBlock {
  compressedSize: number;
  decompressedSize: number;
  hash: string;
  uncompressedHash?: string;
}

export class BLTEReader {
  private buffer: BufferReader;
  private blocksCount = 0;
  private headerSize = 0;
  readonly blocks = Array<BLTEBlock>();

  constructor(buffer: Buffer) {
    this.buffer = new BufferReader(buffer);
    this.parseHeader();
  }

  private parseHeader(): void {
    const signature = this.buffer.string(4);

    if (signature !== 'BLTE') {
      throw new Error(`Invalid BLTE signature: ${signature}`);
    }
    this.headerSize = this.buffer.uint32be();
    if (this.headerSize === 0) {
      throw new Error('Invalid BLTE header size');
    }
    const format = this.buffer.uint8();
    if (format !== 0xf && format !== 0x10) {
      throw new Error(`Invalid BLTE format: ${format}`);
    }
    this.blocksCount = this.buffer.uint24be();
    if (this.blocksCount === 0) {
      throw new Error('Invalid BLTE blocks count');
    }

    for (let i = 0; i < this.blocksCount; i++) {
      this.parseHeaderBlock(format);
    }
  }

  private parseHeaderBlock(format: number): void {
    const blocks: BLTEBlock = {
      compressedSize: this.buffer.uint32be(),
      decompressedSize: this.buffer.uint32be(),
      hash: this.buffer.string(16, 'hex'),
    };
    if (format === 0x10) {
      blocks.uncompressedHash = this.buffer.string(16, 'hex');
    }
    this.blocks.push(blocks);
  }

  private calcBlockOffset(block: BLTEBlock): number {
    const idx = this.blocks.indexOf(block);
    if (idx === -1) {
      throw new Error(`Block not found`);
    }
    const prevBlocks = this.blocks.slice(0, idx);
    return prevBlocks.reduce(
      (acc, block) => acc + block.compressedSize,
      this.headerSize,
    );
  }

  getBlocksData(): Buffer {
    let resultBuffer = Buffer.from([]);

    for (let i = 0; i < this.blocks.length; i++) {
      const data = this.getBlockData(i);
      resultBuffer = Buffer.concat([resultBuffer, data]);
    }

    return resultBuffer;
  }

  getBlockData(index: number): Buffer;
  getBlockData(hash: string): Buffer;
  getBlockData(arg: number | string): Buffer {
    let block: BLTEBlock | undefined;
    if (typeof arg === 'number') {
      block = this.blocks[arg];
    } else if (typeof arg === 'string') {
      block = this.blocks.find((b) => b.hash === arg);
    } else {
      block = arg;
    }

    if (!block) {
      throw new Error(`Block not found`);
    }

    const offset = this.calcBlockOffset(block);
    this.buffer.seek(offset);
    const encoding = this.buffer.string(1);
    const data = this.buffer.raw(block.compressedSize - 1);
    switch (encoding) {
      case 'N': {
        return data;
      }
      case 'Z': {
        return this.processZlibBlock(data);
      }
      case '4': {
        return this.processLz4Block(data);
      }
      case 'F': {
        const blte = new BLTEReader(data);
        return blte.getBlocksData();
      }
      case 'E': {
        return this.processEncryptedBlock(data);
      }
      default:
        throw new Error(`Unknown encoding: ${encoding}`);
    }
  }

  private processZlibBlock(data: Buffer) {
    const reader = new BufferReader(data);
    // Requested by zlib itself
    // const compInfo = reader.bits(4);
    // const compMethod = reader.bits(4);
    // const fLevel = reader.bits(2);
    // const fDict = reader.bits(1);
    // const fCheck = reader.bits(5);

    return zlib.unzipSync(reader.raw());
  }

  private processLz4Block(data: Buffer) {
    const reader = new BufferReader(data);
    const version = reader.uint8();
    if (version !== 1) {
      throw new Error(`Unknown LZ4 version: ${version}`);
    }
    const size = reader.uint64be();
    const blockShift = reader.uint8();

    return lz4.decode(reader.raw());
  }

  private processEncryptedBlock(data: Buffer): Buffer {
    throw new Error(`Not implemented`);
  }
}
