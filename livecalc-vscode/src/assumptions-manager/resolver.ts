/**
 * Assumption Resolver
 *
 * Resolves assumption references (both assumptions:// and local://) to actual data
 * that can be used by the valuation engine.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { AssumptionsManagerClient, AMClientError } from './client';
import { AMCache } from './cache';
import {
  AMTableData,
  AMVersionInfo,
  AMConnectionState,
  ResolvedAssumption,
  AMConfig,
} from './types';
import type { AssumptionConfig, LiveCalcConfig } from '../types';

/**
 * Assumption reference parsed from a config or model file
 */
export interface AssumptionReference {
  /** Original reference string (e.g., 'assumptions://mortality:v2.1') */
  original: string;
  /** Type of reference */
  type: 'am' | 'local';
  /** Table name (for AM references) or file path (for local) */
  name: string;
  /** Version (for AM references) */
  version?: string;
  /** Assumption type: mortality, lapse, or expenses */
  assumptionType: 'mortality' | 'lapse' | 'expenses';
}

/**
 * Resolution result for a single assumption
 */
export interface ResolutionResult {
  /** Original reference */
  reference: AssumptionReference;
  /** Resolved data */
  resolved: ResolvedAssumption;
  /** Whether this was resolved from cache */
  cached: boolean;
}

/**
 * Full resolution result for all assumptions in a config
 */
export interface FullResolutionResult {
  /** All resolved assumptions */
  assumptions: {
    mortality: ResolvedAssumption;
    lapse: ResolvedAssumption;
    expenses: ResolvedAssumption;
  };
  /** Resolved versions mapping (for audit trail) */
  resolvedVersions: Map<string, string>;
  /** Resolution log messages */
  resolutionLog: string[];
  /** Warnings (e.g., using draft version) */
  warnings: string[];
}

/**
 * Error thrown when assumption resolution fails
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly reference: string,
    public readonly assumptionType: 'mortality' | 'lapse' | 'expenses',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}

/**
 * Pattern for parsing assumptions:// references
 */
const ASSUMPTION_REF_PATTERN = /^assumptions:\/\/([a-zA-Z0-9_-]+)(?::(.+))?$/;

/**
 * AssumptionResolver handles resolution of all assumption references
 *
 * Supports:
 * - assumptions://table-name:version (from Assumptions Manager)
 * - assumptions://table-name:latest (resolves to latest approved version)
 * - assumptions://table-name:draft (resolves to current draft)
 * - local://path/to/file.csv (local file references)
 * - Absolute and relative file paths
 *
 * Caching behavior:
 * - Version-specific entries (e.g., v2.1) are cached indefinitely
 * - 'latest' and 'draft' are NEVER cached (always fetch to get current)
 * - Offline mode uses cache when API unavailable (with warning)
 */
export class AssumptionResolver implements vscode.Disposable {
  private static instance: AssumptionResolver | undefined;

  private constructor(
    private readonly authManager: AuthManager,
    private readonly client: AssumptionsManagerClient,
    private readonly cache?: AMCache
  ) {}

  /**
   * Get singleton instance
   */
  public static getInstance(
    authManager: AuthManager,
    client: AssumptionsManagerClient,
    cache?: AMCache
  ): AssumptionResolver {
    if (!AssumptionResolver.instance) {
      AssumptionResolver.instance = new AssumptionResolver(authManager, client, cache);
    }
    return AssumptionResolver.instance;
  }

  /**
   * Dispose singleton instance
   */
  public static disposeInstance(): void {
    if (AssumptionResolver.instance) {
      AssumptionResolver.instance.dispose();
      AssumptionResolver.instance = undefined;
    }
  }

  /**
   * Resolve all assumptions in a config
   *
   * @param config - LiveCalc configuration
   * @param configDir - Directory containing the config file (for resolving relative paths)
   * @returns Full resolution result with all assumptions resolved
   */
  public async resolveAll(
    config: LiveCalcConfig,
    configDir: string
  ): Promise<FullResolutionResult> {
    const resolutionLog: string[] = [];
    const warnings: string[] = [];
    const resolvedVersions = new Map<string, string>();

    // Parse all references
    const mortalityRef = this.parseReference(
      config.assumptions.mortality,
      'mortality',
      configDir
    );
    const lapseRef = this.parseReference(
      config.assumptions.lapse,
      'lapse',
      configDir
    );
    const expensesRef = this.parseReference(
      config.assumptions.expenses,
      'expenses',
      configDir
    );

    logger.debug(
      `Resolving assumptions: mortality=${mortalityRef.original}, ` +
        `lapse=${lapseRef.original}, expenses=${expensesRef.original}`
    );

    // Resolve all references in parallel for performance
    const [mortality, lapse, expenses] = await Promise.all([
      this.resolveReference(mortalityRef, resolutionLog, warnings, resolvedVersions),
      this.resolveReference(lapseRef, resolutionLog, warnings, resolvedVersions),
      this.resolveReference(expensesRef, resolutionLog, warnings, resolvedVersions),
    ]);

    // Log resolution summary
    for (const log of resolutionLog) {
      logger.info(log);
    }

    for (const warning of warnings) {
      logger.warn(warning);
    }

    return {
      assumptions: {
        mortality: mortality.resolved,
        lapse: lapse.resolved,
        expenses: expenses.resolved,
      },
      resolvedVersions,
      resolutionLog,
      warnings,
    };
  }

  /**
   * Resolve a single assumption reference
   */
  public async resolveSingle(
    reference: string,
    assumptionType: 'mortality' | 'lapse' | 'expenses',
    configDir: string
  ): Promise<ResolvedAssumption> {
    const ref = this.parseReference(reference, assumptionType, configDir);
    const resolutionLog: string[] = [];
    const warnings: string[] = [];
    const resolvedVersions = new Map<string, string>();

    const result = await this.resolveReference(ref, resolutionLog, warnings, resolvedVersions);
    return result.resolved;
  }

  /**
   * Parse a reference string into a structured AssumptionReference
   */
  public parseReference(
    reference: string,
    assumptionType: 'mortality' | 'lapse' | 'expenses',
    configDir: string
  ): AssumptionReference {
    // Handle assumptions:// references
    if (reference.startsWith('assumptions://')) {
      const match = reference.match(ASSUMPTION_REF_PATTERN);
      if (!match) {
        throw new ResolutionError(
          `Invalid assumption reference format: ${reference}. ` +
            'Expected format: assumptions://table-name:version',
          reference,
          assumptionType
        );
      }

      return {
        original: reference,
        type: 'am',
        name: match[1],
        version: match[2] || 'latest', // Default to 'latest' if no version specified
        assumptionType,
      };
    }

    // Handle local:// references
    if (reference.startsWith('local://')) {
      const relativePath = reference.slice('local://'.length);
      const absolutePath = path.resolve(configDir, relativePath);
      return {
        original: reference,
        type: 'local',
        name: absolutePath,
        assumptionType,
      };
    }

    // Handle absolute paths
    if (path.isAbsolute(reference)) {
      return {
        original: reference,
        type: 'local',
        name: reference,
        assumptionType,
      };
    }

    // Handle relative paths
    const absolutePath = path.resolve(configDir, reference);
    return {
      original: reference,
      type: 'local',
      name: absolutePath,
      assumptionType,
    };
  }

  /**
   * Check if a reference is an Assumptions Manager reference
   */
  public isAMReference(reference: string): boolean {
    return reference.startsWith('assumptions://');
  }

  /**
   * Check if a reference is a local file reference
   */
  public isLocalReference(reference: string): boolean {
    return (
      reference.startsWith('local://') ||
      path.isAbsolute(reference) ||
      !reference.startsWith('assumptions://')
    );
  }

  /**
   * Resolve a parsed reference to actual data
   */
  private async resolveReference(
    ref: AssumptionReference,
    resolutionLog: string[],
    warnings: string[],
    resolvedVersions: Map<string, string>
  ): Promise<ResolutionResult> {
    if (ref.type === 'am') {
      return this.resolveAMReference(ref, resolutionLog, warnings, resolvedVersions);
    } else {
      return this.resolveLocalReference(ref, resolutionLog);
    }
  }

  /**
   * Resolve an Assumptions Manager reference
   */
  private async resolveAMReference(
    ref: AssumptionReference,
    resolutionLog: string[],
    warnings: string[],
    resolvedVersions: Map<string, string>
  ): Promise<ResolutionResult> {
    const { name: tableName, version = 'latest', assumptionType } = ref;
    const config = this.getConfig();

    try {
      // Check if authenticated
      if (!this.authManager.isAuthenticated()) {
        // Check offline mode - try cache if available
        if (this.cache && config.offlineMode === 'warn') {
          const cachedResult = await this.tryOfflineResolution(
            ref,
            tableName,
            version,
            resolutionLog,
            warnings,
            resolvedVersions
          );
          if (cachedResult) {
            return cachedResult;
          }
        }

        throw new ResolutionError(
          `Cannot resolve ${ref.original}: Not authenticated with Assumptions Manager. ` +
            'Please login using the "LiveCalc: Login to Assumptions Manager" command.',
          ref.original,
          assumptionType
        );
      }

      // Check cache first for version-specific references (not 'latest' or 'draft')
      if (this.cache && this.cache.isCacheable(version)) {
        const cacheResult = await this.cache.get(tableName, version);
        if (cacheResult.hit && cacheResult.data) {
          // Cache hit - use cached data
          const tableData = cacheResult.data;
          const resolvedVersion = tableData.version;

          resolutionLog.push(`Cache hit: ${tableName}:${resolvedVersion}`);
          resolvedVersions.set(`${tableName}:${version}`, resolvedVersion);

          // Check for warnings
          this.addStatusWarnings(tableData, tableName, warnings);

          // Convert to engine-compatible format
          const data = this.convertToEngineFormat(tableData, assumptionType);

          const resolved: ResolvedAssumption = {
            reference: ref.original,
            tableName,
            version,
            resolvedVersion,
            source: 'am',
            data,
            columns: tableData.columns,
            metadata: {
              status: tableData.metadata.status,
              approvedAt: tableData.metadata.approvedAt,
              approvedBy: tableData.metadata.approvedBy,
              contentHash: tableData.metadata.contentHash,
              fetchedAt: cacheResult.fetchedAt,
            },
          };

          return {
            reference: ref,
            resolved,
            cached: true,
          };
        }
      }

      // Fetch data from AM (client handles version resolution)
      let tableData: AMTableData;
      try {
        tableData = await this.client.fetchData(tableName, version);
      } catch (error) {
        // On network error, try offline mode
        if (this.shouldTryOfflineMode(error, config)) {
          const cachedResult = await this.tryOfflineResolution(
            ref,
            tableName,
            version,
            resolutionLog,
            warnings,
            resolvedVersions
          );
          if (cachedResult) {
            return cachedResult;
          }
        }
        throw error;
      }

      // Determine the resolved version
      const resolvedVersion = tableData.version;

      // Log resolution
      if (version === 'latest' || version === 'draft') {
        resolutionLog.push(
          `Resolved ${tableName}:${version} \u2192 ${resolvedVersion}`
        );
      } else {
        resolutionLog.push(`Resolved ${tableName}:${resolvedVersion}`);
      }

      // Track resolved version for audit
      resolvedVersions.set(`${tableName}:${version}`, resolvedVersion);

      // Store in cache (only for version-specific references)
      if (this.cache && this.cache.isCacheable(resolvedVersion)) {
        await this.cache.set(tableName, resolvedVersion, tableData);
      }

      // Check for warnings
      this.addStatusWarnings(tableData, tableName, warnings);

      // Convert to engine-compatible format
      const data = this.convertToEngineFormat(tableData, assumptionType);

      const resolved: ResolvedAssumption = {
        reference: ref.original,
        tableName,
        version,
        resolvedVersion,
        source: 'am',
        data,
        columns: tableData.columns,
        metadata: {
          status: tableData.metadata.status,
          approvedAt: tableData.metadata.approvedAt,
          approvedBy: tableData.metadata.approvedBy,
          contentHash: tableData.metadata.contentHash,
          fetchedAt: new Date().toISOString(),
        },
      };

      return {
        reference: ref,
        resolved,
        cached: false,
      };
    } catch (error) {
      // Wrap errors with context
      if (error instanceof ResolutionError) {
        throw error;
      }

      if (error instanceof AMClientError) {
        let message: string;
        switch (error.code) {
          case 'NOT_FOUND':
            message = `Assumption table '${tableName}' or version '${version}' not found`;
            break;
          case 'UNAUTHORIZED':
            message = `Authentication failed while fetching ${tableName}. Please login again.`;
            break;
          case 'FORBIDDEN':
            message = `Access denied to table '${tableName}'. Check your permissions.`;
            break;
          case 'NOT_CONFIGURED':
            message = `Assumptions Manager URL not configured. Set livecalc.assumptionsManager.url in settings.`;
            break;
          default:
            message = `Failed to fetch ${tableName}: ${error.message}`;
        }
        throw new ResolutionError(message, ref.original, assumptionType, error);
      }

      throw new ResolutionError(
        `Failed to resolve ${ref.original}: ${error instanceof Error ? error.message : String(error)}`,
        ref.original,
        assumptionType,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Add status-based warnings for non-approved assumptions
   */
  private addStatusWarnings(
    tableData: AMTableData,
    tableName: string,
    warnings: string[]
  ): void {
    if (tableData.metadata.status === 'draft') {
      warnings.push(
        `Using draft version of ${tableName}. This may not be approved for production use.`
      );
    } else if (tableData.metadata.status === 'pending') {
      warnings.push(
        `Using pending version of ${tableName}. This version is awaiting approval.`
      );
    }
  }

  /**
   * Check if we should try offline mode for a given error
   */
  private shouldTryOfflineMode(error: unknown, config: AMConfig): boolean {
    if (config.offlineMode !== 'warn') {
      return false;
    }

    if (error instanceof AMClientError) {
      return (
        error.code === 'NETWORK_ERROR' ||
        error.code === 'TIMEOUT' ||
        error.code === 'SERVER_ERROR'
      );
    }

    return false;
  }

  /**
   * Try to resolve from cache in offline mode
   */
  private async tryOfflineResolution(
    ref: AssumptionReference,
    tableName: string,
    version: string,
    resolutionLog: string[],
    warnings: string[],
    resolvedVersions: Map<string, string>
  ): Promise<ResolutionResult | null> {
    if (!this.cache) {
      return null;
    }

    // For 'latest' and 'draft', we can't use cache (we don't know what version to look up)
    if (!this.cache.isCacheable(version)) {
      logger.debug(
        `AMResolver: Cannot use cache for ${tableName}:${version} (not version-specific)`
      );
      return null;
    }

    const cacheResult = await this.cache.get(tableName, version);
    if (!cacheResult.hit || !cacheResult.data) {
      return null;
    }

    // Found in cache - use offline mode
    const tableData = cacheResult.data;
    const resolvedVersion = tableData.version;

    resolutionLog.push(`Offline cache hit: ${tableName}:${resolvedVersion}`);
    warnings.push(
      `Using cached data for ${tableName}:${resolvedVersion} (fetched ${this.formatRelativeTime(cacheResult.fetchedAt)}). ` +
        'Assumptions Manager is unavailable.'
    );

    resolvedVersions.set(`${tableName}:${version}`, resolvedVersion);

    // Add status warnings
    this.addStatusWarnings(tableData, tableName, warnings);

    // Convert to engine-compatible format
    const data = this.convertToEngineFormat(tableData, ref.assumptionType);

    const resolved: ResolvedAssumption = {
      reference: ref.original,
      tableName,
      version,
      resolvedVersion,
      source: 'am',
      data,
      columns: tableData.columns,
      metadata: {
        status: tableData.metadata.status,
        approvedAt: tableData.metadata.approvedAt,
        approvedBy: tableData.metadata.approvedBy,
        contentHash: tableData.metadata.contentHash,
        fetchedAt: cacheResult.fetchedAt,
      },
    };

    return {
      reference: ref,
      resolved,
      cached: true,
    };
  }

  /**
   * Format a timestamp as relative time (e.g., "2 hours ago")
   */
  private formatRelativeTime(timestamp?: string): string {
    if (!timestamp) {
      return 'unknown time';
    }

    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
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
   * Resolve a local file reference
   */
  private async resolveLocalReference(
    ref: AssumptionReference,
    resolutionLog: string[]
  ): Promise<ResolutionResult> {
    const filePath = ref.name;

    try {
      // Check file exists
      if (!fs.existsSync(filePath)) {
        throw new ResolutionError(
          `Local file not found: ${filePath}`,
          ref.original,
          ref.assumptionType
        );
      }

      // Read file content
      const content = await fs.promises.readFile(filePath, 'utf-8');

      // Calculate content hash
      const contentHash = crypto
        .createHash('md5')
        .update(content)
        .digest('hex')
        .slice(0, 12);

      // Get file modification time
      const stats = await fs.promises.stat(filePath);
      const modTime = stats.mtime.toISOString();

      // Parse the content based on file type and assumption type
      const { data, columns } = this.parseLocalFile(content, filePath, ref.assumptionType);

      resolutionLog.push(`Resolved local file: ${path.basename(filePath)}`);

      const resolved: ResolvedAssumption = {
        reference: ref.original,
        tableName: path.basename(filePath, path.extname(filePath)),
        version: 'local',
        resolvedVersion: 'local',
        source: 'local',
        data,
        columns,
        metadata: {
          contentHash,
          fetchedAt: modTime,
        },
      };

      return {
        reference: ref,
        resolved,
        cached: false,
      };
    } catch (error) {
      if (error instanceof ResolutionError) {
        throw error;
      }

      throw new ResolutionError(
        `Failed to read local file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        ref.original,
        ref.assumptionType,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert AM table data to engine-compatible number[][] format
   */
  private convertToEngineFormat(
    tableData: AMTableData,
    assumptionType: 'mortality' | 'lapse' | 'expenses'
  ): number[][] {
    // Convert all rows to numbers
    return tableData.rows.map((row) =>
      row.map((cell) => {
        if (typeof cell === 'number') {
          return cell;
        }
        const num = parseFloat(cell);
        if (isNaN(num)) {
          throw new Error(`Invalid numeric value in table data: ${cell}`);
        }
        return num;
      })
    );
  }

  /**
   * Parse a local file to extract data and columns
   */
  private parseLocalFile(
    content: string,
    filePath: string,
    assumptionType: 'mortality' | 'lapse' | 'expenses'
  ): { data: number[][]; columns: string[] } {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      return this.parseLocalJsonFile(content, assumptionType);
    }

    // Default to CSV parsing
    return this.parseLocalCsvFile(content, assumptionType);
  }

  /**
   * Parse a local JSON file
   */
  private parseLocalJsonFile(
    content: string,
    assumptionType: 'mortality' | 'lapse' | 'expenses'
  ): { data: number[][]; columns: string[] } {
    const json = JSON.parse(content);

    // If it's already in AM format (columns + rows), use directly
    if (json.columns && json.rows) {
      return {
        columns: json.columns,
        data: json.rows.map((row: (string | number)[]) =>
          row.map((cell) => (typeof cell === 'number' ? cell : parseFloat(cell)))
        ),
      };
    }

    // For expenses JSON (key-value format), convert to tabular
    if (assumptionType === 'expenses') {
      const columns = ['parameter', 'value'];
      const data: number[][] = [];

      const params: Record<string, number | undefined> = {
        per_policy_acquisition:
          json.perPolicyAcquisition ?? json.per_policy_acquisition ?? json.acquisition,
        per_policy_maintenance:
          json.perPolicyMaintenance ?? json.per_policy_maintenance ?? json.maintenance,
        percent_of_premium:
          json.percentOfPremium ?? json.percent_of_premium ?? json.percentPremium,
        claim_expense:
          json.perClaim ?? json.per_claim ?? json.claim_expense ?? json.claimExpense,
      };

      let idx = 0;
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          data.push([idx++, value]);
        }
      }

      return { columns, data };
    }

    throw new Error(
      `Unsupported JSON format for ${assumptionType}. Expected {columns: [], rows: [[]]} structure.`
    );
  }

  /**
   * Parse a local CSV file
   */
  private parseLocalCsvFile(
    content: string,
    _assumptionType: 'mortality' | 'lapse' | 'expenses'
  ): { data: number[][]; columns: string[] } {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header and one data row');
    }

    const columns = lines[0].split(',').map((col) => col.trim());
    const data: number[][] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((cell) => cell.trim());
      const row: number[] = [];

      for (const value of values) {
        const num = parseFloat(value);
        // For CSV, non-numeric values are allowed (e.g., parameter names)
        // We'll store them as NaN and let the caller handle
        row.push(isNaN(num) ? 0 : num);
      }

      data.push(row);
    }

    return { columns, data };
  }

  /**
   * Check if any references in the config are AM references
   */
  public hasAMReferences(config: LiveCalcConfig): boolean {
    return (
      this.isAMReference(config.assumptions.mortality) ||
      this.isAMReference(config.assumptions.lapse) ||
      this.isAMReference(config.assumptions.expenses)
    );
  }

  /**
   * Get all AM references from config
   */
  public getAMReferences(config: LiveCalcConfig): AssumptionReference[] {
    const refs: AssumptionReference[] = [];

    const types: Array<'mortality' | 'lapse' | 'expenses'> = [
      'mortality',
      'lapse',
      'expenses',
    ];

    for (const type of types) {
      const reference = config.assumptions[type];
      if (this.isAMReference(reference)) {
        try {
          refs.push(this.parseReference(reference, type, ''));
        } catch {
          // Ignore parse errors here, they'll be caught during resolution
        }
      }
    }

    return refs;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    // Nothing to dispose currently
  }
}

/**
 * Dispose singleton instance
 */
export function disposeResolver(): void {
  AssumptionResolver.disposeInstance();
}
