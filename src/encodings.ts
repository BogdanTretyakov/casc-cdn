import { BLTEReader } from './blte';

function toHexString(bytes: Buffer): string {
  return bytes.toString('hex');
}

export interface EncodingEntry {
  cKey: string;
  eKeys: string[];
  fileSize: number;
}

export class EncodingTable {
  // Map of cKey -> Entry
  public readonly entries = new Map<string, EncodingEntry>();

  constructor(buffer: Buffer) {
    this.parse(buffer);
  }

  private parse(buffer: Buffer) {
    if (buffer.length < 22)
      throw new Error('Buffer too small for Encoding Table');

    // Read header (Big Endian as per TACT spec)
    const signature = buffer.toString('utf8', 0, 2);
    if (signature !== 'EN') throw new Error(`Invalid signature: ${signature}`);

    const version = buffer.readUInt8(2);
    const cKeyLength = buffer.readUInt8(3);
    const eKeyLength = buffer.readUInt8(4);
    const ceKeyPageSizeKB = buffer.readUInt16BE(5);
    const eKeySpecPageSizeKB = buffer.readUInt16BE(7);
    const ceKeyPageCount = buffer.readUInt32BE(9);
    const eKeySpecPageCount = buffer.readUInt32BE(13);
    const flags = buffer.readUInt8(17);
    const eSpecBlockSize = buffer.readUInt32BE(18);

    const headerSize = 22;
    const eSpecStart = headerSize;
    const eSpecEnd = eSpecStart + eSpecBlockSize;

    const ceKeyIndexStart = eSpecEnd;
    const ceKeyIndexSize = ceKeyPageCount * 32;

    const ceKeyPagesStart = ceKeyIndexStart + ceKeyIndexSize;

    let currentOffset = ceKeyPagesStart;
    let entriesRead = 0;

    for (let pageIdx = 0; pageIdx < ceKeyPageCount; pageIdx++) {
      if (currentOffset >= buffer.length) {
        break;
      }

      const pageStart = currentOffset;
      const pageMaxSize = ceKeyPageSizeKB * 1024;
      const pageEnd = Math.min(pageStart + pageMaxSize, buffer.length);

      // Parse entries in this page
      let cursor = pageStart;
      while (cursor < pageEnd) {
        if (cursor + 6 > buffer.length) break;

        const keyCount = buffer.readUInt8(cursor);
        if (keyCount === 0) break; // End of page (padding)

        cursor++;

        // Read file size (5 bytes, big-endian as per TACT spec)
        const fileSize = buffer.readUIntBE(cursor, 5);
        cursor += 5;

        // Read CKey
        if (cursor + cKeyLength > buffer.length) break;
        const cKey = buffer.toString('hex', cursor, cursor + cKeyLength);
        cursor += cKeyLength;

        // Read EKeys
        const eKeys: string[] = [];
        for (let i = 0; i < keyCount; i++) {
          if (cursor + eKeyLength > buffer.length) break;
          eKeys.push(buffer.toString('hex', cursor, cursor + eKeyLength));
          cursor += eKeyLength;
        }

        this.entries.set(cKey, { cKey, eKeys, fileSize });
        entriesRead++;
      }

      currentOffset = pageStart + pageMaxSize;
    }
  }

  // Lookup CKey -> EKeys
  getEKeys(cKey: string): string[] | undefined {
    const entry = this.entries.get(cKey);
    return entry?.eKeys;
  }

  // Get entry by CKey
  getEntry(cKey: string): EncodingEntry | undefined {
    return this.entries.get(cKey);
  }

  getCKeyByEKey(eKey: string) {
    return this.entries.values().find(({ eKeys }) => eKeys.includes(eKey));
  }
}

export async function parseEncodingTable(
  encodedBuffer: Buffer,
): Promise<EncodingTable> {
  const blte = new BLTEReader(encodedBuffer);
  const decodedBuffer = blte.getBlocksData();

  return new EncodingTable(decodedBuffer);
}
