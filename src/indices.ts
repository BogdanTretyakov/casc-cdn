import { BufferReader } from './utils/buffer.js';

type IndexSource = 'archive' | 'patch';

export interface IndexEntry {
  eKey: string;
  size: number;
  offset: number;
  archiveHash: string;
  source: IndexSource;
}

export function parseIndexEntry(
  buffer: Buffer,
  archiveHash: string,
  source: IndexSource,
) {
  const output = Array<IndexEntry>();
  const pageSize = 4096;
  const isPageAligned = buffer.length % pageSize === 0;

  // Cutting off footer block
  if (!isPageAligned) {
    const pagesCount = Math.ceil(buffer.length / pageSize);
    buffer = buffer.subarray(0, (pagesCount - 1) * pageSize);
  }

  const reader = new BufferReader(buffer);

  while (!reader.eof()) {
    try {
      const entry: IndexEntry = {
        eKey: reader.string(16, 'hex'),
        size: reader.uint32be(),
        offset: reader.uint32be(),
        archiveHash,
        source,
      };

      if (entry.size < 0 || entry.size > 2 * 1024 * 1024) {
        throw new Error('Invalid index entry size');
      }

      output.push(entry);
    } catch (e) {
      if (e instanceof RangeError) {
        break;
      }
    }
  }

  return output;
}
