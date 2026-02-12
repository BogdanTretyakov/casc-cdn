// Root file parser for TACT MFST format
// Based on: https://wowdev.wiki/TACT#Root

import { LocaleFlags } from './types/tact';
import { BufferReader } from './utils/buffer';

interface Locale {
  enUS: boolean;
  koKR: boolean;
  frFR: boolean;
  deDE: boolean;
  zhCN: boolean;
  esES: boolean;
  zhTW: boolean;
  enGB: boolean;
  enCN: boolean;
  enTW: boolean;
  esMX: boolean;
  ruRU: boolean;
  ptBR: boolean;
  itIT: boolean;
  ptPT: boolean;
  plPL: boolean;
}

export interface RootEntry {
  fileDataId: number;
  contentKey: string; // MD5 hash (CKey)
  nameHash?: bigint; // Jenkins96 hash (optional)
  localeFlags: Locale;
  contentFlags: number;
  _normalizedPath?: string; // Normalized lowercase path for searching
  _scopes?: string[]; // Scope components (e.g., ['War3.w3mod', 'Abilities', 'Spells'])
}

export class RootFile {
  public readonly entries = new Array<RootEntry>();

  private totalFileCount: number = 0;
  private namedFileCount: number = 0;

  constructor(buffer: Buffer) {
    this.parse(buffer);
  }

  private parse(buffer: Buffer) {
    let offset = 0;

    const magic = buffer.toString('utf8', offset, offset + 4);
    offset += 4;

    if (magic === 'MFST') {
      this.parseMFST(buffer, offset);
    } else if (magic === 'War3') {
      this.parseWar3(buffer, offset);
    } else {
      throw new Error('Not implemented format');
    }
  }

  private parseWar3(buffer: Buffer, startOffset: number) {
    const text = buffer.toString('utf8', startOffset);
    const lines = text.split('\r\n').filter((line) => line.trim().length > 0);

    let parsed = 0;
    let skipped = 0;

    for (const line of lines) {
      try {
        // Split file info by pipe
        const parts = line.split('|');
        if (parts.length < 2) {
          skipped++;
          continue;
        }

        const filePath = parts[0] || '';
        const eKey = parts[1];
        const locale = parts[2] || '';

        if (!eKey) throw new Error('Error while getting eKey');

        // Store in entriesByHash using path as key
        // We don't have fileDataId for WC3, so we use a hash of the path
        const pathHash = this.hashString(filePath);

        const scopes = filePath.split(':');
        scopes.pop();

        const entry: RootEntry = {
          fileDataId: pathHash,
          contentKey: eKey,
          nameHash: BigInt('0x' + this.hashString(filePath).toString(16)),
          localeFlags: this.getLocales(locale),
          contentFlags: 0,
          _normalizedPath: filePath.toLowerCase(),
          _scopes: scopes,
        };

        this.entries.push(entry);
        parsed++;
      } catch (e) {
        skipped++;
      }
    }
  }

  // Simple string hash function for WC3 paths
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private parseMFST(buffer: Buffer, startOffset: number) {
    const reader = new BufferReader(buffer);
    reader.seek(startOffset);

    let headerSize = 0;
    let version = 1;

    const possibleHeaderSize = reader.uint32le();
    if (possibleHeaderSize >= 12 && possibleHeaderSize <= 100) {
      headerSize = possibleHeaderSize;
      version = reader.uint32le();
    } else {
      reader.seek(startOffset);
    }

    this.totalFileCount = reader.uint32le();
    this.namedFileCount = reader.uint32le();

    if (headerSize > 0) {
      reader.skip(4);
    }

    const allowNonNamedFiles = this.totalFileCount !== this.namedFileCount;

    let blockIndex = 0;
    while (!reader.eof()) {
      try {
        this.parseBlock(reader, version, allowNonNamedFiles, blockIndex);
        blockIndex++;
      } catch (e) {
        break;
      }
    }
  }

  private parseBlock(
    reader: BufferReader,
    version: number,
    allowNonNamedFiles: boolean,
    blockIndex: number,
  ): void {
    if (reader.remaining < 8) {
      throw new Error('Insufficient data for block header');
    }

    const numRecords = reader.uint32le();

    let locale: number;
    let contentFlags: number;

    if (version === 2) {
      locale = reader.uint32le();
      const unk1 = reader.uint32le();
      const unk2 = reader.uint32le();
      const unk3 = reader.uint8();
      contentFlags = unk1 | unk2 | (unk3 << 17);
    } else {
      contentFlags = reader.uint32le();
      locale = reader.uint32le();
    }

    // Read fileDataID deltas
    const fileDataIdDeltas: number[] = [];
    for (let i = 0; i < numRecords; i++) {
      fileDataIdDeltas.push(reader.int32le());
    }

    // Read content keys (MD5 hashes)
    const contentKeys: string[] = [];
    for (let i = 0; i < numRecords; i++) {
      contentKeys.push(reader.string(16, 'hex'));
    }

    // Read name hashes (if present)
    const nameHashes: bigint[] = [];
    const hasNameHashes = !(allowNonNamedFiles && contentFlags & 0x10000000); // NoNameHash flag

    if (hasNameHashes) {
      for (let i = 0; i < numRecords; i++) {
        nameHashes.push(reader.uint64le());
      }
    }

    // Calculate fileDataIDs and store entries
    let currentFileDataId = 0;
    for (let i = 0; i < numRecords; i++) {
      const delta = fileDataIdDeltas[i];
      if (delta === undefined) throw new Error('No file delta found');
      if (i === 0) {
        currentFileDataId = delta;
      } else {
        currentFileDataId = currentFileDataId + 1 + delta;
      }

      const entry: RootEntry = {
        fileDataId: currentFileDataId,
        contentKey: contentKeys[i]!,
        nameHash: hasNameHashes ? nameHashes[i] : undefined,
        localeFlags: this.getLocales(locale), // MFST: enum value
        contentFlags,
        _normalizedPath: undefined, // MFST doesn't have paths, only fileDataIds
        _scopes: undefined,
      };

      this.entries.push(entry);
    }
  }

  // Get entry by name hash
  public getEntryByCKey(cKey: string) {
    return this.entries.find(({ contentKey }) => contentKey === cKey);
  }

  public getEntryByPath(path: string) {
    const normalizedPath = path.toLowerCase().replace(/\\+/, '/');
    return this.entries.filter(({ _normalizedPath }) =>
      _normalizedPath?.includes(normalizedPath),
    );
  }

  private getLocales(localeFlag: number | string): Locale {
    const locale: Locale = {
      enUS: false,
      koKR: false,
      frFR: false,
      deDE: false,
      zhCN: false,
      esES: false,
      zhTW: false,
      enGB: false,
      enCN: false,
      enTW: false,
      esMX: false,
      ruRU: false,
      ptBR: false,
      itIT: false,
      ptPT: false,
      plPL: false,
    };

    if (typeof localeFlag === 'string') {
      const prepared = localeFlag.replace(/-\s_/, '') as keyof Locale;
      if (prepared in locale) {
        locale[prepared] = true;
      }
      return locale;
    }

    if (localeFlag & LocaleFlags.enUS) {
      locale.enUS = true;
    }
    if (localeFlag & LocaleFlags.koKR) {
      locale.koKR = true;
    }
    if (localeFlag & LocaleFlags.frFR) {
      locale.frFR = true;
    }
    if (localeFlag & LocaleFlags.deDE) {
      locale.deDE = true;
    }
    if (localeFlag & LocaleFlags.zhCN) {
      locale.zhCN = true;
    }
    if (localeFlag & LocaleFlags.esES) {
      locale.esES = true;
    }
    if (localeFlag & LocaleFlags.zhTW) {
      locale.zhTW = true;
    }
    if (localeFlag & LocaleFlags.enGB) {
      locale.enGB = true;
    }
    if (localeFlag & LocaleFlags.enCN) {
      locale.enCN = true;
    }
    if (localeFlag & LocaleFlags.enTW) {
      locale.enTW = true;
    }
    if (localeFlag & LocaleFlags.esMX) {
      locale.esMX = true;
    }
    if (localeFlag & LocaleFlags.ruRU) {
      locale.ruRU = true;
    }
    if (localeFlag & LocaleFlags.ptBR) {
      locale.ptBR = true;
    }
    if (localeFlag & LocaleFlags.itIT) {
      locale.itIT = true;
    }
    if (localeFlag & LocaleFlags.ptPT) {
      locale.ptPT = true;
    }

    return locale;
  }
}
