/**
 * Assumptions Manager API Client
 * Wraps all API calls to the Assumptions Manager service
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import {
  AMConfig,
  AMTableInfo,
  AMVersionInfo,
  AMTableData,
  AMApiError,
} from './types';

// Retry configuration
const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000]; // ms
const MAX_RETRIES = 3;

/**
 * Error codes for API errors
 */
export type AMClientErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NOT_CONFIGURED'
  | 'NOT_AUTHENTICATED';

/**
 * Error class for API client errors
 */
export class AMClientError extends Error {
  constructor(
    message: string,
    public readonly code: AMClientErrorCode,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AMClientError';
  }

  /**
   * Check if error is retryable
   */
  public isRetryable(): boolean {
    return (
      this.code === 'SERVER_ERROR' ||
      this.code === 'NETWORK_ERROR' ||
      this.code === 'TIMEOUT'
    );
  }
}

/**
 * API response for listing tables
 */
interface ListTablesResponse {
  tables: AMTableInfo[];
  total: number;
}

/**
 * API response for listing versions
 */
interface ListVersionsResponse {
  versions: AMVersionInfo[];
  total: number;
}

/**
 * AssumptionsManagerClient handles all API calls to Assumptions Manager
 *
 * Features:
 * - Automatic token handling via AuthManager
 * - Automatic token refresh if expired
 * - Retry logic with exponential backoff
 * - Clear error messages for different HTTP status codes
 * - Request/response logging in debug mode
 */
export class AssumptionsManagerClient implements vscode.Disposable {
  private static instance: AssumptionsManagerClient | undefined;
  private requestId = 0;

  private constructor(private readonly authManager: AuthManager) {}

  /**
   * Get singleton instance
   */
  public static getInstance(authManager: AuthManager): AssumptionsManagerClient {
    if (!AssumptionsManagerClient.instance) {
      AssumptionsManagerClient.instance = new AssumptionsManagerClient(authManager);
    }
    return AssumptionsManagerClient.instance;
  }

  /**
   * Dispose singleton instance
   */
  public static disposeInstance(): void {
    if (AssumptionsManagerClient.instance) {
      AssumptionsManagerClient.instance.dispose();
      AssumptionsManagerClient.instance = undefined;
    }
  }

  /**
   * List all available tables for the tenant
   */
  public async listTables(): Promise<AMTableInfo[]> {
    logger.debug('AMClient: Listing tables');

    const response = await this.request<ListTablesResponse>(
      'GET',
      '/tables'
    );

    logger.debug(`AMClient: Found ${response.tables.length} tables`);
    return response.tables;
  }

  /**
   * Get metadata for a specific table
   */
  public async getTable(name: string): Promise<AMTableInfo> {
    logger.debug(`AMClient: Getting table '${name}'`);

    // First, try to get by name (API might support name-based lookup)
    try {
      const response = await this.request<AMTableInfo>(
        'GET',
        `/tables/${encodeURIComponent(name)}`
      );
      return response;
    } catch (error) {
      // If direct lookup fails, search through all tables
      if (error instanceof AMClientError && error.code === 'NOT_FOUND') {
        const tables = await this.listTables();
        const table = tables.find(
          t => t.name.toLowerCase() === name.toLowerCase()
        );
        if (!table) {
          throw new AMClientError(
            `Table '${name}' not found`,
            'NOT_FOUND',
            404
          );
        }
        return table;
      }
      throw error;
    }
  }

  /**
   * List all versions for a table
   */
  public async listVersions(tableName: string): Promise<AMVersionInfo[]> {
    logger.debug(`AMClient: Listing versions for table '${tableName}'`);

    // Get table ID first (API uses IDs internally)
    const table = await this.getTable(tableName);

    const response = await this.request<ListVersionsResponse>(
      'GET',
      `/tables/${encodeURIComponent(table.id)}/versions`
    );

    logger.debug(
      `AMClient: Found ${response.versions.length} versions for '${tableName}'`
    );
    return response.versions;
  }

  /**
   * Get metadata for a specific version
   */
  public async getVersion(
    tableName: string,
    version: string
  ): Promise<AMVersionInfo> {
    logger.debug(`AMClient: Getting version '${version}' for table '${tableName}'`);

    // Handle special version aliases
    if (version === 'latest') {
      const table = await this.getTable(tableName);
      if (!table.latestApprovedVersion) {
        throw new AMClientError(
          `Table '${tableName}' has no approved versions`,
          'NOT_FOUND',
          404
        );
      }
      version = table.latestApprovedVersion;
    } else if (version === 'draft') {
      // Get all versions and find the draft
      const versions = await this.listVersions(tableName);
      const draftVersion = versions.find(v => v.status === 'draft');
      if (!draftVersion) {
        throw new AMClientError(
          `Table '${tableName}' has no draft version`,
          'NOT_FOUND',
          404
        );
      }
      return draftVersion;
    }

    // Get table ID
    const table = await this.getTable(tableName);

    const response = await this.request<AMVersionInfo>(
      'GET',
      `/tables/${encodeURIComponent(table.id)}/versions/${encodeURIComponent(version)}`
    );

    return response;
  }

  /**
   * Fetch table data for a specific version
   * Returns data as 2D array suitable for the engine
   */
  public async fetchData(
    tableName: string,
    version: string
  ): Promise<AMTableData> {
    logger.debug(`AMClient: Fetching data for '${tableName}:${version}'`);

    // Resolve version aliases
    let resolvedVersion = version;
    if (version === 'latest') {
      const table = await this.getTable(tableName);
      if (!table.latestApprovedVersion) {
        throw new AMClientError(
          `Table '${tableName}' has no approved versions`,
          'NOT_FOUND',
          404
        );
      }
      resolvedVersion = table.latestApprovedVersion;
      logger.debug(`AMClient: Resolved 'latest' to '${resolvedVersion}'`);
    } else if (version === 'draft') {
      const versions = await this.listVersions(tableName);
      const draftVersion = versions.find(v => v.status === 'draft');
      if (!draftVersion) {
        throw new AMClientError(
          `Table '${tableName}' has no draft version`,
          'NOT_FOUND',
          404
        );
      }
      resolvedVersion = draftVersion.version;
      logger.debug(`AMClient: Resolved 'draft' to '${resolvedVersion}'`);
    }

    // Get table ID
    const table = await this.getTable(tableName);

    const response = await this.request<AMTableData>(
      'GET',
      `/tables/${encodeURIComponent(table.id)}/versions/${encodeURIComponent(resolvedVersion)}/data`
    );

    // Ensure response has expected structure
    if (!response.columns || !response.rows) {
      throw new AMClientError(
        `Invalid data format from table '${tableName}'`,
        'SERVER_ERROR'
      );
    }

    logger.info(
      `AMClient: Fetched ${response.rows.length} rows for '${tableName}:${resolvedVersion}'`
    );

    return {
      ...response,
      tableName,
      version: resolvedVersion,
    };
  }

  /**
   * Get table ID by name (useful for other operations)
   */
  public async getTableId(tableName: string): Promise<string> {
    const table = await this.getTable(tableName);
    return table.id;
  }

  /**
   * Check if a table exists
   */
  public async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.getTable(tableName);
      return true;
    } catch (error) {
      if (error instanceof AMClientError && error.code === 'NOT_FOUND') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a specific version exists
   */
  public async versionExists(
    tableName: string,
    version: string
  ): Promise<boolean> {
    try {
      await this.getVersion(tableName, version);
      return true;
    } catch (error) {
      if (error instanceof AMClientError && error.code === 'NOT_FOUND') {
        return false;
      }
      throw error;
    }
  }

  // Private helper methods

  /**
   * Make an authenticated API request with retry logic
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const config = this.getConfig();
    const reqId = ++this.requestId;

    if (!config.url) {
      throw new AMClientError(
        'Assumptions Manager URL not configured',
        'NOT_CONFIGURED'
      );
    }

    // Get auth token
    const token = await this.authManager.getToken();
    if (!token) {
      throw new AMClientError(
        'Not authenticated with Assumptions Manager',
        'NOT_AUTHENTICATED'
      );
    }

    const url = `${config.url}${path}`;

    // Log request in debug mode
    logger.debug(
      `AMClient [${reqId}]: ${method} ${path}` +
        (body ? ` body=${JSON.stringify(body)}` : '')
    );

    const startTime = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        config.timeoutMs
      );

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const error = await this.parseError(response);

        // Log error
        logger.debug(
          `AMClient [${reqId}]: ${response.status} in ${elapsed}ms - ${error.message}`
        );

        // Check if we should retry
        if (error.isRetryable() && retryCount < MAX_RETRIES) {
          const delay = DEFAULT_RETRY_DELAYS[retryCount] || 4000;
          logger.debug(
            `AMClient [${reqId}]: Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
          );
          await this.sleep(delay);
          return this.request<T>(method, path, body, retryCount + 1);
        }

        throw error;
      }

      const data = (await response.json()) as T;

      // Log success
      logger.debug(`AMClient [${reqId}]: 200 in ${elapsed}ms`);

      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;

      if (error instanceof AMClientError) {
        throw error;
      }

      // Handle fetch errors (network issues, timeouts)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.debug(
        `AMClient [${reqId}]: Failed in ${elapsed}ms - ${errorMessage}`
      );

      const clientError = new AMClientError(
        `Network error: ${errorMessage}`,
        error instanceof Error && error.name === 'AbortError'
          ? 'TIMEOUT'
          : 'NETWORK_ERROR'
      );

      // Retry network errors
      if (clientError.isRetryable() && retryCount < MAX_RETRIES) {
        const delay = DEFAULT_RETRY_DELAYS[retryCount] || 4000;
        logger.debug(
          `AMClient [${reqId}]: Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        await this.sleep(delay);
        return this.request<T>(method, path, body, retryCount + 1);
      }

      throw clientError;
    }
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse error response from API
   */
  private async parseError(response: Response): Promise<AMClientError> {
    let message: string;
    let details: Record<string, unknown> | undefined;

    try {
      const errorBody = (await response.json()) as AMApiError;
      message = errorBody.message || `HTTP ${response.status}`;
      details = errorBody.details;
    } catch {
      message = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Map status codes to error codes with clear messages
    switch (response.status) {
      case 401:
        return new AMClientError(
          'Authentication failed - please login again',
          'UNAUTHORIZED',
          401,
          details
        );
      case 403:
        return new AMClientError(
          `Access denied - you don't have permission to access this resource`,
          'FORBIDDEN',
          403,
          details
        );
      case 404:
        return new AMClientError(
          message.includes('not found') ? message : 'Resource not found',
          'NOT_FOUND',
          404,
          details
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AMClientError(
          'Assumptions Manager server error - please try again later',
          'SERVER_ERROR',
          response.status,
          details
        );
      default:
        return new AMClientError(
          message,
          response.status >= 500 ? 'SERVER_ERROR' : 'NETWORK_ERROR',
          response.status,
          details
        );
    }
  }

  /**
   * Get configuration from VS Code settings
   */
  private getConfig(): AMConfig {
    return this.authManager.getConfig();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    // Nothing to dispose for now, but interface is here for future use
  }
}

/**
 * Helper function to dispose the singleton
 */
export function disposeAMClient(): void {
  AssumptionsManagerClient.disposeInstance();
}
