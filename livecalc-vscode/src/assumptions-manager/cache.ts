/**
 * Assumptions Manager Cache
 *
 * Caches fetched assumptions locally in VS Code globalStorageUri for:
 * - Faster subsequent runs (cache hits skip API calls)
 * - Offline mode support (use cached data when API unavailable)
 *
 * Features:
 * - LRU eviction when cache exceeds configured size limit
 * - Version-specific caching (immutable versions are cached, 'latest'/'draft' are not)
 * - Cache statistics for debugging and monitoring
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logging/logger';
import { AMTableData, AMCacheEntry, AMCacheIndex, AMConfig } from './types';

/**
 * Cache statistics for monitoring and debugging
 */
export interface CacheStatistics {
  hits: number;
  misses: number;
  totalSizeBytes: number;
  entryCount: number;
  maxSizeBytes: number;
  hitRatio: number;
}

/**
 * Result of a cache lookup
 */
export interface CacheLookupResult {
  /** Whether the entry was found in cache */
  hit: boolean;
  /** The cached data (if hit) */
  data?: AMTableData;
  /** Fetch timestamp (if hit) */
  fetchedAt?: string;
}

/**
 * AMCache manages local caching of Assumptions Manager data
 *
 * Cache key format: {table-name}:{version}
 * - Version-specific entries are immutable and cached indefinitely
 * - 'latest' and 'draft' are NOT cached (always fetch to get current)
 */
export class AMCache implements vscode.Disposable {
  private static instance: AMCache | undefined;

  private cacheDir: string;
  private cacheIndex: AMCacheIndex;
  private indexPath: string;
  private stats: { hits: number; misses: number };
  private isInitialized = false;

  private constructor(private readonly context: vscode.ExtensionContext) {
    // Cache directory is inside globalStorageUri for user-specific storage
    this.cacheDir = path.join(
      context.globalStorageUri.fsPath,
      'assumptions-cache'
    );
    this.indexPath = path.join(this.cacheDir, 'index.json');

    // Initialize empty cache index
    this.cacheIndex = {
      entries: {},
      totalSizeBytes: 0,
    };

    // Initialize statistics
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(context: vscode.ExtensionContext): AMCache {
    if (!AMCache.instance) {
      AMCache.instance = new AMCache(context);
    }
    return AMCache.instance;
  }

  /**
   * Get existing singleton instance if it exists, without requiring context
   * Returns undefined if the cache has not been initialized
   */
  public static getExistingInstance(): AMCache | undefined {
    return AMCache.instance;
  }

  /**
   * Dispose singleton instance
   */
  public static disposeInstance(): void {
    if (AMCache.instance) {
      AMCache.instance.dispose();
      AMCache.instance = undefined;
    }
  }

  /**
   * Initialize the cache (create directory, load index)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure cache directory exists
      await fs.promises.mkdir(this.cacheDir, { recursive: true });

      // Load existing cache index if it exists
      if (fs.existsSync(this.indexPath)) {
        const indexContent = await fs.promises.readFile(this.indexPath, 'utf-8');
        this.cacheIndex = JSON.parse(indexContent) as AMCacheIndex;
        logger.debug(
          `AMCache: Loaded index with ${Object.keys(this.cacheIndex.entries).length} entries ` +
            `(${this.formatBytes(this.cacheIndex.totalSizeBytes)})`
        );
      } else {
        logger.debug('AMCache: No existing index found, starting fresh');
      }

      this.isInitialized = true;
    } catch (error) {
      logger.error(
        'AMCache: Failed to initialize',
        error instanceof Error ? error : undefined
      );
      // Continue with empty cache on error
      this.cacheIndex = { entries: {}, totalSizeBytes: 0 };
      this.isInitialized = true;
    }
  }

  /**
   * Check if a table version should be cached
   * 'latest' and 'draft' are NOT cached (always fetch to get current)
   */
  public isCacheable(version: string): boolean {
    return version !== 'latest' && version !== 'draft';
  }

  /**
   * Build cache key from table name and version
   */
  public getCacheKey(tableName: string, version: string): string {
    return `${tableName}:${version}`;
  }

  /**
   * Look up an entry in the cache
   */
  public async get(
    tableName: string,
    version: string
  ): Promise<CacheLookupResult> {
    await this.ensureInitialized();

    // Don't cache 'latest' or 'draft' - always fetch
    if (!this.isCacheable(version)) {
      this.stats.misses++;
      logger.debug(`AMCache: Not cacheable (${version}) - ${tableName}:${version}`);
      return { hit: false };
    }

    const key = this.getCacheKey(tableName, version);
    const indexEntry = this.cacheIndex.entries[key];

    if (!indexEntry) {
      this.stats.misses++;
      logger.debug(`AMCache: Miss - ${key}`);
      return { hit: false };
    }

    // Read the cached data
    const filePath = this.getEntryPath(key);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const entry = JSON.parse(content) as AMCacheEntry;

      // Update access time for LRU tracking
      indexEntry.accessedAt = new Date().toISOString();
      await this.saveIndex();

      this.stats.hits++;
      logger.debug(`AMCache: Hit - ${key}`);

      return {
        hit: true,
        data: entry.data,
        fetchedAt: entry.fetchedAt,
      };
    } catch (error) {
      // Cache file corrupted or missing, remove from index
      logger.warn(`AMCache: Corrupted entry for ${key}, removing`);
      delete this.cacheIndex.entries[key];
      await this.saveIndex();

      this.stats.misses++;
      return { hit: false };
    }
  }

  /**
   * Store an entry in the cache
   */
  public async set(
    tableName: string,
    version: string,
    data: AMTableData
  ): Promise<void> {
    await this.ensureInitialized();

    // Don't cache 'latest' or 'draft'
    if (!this.isCacheable(version)) {
      logger.debug(`AMCache: Not caching ${tableName}:${version} (not cacheable)`);
      return;
    }

    const key = this.getCacheKey(tableName, version);
    const now = new Date().toISOString();

    // Create cache entry
    const entry: AMCacheEntry = {
      data,
      fetchedAt: now,
      accessedAt: now,
      sizeBytes: 0, // Will be calculated
    };

    // Serialize to calculate size
    const content = JSON.stringify(entry, null, 2);
    entry.sizeBytes = Buffer.byteLength(content, 'utf-8');

    // Check if we need to evict entries
    const config = this.getConfig();
    const maxSizeBytes = config.cacheSizeMb * 1024 * 1024;

    // If this entry alone exceeds max size, don't cache
    if (entry.sizeBytes > maxSizeBytes) {
      logger.warn(
        `AMCache: Entry ${key} (${this.formatBytes(entry.sizeBytes)}) exceeds max cache size, not caching`
      );
      return;
    }

    // Evict entries if needed to make room
    const spaceNeeded = this.cacheIndex.totalSizeBytes + entry.sizeBytes - maxSizeBytes;
    if (spaceNeeded > 0) {
      await this.evictLRU(spaceNeeded);
    }

    // Write the entry file
    const filePath = this.getEntryPath(key);
    await fs.promises.writeFile(filePath, content, 'utf-8');

    // Update index
    this.cacheIndex.entries[key] = {
      accessedAt: now,
      sizeBytes: entry.sizeBytes,
    };
    this.cacheIndex.totalSizeBytes += entry.sizeBytes;

    await this.saveIndex();

    logger.debug(
      `AMCache: Stored ${key} (${this.formatBytes(entry.sizeBytes)})`
    );
  }

  /**
   * Remove a specific entry from the cache
   */
  public async remove(tableName: string, version: string): Promise<boolean> {
    await this.ensureInitialized();

    const key = this.getCacheKey(tableName, version);
    const indexEntry = this.cacheIndex.entries[key];

    if (!indexEntry) {
      return false;
    }

    // Delete the file
    const filePath = this.getEntryPath(key);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // File might not exist, that's okay
    }

    // Update index
    this.cacheIndex.totalSizeBytes -= indexEntry.sizeBytes;
    delete this.cacheIndex.entries[key];
    await this.saveIndex();

    logger.debug(`AMCache: Removed ${key}`);
    return true;
  }

  /**
   * Clear all cached entries
   */
  public async clear(): Promise<number> {
    await this.ensureInitialized();

    const entryCount = Object.keys(this.cacheIndex.entries).length;

    if (entryCount === 0) {
      return 0;
    }

    // Delete all entry files
    for (const key of Object.keys(this.cacheIndex.entries)) {
      const filePath = this.getEntryPath(key);
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File might not exist
      }
    }

    // Reset index
    this.cacheIndex = { entries: {}, totalSizeBytes: 0 };
    await this.saveIndex();

    // Reset stats
    this.stats = { hits: 0, misses: 0 };

    logger.info(`AMCache: Cleared ${entryCount} entries`);
    return entryCount;
  }

  /**
   * Get cache statistics
   */
  public getStatistics(): CacheStatistics {
    const config = this.getConfig();
    const totalAttempts = this.stats.hits + this.stats.misses;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalSizeBytes: this.cacheIndex.totalSizeBytes,
      entryCount: Object.keys(this.cacheIndex.entries).length,
      maxSizeBytes: config.cacheSizeMb * 1024 * 1024,
      hitRatio: totalAttempts > 0 ? this.stats.hits / totalAttempts : 0,
    };
  }

  /**
   * Log cache statistics to output channel
   */
  public logStatistics(): void {
    const stats = this.getStatistics();

    logger.info('AMCache Statistics:');
    logger.info(`  Entries: ${stats.entryCount}`);
    logger.info(
      `  Size: ${this.formatBytes(stats.totalSizeBytes)} / ${this.formatBytes(stats.maxSizeBytes)}`
    );
    logger.info(`  Hits: ${stats.hits}`);
    logger.info(`  Misses: ${stats.misses}`);
    logger.info(`  Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
  }

  /**
   * Check if an entry exists in cache
   */
  public has(tableName: string, version: string): boolean {
    if (!this.isCacheable(version)) {
      return false;
    }
    const key = this.getCacheKey(tableName, version);
    return key in this.cacheIndex.entries;
  }

  /**
   * Get list of all cached entries
   */
  public getEntries(): Array<{ key: string; accessedAt: string; sizeBytes: number }> {
    return Object.entries(this.cacheIndex.entries).map(([key, entry]) => ({
      key,
      accessedAt: entry.accessedAt,
      sizeBytes: entry.sizeBytes,
    }));
  }

  // Private helper methods

  /**
   * Ensure cache is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Get the file path for a cache entry
   */
  private getEntryPath(key: string): string {
    // Use a safe filename (replace : with _)
    const safeKey = key.replace(/:/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  /**
   * Save the cache index to disk
   */
  private async saveIndex(): Promise<void> {
    try {
      const content = JSON.stringify(this.cacheIndex, null, 2);
      await fs.promises.writeFile(this.indexPath, content, 'utf-8');
    } catch (error) {
      logger.error(
        'AMCache: Failed to save index',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Evict least recently used entries to free up space
   */
  private async evictLRU(bytesToFree: number): Promise<void> {
    if (bytesToFree <= 0) {
      return;
    }

    // Sort entries by accessedAt (oldest first)
    const sortedEntries = Object.entries(this.cacheIndex.entries)
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.accessedAt.localeCompare(b.accessedAt));

    let freedBytes = 0;
    const entriesToRemove: string[] = [];

    for (const entry of sortedEntries) {
      if (freedBytes >= bytesToFree) {
        break;
      }

      entriesToRemove.push(entry.key);
      freedBytes += entry.sizeBytes;
    }

    // Remove entries
    for (const key of entriesToRemove) {
      const filePath = this.getEntryPath(key);
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // File might not exist
      }

      const entry = this.cacheIndex.entries[key];
      if (entry) {
        this.cacheIndex.totalSizeBytes -= entry.sizeBytes;
        delete this.cacheIndex.entries[key];
      }
    }

    if (entriesToRemove.length > 0) {
      logger.debug(
        `AMCache: Evicted ${entriesToRemove.length} entries (${this.formatBytes(freedBytes)})`
      );
    }
  }

  /**
   * Get configuration from VS Code settings
   */
  private getConfig(): AMConfig {
    const config = vscode.workspace.getConfiguration('livecalc.assumptionsManager');
    return {
      url: config.get<string>('url', ''),
      autoLogin: config.get<boolean>('autoLogin', true),
      timeoutMs: config.get<number>('timeoutMs', 30000),
      cacheSizeMb: config.get<number>('cacheSizeMb', 100),
      offlineMode: config.get<'warn' | 'fail'>('offlineMode', 'warn'),
    };
  }

  /**
   * Format bytes as human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    // Log final statistics before disposing
    if (this.isInitialized && logger) {
      logger.debug(
        `AMCache: Final stats - ${this.stats.hits} hits, ${this.stats.misses} misses`
      );
    }
  }
}

/**
 * Dispose singleton instance
 */
export function disposeAMCache(): void {
  AMCache.disposeInstance();
}
