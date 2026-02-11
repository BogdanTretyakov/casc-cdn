import { BlizzardAPI, type CASC_REGION } from './utils/blizzard';
import {
  type CDNLine,
  type VersionLine,
  type BuildConfig,
  type CDNConfig,
} from './types/config';
import { BLTEReader } from './blte';
import { parseEncodingTable, type EncodingTable } from './encodings';
import { parseIndexEntry, type IndexEntry } from './indices';
import { TactProduct } from './types/tact';
import { RootFile, type RootEntry } from './root';
import { CascCache } from './utils/cache';
import { isNotNil } from './utils/guards';

export class CascClient {
  private cdnList: CDNLine[] = [];
  private versions: VersionLine[] = [];

  private buildConfig!: BuildConfig;
  private cdnConfig!: CDNConfig;

  private encodingTable!: EncodingTable;

  private indices = new Map<string, IndexEntry>();

  private cdn!: CDNLine;
  private rootFile!: RootFile;
  private constructor(
    public readonly product: TactProduct,
    public readonly region: CASC_REGION,
    public readonly api: BlizzardAPI,
  ) {}

  /**
   * Initializes a new CASC client instance.
   *
   * This method performs the following steps:
   * 1. Fetches CDN list and selects appropriate CDN for the region
   * 2. Fetches version information for the product
   * 3. Downloads and parses build and CDN configuration files
   * 4. Loads encoding table (maps content keys to encoded keys)
   * 5. Loads all archive indices for file lookup
   * 6. Loads and parses the root file (file path to content key mapping)
   *
   * @param product - The TACT product to connect to (e.g., WarcraftIII, WorldOfWarcraft)
   * @param region - The region to connect to (e.g., 'us', 'eu', 'kr')
   * @param cache - Optional custom cache implementation. If not provided, uses default CascCache
   * @returns A fully initialized CascClient instance ready to fetch files
   * @throws {Error} If CDN, version, or encoding table cannot be loaded
   *
   * @example
   * ```typescript
   * const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');
   * ```
   */
  public static async init(
    product: TactProduct,
    region: CASC_REGION,
    cache?: CascCache,
  ): Promise<CascClient> {
    const api = new BlizzardAPI(region, product, cache || new CascCache());
    const client = new CascClient(product, region, api);

    // 1. Fetch CDN list
    client.cdnList = await client.api.getCDNs();

    // 2. Select CDN
    const cdnEntry =
      client.cdnList.find((c) => c.Name === region) ||
      client.cdnList.find((c) => c.Name === 'eu') ||
      client.cdnList[0];

    if (!cdnEntry) {
      throw new Error(`No CDN found for product ${product}`);
    }

    client.cdn = cdnEntry;

    // 3. Fetch Versions
    client.versions = await client.api.getVersions();

    // 4. Select Version
    const versionEntry = client.versions.find((v) => v.Region === region);
    if (!versionEntry) {
      throw new Error(`No version found for region ${region}`);
    }

    // 5. Fetch Configs
    const buildConfigHash = versionEntry.BuildConfig;
    const cdnConfigHash = versionEntry.CDNConfig;

    const buildConfigRaw = await client.api.getConfig(
      client.cdn.Hosts[0]!,
      client.cdn.Path,
      buildConfigHash,
    );
    const cdnConfigRaw = await client.api.getConfig(
      client.cdn.Hosts[0]!,
      client.cdn.Path,
      cdnConfigHash,
    );

    client.buildConfig = buildConfigRaw as unknown as BuildConfig;
    client.cdnConfig = cdnConfigRaw as unknown as CDNConfig;

    const encodingField = client.buildConfig.encoding;
    const encodingKeys =
      typeof encodingField === 'string' ? encodingField.split(' ') : [];

    const encodingFileHash =
      encodingKeys.length > 1 ? encodingKeys[1] : encodingKeys[0];

    if (!encodingFileHash) {
      throw new Error('No encoding file hash found');
    }

    const encodingBuffer = await client.api.getData(
      client.cdn.Hosts[0]!,
      client.cdn.Path!,
      encodingFileHash,
    );
    client.encodingTable = await parseEncodingTable(encodingBuffer);

    await client.loadArchives();

    if (client.buildConfig.root) {
      const rootBuffer = await client.getEKeyFileByCKey(
        client.buildConfig.root,
      );

      if (!rootBuffer) {
        throw new Error('Error while getting root file');
      }

      client.rootFile = new RootFile(
        new BLTEReader(rootBuffer).getBlocksData(),
      );
    }

    return client;
  }

  /**
   * Searches for root file entries by file path.
   *
   * Performs a case-insensitive partial match search on file paths.
   * The search normalizes both the input path and stored paths by:
   * - Converting to lowercase
   * - Replacing backslashes with forward slashes
   *
   * @param {string} path - The file path to search for (can be partial). Case-insensitive.
   * @returns {RootEntry[]} Array of matching root entries. Empty array if no matches found.
   *
   * @example
   * ```typescript
   * // Find all entries containing "units"
   * const entries = client.getEntryByPath('units');
   *
   * // Find specific file (case-insensitive)
   * const txtFiles = client.getEntryByPath('ItemFunc.txt');
   * ```
   */
  get getEntryByPath() {
    return this.rootFile.getEntryByPath.bind(this.rootFile);
  }

  private async loadArchives() {
    if (!this.cdnConfig) return;

    const archives = this.cdnConfig.archives;
    if (!archives) return;

    const batchSize = 10;
    for (let i = 0; i < archives.length; i += batchSize) {
      const batch = archives.slice(i, i + batchSize);
      await Promise.all(batch.map((hash) => this.loadArchiveIndex(hash)));
    }
  }

  private async loadArchiveIndex(hash: string) {
    if (!this.cdnList.length) return;
    const cdn =
      this.cdnList.find((c) => c.Name === this.region) || this.cdnList[0];

    if (!cdn || !cdn.Hosts[0] || !cdn.Path) {
      return;
    }

    try {
      const buffer = await this.api.getData(cdn.Hosts[0], cdn.Path, hash, true);

      const entries = parseIndexEntry(buffer, hash, 'archive');

      entries.forEach((entry) => {
        this.indices.set(entry.eKey, entry);
      });
    } catch (e) {
      // Index loading failed
    }
  }

  /**
   * Downloads and decodes a single file by its content key (CKey).
   *
   * The method:
   * 1. Looks up the encoded key(s) for the given content key in the encoding table
   * 2. Finds the file location in the archive indices
   * 3. Downloads the archive chunk containing the file
   * 4. Decodes the BLTE-compressed data
   *
   * @param cKey - The content key (hash) of the file to retrieve
   * @returns The decoded file buffer, or null if the file cannot be found
   * @throws {Error} If the archive data cannot be downloaded
   *
   * @example
   * ```typescript
   * const entries = client.getEntryByPath('itemfunc.txt');
   * const fileData = await client.getFile(entries[0].contentKey);
   * console.log(fileData.toString('utf8'));
   * ```
   */
  public async getFile(cKey: string): Promise<Buffer | null> {
    const eKeys = this.getEKeyByCKey(cKey);
    for (const eKey of eKeys) {
      const loc = this.getLocation(eKey);
      if (!loc) continue;

      const buffer = await this.fetchDirectFromCDN(loc.archiveHash);

      if (!buffer) {
        throw new Error(`Error getting data block for ${cKey}`);
      }

      const data = new BLTEReader(
        buffer.subarray(loc.offset, loc.offset + loc.size),
      ).getBlocksData();

      return data;
    }

    return null;
  }

  /**
   * Downloads and decodes multiple files by their content keys (CKeys).
   *
   * This method is optimized for batch downloads:
   * - Groups files by archive to minimize HTTP requests
   * - Downloads each archive only once even if it contains multiple requested files
   * - Supports both Promise-based and callback-based usage
   *
   * @param cKeys - Array of content keys to download
   * @returns Promise that resolves to a record mapping cKeys to their decoded buffers
   *
   * @example
   * ```typescript
   * const files = await client.getFiles(['ckey1', 'ckey2', 'ckey3']);
   * console.log(files['ckey1'].toString('utf8'));
   * ```
   */
  public getFiles(cKeys: string[]): Promise<Record<string, Buffer>>;

  /**
   * Downloads and decodes multiple files with a callback for each file.
   *
   * Use this overload when you want to process files as they're downloaded
   * rather than waiting for all files to complete.
   *
   * @param cKeys - Array of content keys to download
   * @param cb - Callback function called for each successfully downloaded file
   *
   * @example
   * ```typescript
   * client.getFiles(['ckey1', 'ckey2'], (cKey, data) => {
   *   console.log(`Downloaded ${cKey}: ${data.length} bytes`);
   * });
   * ```
   */
  public getFiles(
    cKeys: string[],
    cb: (cKey: string, data: Buffer) => void,
  ): void;
  public async getFiles(
    cKeys: string[],
    cb?: (cKey: string, data: Buffer) => void,
  ): Promise<void | Record<string, Buffer>> {
    const promiseOutput = Array<Promise<[string, Buffer]>>();

    // Map to track cKey -> eKey for callback
    const eKeyToCKey = new Map<string, string>();

    const locations = cKeys
      .flatMap((cKey) => {
        const eKeys = this.getEKeyByCKey(cKey);
        // Track all eKeys for this cKey
        eKeys.forEach((eKey) => eKeyToCKey.set(eKey, cKey));
        return eKeys;
      })
      .map((eKey) => this.getLocation(eKey))
      .filter(isNotNil)
      .reduce(
        (acc, loc) => {
          if (!acc[loc.archiveHash]) {
            acc[loc.archiveHash] = [];
          }
          acc[loc.archiveHash]!.push(loc);
          return acc;
        },
        {} as Record<string, IndexEntry[]>,
      );

    for (const [archiveHash, locs] of Object.entries(locations)) {
      const buffer = await this.fetchDirectFromCDN(archiveHash);
      if (!buffer) {
        throw new Error(`Error getting data block for ${archiveHash}`);
      }
      for (const loc of locs) {
        const data = new BLTEReader(
          buffer.subarray(loc.offset, loc.offset + loc.size),
        ).getBlocksData();

        const originalCKey = eKeyToCKey.get(loc.eKey) || loc.eKey;

        if (cb) {
          cb(originalCKey, data);
        } else {
          promiseOutput.push(Promise.resolve([originalCKey, data]));
        }
      }
    }

    if (cb) return;

    return Promise.all(promiseOutput).then((results) => {
      return Object.fromEntries(results);
    });
  }

  private getLocation(eKey: string) {
    const entry = this.indices.get(eKey);
    return entry;
  }

  private getEKeyByCKey(cKey: string) {
    if (!this.encodingTable) throw new Error('Encoding Table not loaded');

    const entry = this.encodingTable.entries.get(cKey);
    if (entry) {
      return entry.eKeys;
    }
    return [cKey];
  }

  private async getEKeyFileByCKey(cKey: string) {
    const eKeys = this.getEKeyByCKey(cKey);

    for (const eKey of eKeys) {
      try {
        const buffer = await this.fetchDirectFromCDN(eKey);
        if (buffer) {
          return buffer;
        }
      } catch (e) {
        // Direct CDN download failed
      }
    }

    return null;
  }

  private async fetchDirectFromCDN(eKey: string): Promise<Buffer | null> {
    try {
      const buffer = await this.api.getData(
        this.cdn.Hosts[0]!,
        this.cdn.Path,
        eKey,
        false,
      );
      return buffer;
    } catch (e: any) {
      return null;
    }
  }
}
