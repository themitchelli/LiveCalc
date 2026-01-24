/**
 * Cache Manager for Smart Re-Run Optimization
 *
 * Tracks file hashes and determines what needs to be reloaded
 * when specific files change, enabling selective cache invalidation.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logging/logger';
import { LiveCalcConfig } from '../types';

/**
 * File types that can trigger re-runs
 */
export type DataFileType = 'model' | 'policies' | 'mortality' | 'lapse' | 'expenses' | 'config' | 'unknown';

/**
 * Cache key for each data type
 */
export interface CacheKey {
  /** File path */
  filePath: string;
  /** Content hash (MD5) */
  contentHash: string;
  /** File modification time */
  mtime: number;
}

/**
 * Represents what changed and what action to take
 */
export interface ChangeAnalysis {
  /** Files that changed */
  changedFiles: string[];
  /** Types of data that changed */
  changedTypes: Set<DataFileType>;
  /** Reload strategy */
  strategy: ReloadStrategy;
  /** Whether scenarios need regeneration */
  regenerateScenarios: boolean;
  /** Human-readable reason for the strategy */
  reason: string;
}

/**
 * Reload strategy based on what changed
 */
export enum ReloadStrategy {
  /** No changes, use fully cached data */
  NONE = 'none',
  /** Only reload policies */
  POLICIES_ONLY = 'policies_only',
  /** Only reload assumptions (mortality, lapse, expenses) */
  ASSUMPTIONS_ONLY = 'assumptions_only',
  /** Reload specific assumption files */
  PARTIAL_ASSUMPTIONS = 'partial_assumptions',
  /** Full reload (model or config changed) */
  FULL = 'full',
}

/**
 * Scenario cache key components
 */
export interface ScenarioCacheKey {
  seed: number;
  count: number;
  initialRate: number;
  drift: number;
  volatility: number;
  minRate: number;
  maxRate: number;
}

/**
 * Cache statistics for logging
 */
export interface CacheStats {
  policiesCached: boolean;
  mortalityCached: boolean;
  lapseCached: boolean;
  expensesCached: boolean;
  scenariosCached: boolean;
  totalCacheHits: number;
  totalCacheMisses: number;
}

/**
 * Cache Manager for smart re-run optimization
 *
 * Tracks what data is cached and determines optimal reload strategy
 * when files change.
 */
export class CacheManager implements vscode.Disposable {
  /** Cache keys for each data file */
  private cacheKeys = new Map<DataFileType, CacheKey>();

  /** Scenario cache key */
  private scenarioCacheKey: ScenarioCacheKey | undefined;

  /** Config directory for resolving paths */
  private configDir: string | undefined;

  /** Current config */
  private config: LiveCalcConfig | undefined;

  /** Running statistics */
  private stats: CacheStats = {
    policiesCached: false,
    mortalityCached: false,
    lapseCached: false,
    expensesCached: false,
    scenariosCached: false,
    totalCacheHits: 0,
    totalCacheMisses: 0,
  };

  constructor() {
    logger.debug('CacheManager initialized');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: LiveCalcConfig, configDir: string): void {
    const configChanged = !this.config || !this.configDir || configDir !== this.configDir;
    this.config = config;
    this.configDir = configDir;

    if (configChanged) {
      logger.debug('CacheManager: Config updated, clearing all cache keys');
      this.invalidateAll();
    }
  }

  /**
   * Determine what file type changed based on file path
   */
  public getFileType(filePath: string): DataFileType {
    if (!this.config || !this.configDir) {
      return 'unknown';
    }

    const normalizedPath = path.normalize(filePath);
    const fileName = path.basename(filePath).toLowerCase();

    // Check config file
    if (fileName === 'livecalc.config.json') {
      return 'config';
    }

    // Check model file
    const modelPath = this.resolveConfigPath(this.config.model);
    if (modelPath && path.normalize(modelPath) === normalizedPath) {
      return 'model';
    }

    // Check policy file
    if (this.config.policies) {
      const policyPath = this.resolveConfigPath(this.config.policies);
      if (policyPath && path.normalize(policyPath) === normalizedPath) {
        return 'policies';
      }
    }

    // Check assumption files
    const mortalityPath = this.resolveConfigPath(this.config.assumptions.mortality);
    if (mortalityPath && path.normalize(mortalityPath) === normalizedPath) {
      return 'mortality';
    }

    const lapsePath = this.resolveConfigPath(this.config.assumptions.lapse);
    if (lapsePath && path.normalize(lapsePath) === normalizedPath) {
      return 'lapse';
    }

    const expensesPath = this.resolveConfigPath(this.config.assumptions.expenses);
    if (expensesPath && path.normalize(expensesPath) === normalizedPath) {
      return 'expenses';
    }

    return 'unknown';
  }

  /**
   * Analyze what changed and determine reload strategy
   */
  public analyzeChanges(changedFilePaths: string[]): ChangeAnalysis {
    const changedTypes = new Set<DataFileType>();
    const changedFiles: string[] = [];

    for (const filePath of changedFilePaths) {
      const fileType = this.getFileType(filePath);
      if (fileType !== 'unknown') {
        changedTypes.add(fileType);
        changedFiles.push(path.basename(filePath));
      }
    }

    // Determine strategy based on what changed
    const { strategy, reason } = this.determineStrategy(changedTypes);

    // Check if scenarios need regeneration
    const regenerateScenarios = this.checkScenarioRegeneration(changedTypes);

    const analysis: ChangeAnalysis = {
      changedFiles,
      changedTypes,
      strategy,
      regenerateScenarios,
      reason,
    };

    logger.debug(
      `CacheManager analysis: ${changedFiles.join(', ')} -> ${strategy} (${reason})`
    );

    return analysis;
  }

  /**
   * Determine reload strategy based on changed types
   */
  private determineStrategy(changedTypes: Set<DataFileType>): {
    strategy: ReloadStrategy;
    reason: string;
  } {
    // Config or model change requires full reload
    if (changedTypes.has('config')) {
      return {
        strategy: ReloadStrategy.FULL,
        reason: 'Config file changed - dependencies may have changed',
      };
    }

    if (changedTypes.has('model')) {
      return {
        strategy: ReloadStrategy.FULL,
        reason: 'Model file changed - model structure may have changed',
      };
    }

    // Check what categories of files changed
    const policiesChanged = changedTypes.has('policies');
    const assumptionsChanged =
      changedTypes.has('mortality') ||
      changedTypes.has('lapse') ||
      changedTypes.has('expenses');

    if (policiesChanged && assumptionsChanged) {
      return {
        strategy: ReloadStrategy.FULL,
        reason: 'Both policies and assumptions changed',
      };
    }

    if (policiesChanged) {
      return {
        strategy: ReloadStrategy.POLICIES_ONLY,
        reason: 'Only policy file changed - keep assumptions cached',
      };
    }

    if (assumptionsChanged) {
      // Check if all assumptions changed or just some
      const assumptionTypes = ['mortality', 'lapse', 'expenses'] as const;
      const changedAssumptions = assumptionTypes.filter((t) => changedTypes.has(t));

      if (changedAssumptions.length === 3) {
        return {
          strategy: ReloadStrategy.ASSUMPTIONS_ONLY,
          reason: 'All assumption files changed - keep policies cached',
        };
      }

      return {
        strategy: ReloadStrategy.PARTIAL_ASSUMPTIONS,
        reason: `${changedAssumptions.join(', ')} changed - keep other data cached`,
      };
    }

    return {
      strategy: ReloadStrategy.NONE,
      reason: 'No relevant files changed',
    };
  }

  /**
   * Check if scenarios need to be regenerated
   */
  private checkScenarioRegeneration(changedTypes: Set<DataFileType>): boolean {
    // Config change could affect scenario parameters
    if (changedTypes.has('config')) {
      return true;
    }

    // Model change doesn't affect scenario generation
    // Policy/assumption changes don't affect scenario generation

    return false;
  }

  /**
   * Check if a specific data type should be reloaded
   */
  public shouldReload(
    dataType: DataFileType,
    strategy: ReloadStrategy,
    changedTypes: Set<DataFileType>
  ): boolean {
    switch (strategy) {
      case ReloadStrategy.NONE:
        return false;

      case ReloadStrategy.FULL:
        return true;

      case ReloadStrategy.POLICIES_ONLY:
        return dataType === 'policies';

      case ReloadStrategy.ASSUMPTIONS_ONLY:
        return dataType === 'mortality' || dataType === 'lapse' || dataType === 'expenses';

      case ReloadStrategy.PARTIAL_ASSUMPTIONS:
        return changedTypes.has(dataType);

      default:
        return true;
    }
  }

  /**
   * Record that data was loaded and cached
   */
  public recordCached(dataType: DataFileType, filePath: string, content: string): void {
    try {
      const stats = fs.statSync(filePath);
      const contentHash = this.hashContent(content);

      this.cacheKeys.set(dataType, {
        filePath,
        contentHash,
        mtime: stats.mtimeMs,
      });

      // Update stats
      switch (dataType) {
        case 'policies':
          this.stats.policiesCached = true;
          break;
        case 'mortality':
          this.stats.mortalityCached = true;
          break;
        case 'lapse':
          this.stats.lapseCached = true;
          break;
        case 'expenses':
          this.stats.expensesCached = true;
          break;
      }

      logger.debug(`CacheManager: Recorded cache for ${dataType}: ${path.basename(filePath)}`);
    } catch (error) {
      logger.debug(`CacheManager: Failed to record cache for ${dataType}: ${error}`);
    }
  }

  /**
   * Record scenario cache key
   */
  public recordScenarioCacheKey(config: LiveCalcConfig): void {
    this.scenarioCacheKey = {
      seed: config.scenarios.seed,
      count: config.scenarios.count,
      initialRate: config.scenarios.interestRate.initial,
      drift: config.scenarios.interestRate.drift,
      volatility: config.scenarios.interestRate.volatility,
      minRate: config.scenarios.interestRate.minRate ?? 0.0001,
      maxRate: config.scenarios.interestRate.maxRate ?? 0.20,
    };
    this.stats.scenariosCached = true;
    logger.debug('CacheManager: Recorded scenario cache key');
  }

  /**
   * Check if scenario parameters have changed
   */
  public scenarioParametersChanged(config: LiveCalcConfig): boolean {
    if (!this.scenarioCacheKey) {
      return true;
    }

    const current: ScenarioCacheKey = {
      seed: config.scenarios.seed,
      count: config.scenarios.count,
      initialRate: config.scenarios.interestRate.initial,
      drift: config.scenarios.interestRate.drift,
      volatility: config.scenarios.interestRate.volatility,
      minRate: config.scenarios.interestRate.minRate ?? 0.0001,
      maxRate: config.scenarios.interestRate.maxRate ?? 0.20,
    };

    // Compare each field
    const changed =
      this.scenarioCacheKey.seed !== current.seed ||
      this.scenarioCacheKey.count !== current.count ||
      this.scenarioCacheKey.initialRate !== current.initialRate ||
      this.scenarioCacheKey.drift !== current.drift ||
      this.scenarioCacheKey.volatility !== current.volatility ||
      this.scenarioCacheKey.minRate !== current.minRate ||
      this.scenarioCacheKey.maxRate !== current.maxRate;

    if (changed) {
      logger.debug('CacheManager: Scenario parameters changed');
    }

    return changed;
  }

  /**
   * Invalidate cache for a specific data type
   */
  public invalidate(dataType: DataFileType): void {
    this.cacheKeys.delete(dataType);

    switch (dataType) {
      case 'policies':
        this.stats.policiesCached = false;
        break;
      case 'mortality':
        this.stats.mortalityCached = false;
        break;
      case 'lapse':
        this.stats.lapseCached = false;
        break;
      case 'expenses':
        this.stats.expensesCached = false;
        break;
    }

    logger.debug(`CacheManager: Invalidated cache for ${dataType}`);
  }

  /**
   * Invalidate all caches
   */
  public invalidateAll(): void {
    this.cacheKeys.clear();
    this.scenarioCacheKey = undefined;
    this.stats = {
      policiesCached: false,
      mortalityCached: false,
      lapseCached: false,
      expensesCached: false,
      scenariosCached: false,
      totalCacheHits: 0,
      totalCacheMisses: 0,
    };
    logger.debug('CacheManager: All caches invalidated');
  }

  /**
   * Record a cache hit
   */
  public recordHit(): void {
    this.stats.totalCacheHits++;
  }

  /**
   * Record a cache miss
   */
  public recordMiss(): void {
    this.stats.totalCacheMisses++;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Log cache statistics in debug mode
   */
  public logStats(): void {
    const cached: string[] = [];
    if (this.stats.policiesCached) cached.push('policies');
    if (this.stats.mortalityCached) cached.push('mortality');
    if (this.stats.lapseCached) cached.push('lapse');
    if (this.stats.expensesCached) cached.push('expenses');
    if (this.stats.scenariosCached) cached.push('scenarios');

    logger.debug(
      `CacheManager stats: cached=[${cached.join(', ')}], ` +
        `hits=${this.stats.totalCacheHits}, misses=${this.stats.totalCacheMisses}`
    );
  }

  /**
   * Check if caching is enabled in settings
   */
  public isCachingEnabled(): boolean {
    return vscode.workspace.getConfiguration('livecalc').get('enableCaching', true);
  }

  /**
   * Hash content for comparison
   */
  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Resolve a config path to absolute path
   */
  private resolveConfigPath(configPath: string): string | undefined {
    if (!this.configDir) {
      return undefined;
    }

    if (configPath.startsWith('local://')) {
      const relativePath = configPath.slice('local://'.length);
      return path.resolve(this.configDir, relativePath);
    }

    if (configPath.startsWith('assumptions://')) {
      return undefined;
    }

    if (path.isAbsolute(configPath)) {
      return configPath;
    }

    return path.resolve(this.configDir, configPath);
  }

  public dispose(): void {
    this.cacheKeys.clear();
    this.scenarioCacheKey = undefined;
    logger.debug('CacheManager disposed');
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | undefined;

/**
 * Get the global cache manager instance
 */
export function getCacheManager(): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager();
  }
  return globalCacheManager;
}

/**
 * Dispose the global cache manager
 */
export function disposeCacheManager(): void {
  if (globalCacheManager) {
    globalCacheManager.dispose();
    globalCacheManager = undefined;
  }
}
