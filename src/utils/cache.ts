import fs from 'fs/promises';
import path from 'path';

const DEFAULT_CACHE_DIR = path.resolve(
  process.cwd(),
  'node_modules',
  '.cache',
  'casc-cdn',
);

/**
 * File-based cache for CASC data.
 *
 * Provides persistent caching of downloaded CASC files to improve performance
 * and reduce network requests. All cached files are stored in the filesystem
 * under the configured cache directory.
 *
 * @example
 * ```typescript
 * // Use default cache location (node_modules/.cache/casc-cdn)
 * const cache = new CascCache();
 *
 * // Use custom cache directory
 * const customCache = new CascCache('/path/to/cache');
 * ```
 */
export class CascCache {
  constructor(private cacheDir = DEFAULT_CACHE_DIR) {}

  private async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (e) {
      // Ignore error if exists
    }
  }

  private async get(key: string): Promise<Buffer | null> {
    try {
      const filePath = path.join(this.cacheDir, key);
      // basic check to ensure we don't escape cache dir
      if (!filePath.startsWith(this.cacheDir)) return null;

      return await fs.readFile(filePath);
    } catch (e) {
      return null;
    }
  }

  private async put(key: string, data: Buffer): Promise<void> {
    try {
      await this.init();
      const filePath = path.join(this.cacheDir, key);
      if (!filePath.startsWith(this.cacheDir)) return;

      await fs.writeFile(filePath, data);
    } catch (e) {
      console.error(`[Cache] Failed to write ${key}:`, e);
    }
  }

  /**
   * Retrieves a cached data file.
   *
   * Data files include:
   * - Configuration files (build config, CDN config)
   * - Encoding tables
   * - Archive files and indices
   * - Any other CASC data
   *
   * All data files are cached with a 'data_' prefix.
   *
   * @param cKey - Content key, encoded key, or cache key of the file
   * @returns Cached file buffer, or null if not found in cache
   *
   * @example
   * ```typescript
   * const encodingTable = await cache.getDataFile('config_abc123');
   * const archiveIndex = await cache.getDataFile('def456.index');
   * ```
   */
  public async getDataFile(cKey: string): Promise<Buffer | null> {
    return await this.get(`data_${cKey}`);
  }

  /**
   * Stores a data file in the cache.
   *
   * @param cKey - Content key, encoded key, or cache key of the file
   * @param data - File buffer to cache
   *
   * @example
   * ```typescript
   * await cache.putDataFile('config_abc123', configBuffer);
   * await cache.putDataFile('def456.index', indexBuffer);
   * ```
   */
  public async putDataFile(cKey: string, data: Buffer): Promise<void> {
    await this.put(cKey, data);
  }
}
