/**
 * Data Cache
 *
 * Caches loaded data between runs to avoid re-parsing unchanged files.
 * Uses file content hashing to detect changes.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { logger } from '../logging/logger';

/**
 * Cached data entry
 */
interface CacheEntry<T> {
  /** Hash of file content */
  contentHash: string;
  /** File modification time */
  mtime: number;
  /** Cached data */
  data: T;
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Data cache with file watching
 */
export class DataCache implements vscode.Disposable {
  private cache = new Map<string, CacheEntry<unknown>>();
  private fileWatchers = new Map<string, vscode.FileSystemWatcher>();
  private disposables: vscode.Disposable[] = [];

  /** Maximum age for cache entries in milliseconds (5 minutes) */
  private readonly maxAge = 5 * 60 * 1000;

  constructor() {
    logger.debug('DataCache initialized');
  }

  /**
   * Get cached data for a file
   *
   * @param filePath - Absolute path to the file
   * @returns Cached data or undefined if not cached or stale
   */
  public get<T>(filePath: string): T | undefined {
    const entry = this.cache.get(filePath) as CacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    // Check if cache entry is too old
    if (Date.now() - entry.cachedAt > this.maxAge) {
      logger.debug(`Cache entry expired for: ${filePath}`);
      this.invalidate(filePath);
      return undefined;
    }

    // Check if file has been modified
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs > entry.mtime) {
        logger.debug(`File modified, cache invalidated: ${filePath}`);
        this.invalidate(filePath);
        return undefined;
      }
    } catch {
      // File doesn't exist, invalidate cache
      this.invalidate(filePath);
      return undefined;
    }

    logger.debug(`Cache hit for: ${filePath}`);
    return entry.data;
  }

  /**
   * Store data in cache for a file
   *
   * @param filePath - Absolute path to the file
   * @param data - Data to cache
   * @param content - File content (for hashing)
   */
  public set<T>(filePath: string, data: T, content: string): void {
    const contentHash = this.hashContent(content);

    let mtime = Date.now();
    try {
      const stats = fs.statSync(filePath);
      mtime = stats.mtimeMs;
    } catch {
      // Use current time if file doesn't exist
    }

    const entry: CacheEntry<T> = {
      contentHash,
      mtime,
      data,
      cachedAt: Date.now(),
    };

    this.cache.set(filePath, entry);
    this.setupFileWatcher(filePath);

    logger.debug(`Cached data for: ${filePath}`);
  }

  /**
   * Check if data is cached and still valid
   *
   * @param filePath - Absolute path to the file
   * @param content - Current file content
   * @returns True if cached data is valid
   */
  public isValid(filePath: string, content: string): boolean {
    const entry = this.cache.get(filePath);

    if (!entry) {
      return false;
    }

    // Check hash
    const contentHash = this.hashContent(content);
    if (entry.contentHash !== contentHash) {
      logger.debug(`Content changed, cache invalid: ${filePath}`);
      return false;
    }

    // Check age
    if (Date.now() - entry.cachedAt > this.maxAge) {
      return false;
    }

    return true;
  }

  /**
   * Invalidate cache entry for a file
   *
   * @param filePath - Absolute path to the file
   */
  public invalidate(filePath: string): void {
    if (this.cache.has(filePath)) {
      this.cache.delete(filePath);
      logger.debug(`Cache invalidated for: ${filePath}`);
    }
  }

  /**
   * Invalidate all cache entries
   */
  public invalidateAll(): void {
    this.cache.clear();
    logger.debug('All cache entries invalidated');
  }

  /**
   * Get cache statistics
   */
  public getStats(): { entries: number; watchedFiles: number } {
    return {
      entries: this.cache.size,
      watchedFiles: this.fileWatchers.size,
    };
  }

  /**
   * Setup file watcher for cache invalidation
   */
  private setupFileWatcher(filePath: string): void {
    // Don't create duplicate watchers
    if (this.fileWatchers.has(filePath)) {
      return;
    }

    try {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(filePath).fsPath, '**'),
        true, // Ignore creates
        false, // Watch changes
        false // Watch deletes
      );

      watcher.onDidChange(() => {
        logger.debug(`File changed (watcher): ${filePath}`);
        this.invalidate(filePath);
      });

      watcher.onDidDelete(() => {
        logger.debug(`File deleted (watcher): ${filePath}`);
        this.invalidate(filePath);
        this.removeFileWatcher(filePath);
      });

      this.fileWatchers.set(filePath, watcher);
      this.disposables.push(watcher);
    } catch (error) {
      // File watcher creation can fail for some paths, fall back to mtime check
      logger.debug(`Could not create file watcher for: ${filePath}`);
    }
  }

  /**
   * Remove file watcher
   */
  private removeFileWatcher(filePath: string): void {
    const watcher = this.fileWatchers.get(filePath);
    if (watcher) {
      watcher.dispose();
      this.fileWatchers.delete(filePath);
    }
  }

  /**
   * Hash file content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.cache.clear();

    for (const watcher of this.fileWatchers.values()) {
      watcher.dispose();
    }
    this.fileWatchers.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    logger.debug('DataCache disposed');
  }
}

/**
 * Global cache instance
 */
let globalCache: DataCache | undefined;

/**
 * Get the global data cache instance
 */
export function getDataCache(): DataCache {
  if (!globalCache) {
    globalCache = new DataCache();
  }
  return globalCache;
}

/**
 * Dispose the global cache (for testing)
 */
export function disposeDataCache(): void {
  if (globalCache) {
    globalCache.dispose();
    globalCache = undefined;
  }
}
