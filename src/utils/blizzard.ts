import http from 'http';
import type { CDNLine, VersionLine } from '../types/config';
import type { TactProduct } from '../types/tact';
import { CascCache } from './cache';

export const PATCH_URL = {
  us: 'http://us.patch.battle.net:1119',
  eu: 'http://eu.patch.battle.net:1119',
  cn: 'http://cn.patch.battle.net:1119',
  kr: 'http://kr.patch.battle.net:1119',
} as const;

export type CASC_REGION = keyof typeof PATCH_URL;

export class BlizzardAPI {
  constructor(
    private region: CASC_REGION,
    private product: TactProduct,
    private cache: CascCache,
  ) {}

  /**
   * Fetches and parses the CDN list for the product.
   *
   * Retrieves the list of available Content Delivery Network servers
   * from Blizzard's patch servers. Each CDN entry contains host URLs
   * and path information for downloading game data.
   *
   * @returns Array of CDN configurations available for this product and region
   * @throws {Error} If the HTTP request fails or response is invalid
   *
   * @example
   * ```typescript
   * const api = new BlizzardAPI('eu', TactProduct.WarcraftIII, cache);
   * const cdns = await api.getCDNs();
   * console.log(cdns[0].Hosts); // ['level3.blizzard.com', ...]
   * ```
   */
  async getCDNs(): Promise<CDNLine[]> {
    const text = await this.request(
      `${PATCH_URL[this.region]}/${this.product}/cdns`,
    );
    return this.parseCDNs(text);
  }

  /**
   * Fetches and parses the version information for the product.
   *
   * Retrieves version metadata including build IDs, build configs,
   * CDN configs, and version names for each region.
   *
   * @returns Array of version information for all regions
   * @throws {Error} If the HTTP request fails or response is invalid
   *
   * @example
   * ```typescript
   * const versions = await api.getVersions();
   * const usVersion = versions.find(v => v.Region === 'us');
   * console.log(usVersion.BuildId); // '12345'
   * ```
   */
  async getVersions(): Promise<VersionLine[]> {
    const text = await this.request(
      `${PATCH_URL[this.region]}/${this.product}/versions`,
    );
    return this.parseVersions(text);
  }

  /**
   * Fetches and parses a configuration file with caching.
   *
   * Downloads either a Build Config or CDN Config file from the CDN.
   * These config files contain critical metadata like:
   * - Build Config: encoding table hash, root file hash, install manifest
   * - CDN Config: archive list, archive group, patch archives
   *
   * Results are cached to avoid redundant downloads.
   *
   * @param host - CDN host to download from (e.g., 'level3.blizzard.com')
   * @param path - CDN path prefix (e.g., 'tpr/war3')
   * @param hash - Configuration file hash (from version info)
   * @returns Parsed configuration as key-value record
   * @throws {Error} If the HTTP request fails
   *
   * @example
   * ```typescript
   * const buildConfig = await api.getConfig(host, path, buildConfigHash);
   * console.log(buildConfig.encoding); // Encoding table hash
   * console.log(buildConfig.root); // Root file hash
   * ```
   */
  async getConfig(
    host: string,
    path: string,
    hash: string,
  ): Promise<Record<string, any>> {
    const cacheKey = `config_${hash}`;
    const cached = await this.cache.getDataFile(cacheKey);
    if (cached) {
      return this.parseConfig(cached.toString('utf8'));
    }

    const url = `http://${host}/${path}/config/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`;
    const text = await this.request(url);
    const config = this.parseConfig(text);

    await this.cache.putDataFile(cacheKey, Buffer.from(text, 'utf8'));

    return config;
  }

  /**
   * Fetches raw data files from the CDN with caching.
   *
   * Downloads binary data files such as:
   * - Encoding tables (BLTE-compressed)
   * - Root files (BLTE-compressed)
   * - Archive files (.data)
   * - Archive index files (.index)
   *
   * All downloads are cached to improve performance on subsequent requests.
   * The cache key includes the file hash and optional '.index' suffix.
   *
   * @param host - CDN host to download from
   * @param path - CDN path prefix
   * @param hash - File hash (content key or encoded key)
   * @param index - If true, appends '.index' to the filename and cache key
   * @returns Raw file buffer (may be BLTE-compressed)
   * @throws {Error} If the HTTP request fails
   *
   * @example
   * ```typescript
   * // Download encoding table
   * const encodingData = await api.getData(host, path, encodingHash, false);
   *
   * // Download archive index
   * const indexData = await api.getData(host, path, archiveHash, true);
   * ```
   */
  async getData(
    host: string,
    path: string,
    hash: string,
    index = false,
  ): Promise<Buffer> {
    const cached = await this.cache.getDataFile(hash + (index ? '.index' : ''));
    if (cached) {
      return cached;
    }

    const url = `http://${host}/${path}/data/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}${index ? '.index' : ''}`;
    const data = await this.requestBuffer(url);

    await this.cache.putDataFile(hash + (index ? '.index' : ''), data);

    return data;
  }

  // Private HTTP methods

  private request(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      http
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Request to ${url} failed with status: ${res.statusCode}`,
              ),
            );
            res.resume();
            return;
          }
          const data: Buffer[] = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
          res.on('error', reject);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  private requestBuffer(
    url: string,
    range?: { offset: number; size: number },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const options: any = {};
      if (range) {
        options.headers = {
          Range: `bytes=${range.offset}-${range.offset + range.size - 1}`,
        };
      }

      http
        .get(url, options, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            reject(
              new Error(
                `Request to ${url} failed with status: ${res.statusCode}`,
              ),
            );
            res.resume();
            return;
          }
          const data: Buffer[] = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data)));
          res.on('error', reject);
        })
        .on('error', reject);
    });
  }

  // Private parsing methods

  private parseCDNs(text: string): CDNLine[] {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '' && !l.startsWith('#'));
    if (lines.length === 0) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];
    const headers = headerLine.split('|').map((h) => h.trim().split('!')[0]);

    const nameIndex = headers.indexOf('Name');
    const pathIndex = headers.indexOf('Path');
    const hostsIndex = headers.indexOf('Hosts');
    const serversIndex = headers.indexOf('Servers');
    const configPathIndex = headers.indexOf('ConfigPath');

    const distinctHostIndex = hostsIndex !== -1 ? hostsIndex : serversIndex;

    const results: CDNLine[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < headers.length) continue;

      results.push({
        Name: parts[nameIndex]?.trim() ?? '',
        Path: parts[pathIndex]?.trim() ?? '',
        Hosts:
          parts[distinctHostIndex]
            ?.trim()
            .split(' ')
            .filter((h) => h) ?? [],
        Servers:
          parts[distinctHostIndex]
            ?.trim()
            .split(' ')
            .filter((h) => h) ?? [],
        ConfigPath: parts[configPathIndex]?.trim() ?? '',
      });
    }
    return results;
  }

  private parseVersions(text: string): VersionLine[] {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '' && !l.startsWith('#'));
    if (lines.length === 0) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];
    const headers = headerLine.split('|').map((h) => h.trim().split('!')[0]);

    const results: VersionLine[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < headers.length) continue;

      const obj: any = {};
      headers.forEach((h, idx) => {
        const part = parts[idx];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (h !== undefined) {
          obj[h] = part?.trim() ?? '';
        }
      });
      results.push(obj as VersionLine);
    }
    return results;
  }

  private parseConfig(text: string): Record<string, any> {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '' && !l.startsWith('#'));
    const config: Record<string, any> = {};

    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;

      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();

      if (
        key === 'archives' ||
        key === 'patch-archives' ||
        key === 'builds' ||
        key === 'encoding-size'
      ) {
        config[key] = value.split(' ').filter((v) => v);
      } else {
        config[key] = value;
      }
    }

    return config;
  }
}
