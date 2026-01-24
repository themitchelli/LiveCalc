/**
 * Assumption Reference Diagnostic Provider
 * Shows error squiggles for invalid assumptions:// references
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { AMTableInfo, AMVersionInfo } from './types';
import { ASSUMPTION_REFERENCE_PATTERN } from './hover-provider';

/**
 * Diagnostic provider for assumption references
 * Validates references and shows errors for:
 * - Invalid syntax
 * - Unknown tables
 * - Unknown versions
 * - Using draft/pending versions (as warnings)
 */
export class AssumptionDiagnosticProvider implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];

  // Cache for validation results
  private tablesCache: Map<string, AMTableInfo> | null = null;
  private versionsCache = new Map<string, AMVersionInfo[]>();
  private cacheTimestamp = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  // Debounce validation
  private validationTimeout: NodeJS.Timeout | undefined;
  private readonly debounceMs = 500;

  constructor(private readonly authManager: AuthManager) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('livecalc-assumptions');
    this.disposables.push(this.diagnosticCollection);

    // Listen for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isRelevantDocument(event.document)) {
          this.scheduleValidation(event.document);
        }
      })
    );

    // Listen for document open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(document => {
        if (this.isRelevantDocument(document)) {
          this.scheduleValidation(document);
        }
      })
    );

    // Listen for document close
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        this.diagnosticCollection.delete(document.uri);
      })
    );

    // Listen for auth state changes
    this.disposables.push(
      authManager.onDidLogin(() => {
        this.clearCache();
        this.validateAllOpenDocuments();
      })
    );

    this.disposables.push(
      authManager.onDidLogout(() => {
        this.clearCache();
        this.clearAllDiagnostics();
      })
    );

    // Validate all currently open documents
    this.validateAllOpenDocuments();
  }

  /**
   * Check if a document should be validated
   */
  private isRelevantDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'mga' ||
           document.languageId === 'json' ||
           document.fileName.endsWith('livecalc.config.json');
  }

  /**
   * Schedule validation with debouncing
   */
  private scheduleValidation(document: vscode.TextDocument): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    this.validationTimeout = setTimeout(() => {
      this.validateDocument(document);
    }, this.debounceMs);
  }

  /**
   * Validate all open documents
   */
  private validateAllOpenDocuments(): void {
    for (const document of vscode.workspace.textDocuments) {
      if (this.isRelevantDocument(document)) {
        this.validateDocument(document);
      }
    }
  }

  /**
   * Validate a single document
   */
  public async validateDocument(document: vscode.TextDocument): Promise<void> {
    if (!this.authManager.isAuthenticated()) {
      // If not authenticated, only show syntax errors
      const diagnostics = this.validateSyntaxOnly(document);
      this.diagnosticCollection.set(document.uri, diagnostics);
      return;
    }

    // Full validation with API checks
    const diagnostics = await this.validateWithApi(document);
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Validate syntax only (no API calls)
   */
  private validateSyntaxOnly(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Find malformed assumptions:// references
    const malformedPattern = /assumptions:\/\/[^\s"'`]*(?=[\s"'`]|$)/g;
    const validPattern = /^assumptions:\/\/[a-zA-Z0-9_-]+:(v?[0-9.]+|latest|draft)$/;

    let match;
    while ((match = malformedPattern.exec(text)) !== null) {
      const reference = match[0];

      // Skip if it's valid
      if (validPattern.test(reference)) {
        continue;
      }

      // Check what's wrong
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + reference.length);
      const range = new vscode.Range(startPos, endPos);

      let message: string;
      if (!reference.includes(':')) {
        message = `Invalid assumption reference: missing version. Expected format: assumptions://table-name:version`;
      } else if (reference.endsWith(':')) {
        message = `Invalid assumption reference: version required after colon`;
      } else {
        message = `Invalid assumption reference syntax. Expected format: assumptions://table-name:version (where version is 'latest', 'draft', or a version number like 'v1.0')`;
      }

      diagnostics.push(new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      ));
    }

    return diagnostics;
  }

  /**
   * Validate with API (checks if tables/versions exist)
   */
  private async validateWithApi(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Start with syntax validation
    diagnostics.push(...this.validateSyntaxOnly(document));

    // Ensure cache is fresh
    await this.ensureCacheLoaded();

    if (!this.tablesCache) {
      // API call failed, return only syntax errors
      return diagnostics;
    }

    // Validate each reference
    ASSUMPTION_REFERENCE_PATTERN.lastIndex = 0;
    let match;
    while ((match = ASSUMPTION_REFERENCE_PATTERN.exec(text)) !== null) {
      const reference = match[0];
      const tableName = match[1];
      const version = match[2];

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + reference.length);
      const range = new vscode.Range(startPos, endPos);

      // Check if table exists
      const tableInfo = this.tablesCache.get(tableName);
      if (!tableInfo) {
        diagnostics.push(new vscode.Diagnostic(
          range,
          `Table "${tableName}" not found in Assumptions Manager`,
          vscode.DiagnosticSeverity.Error
        ));
        continue;
      }

      // For specific versions, check if version exists
      if (version !== 'latest' && version !== 'draft') {
        const versions = this.versionsCache.get(tableName);
        if (versions) {
          const normalizedVersion = version.startsWith('v') ? version : `v${version}`;
          const versionExists = versions.some(v =>
            v.version === version ||
            v.version === normalizedVersion ||
            `v${v.version}` === normalizedVersion
          );

          if (!versionExists) {
            diagnostics.push(new vscode.Diagnostic(
              range,
              `Version "${version}" not found for table "${tableName}"`,
              vscode.DiagnosticSeverity.Error
            ));
            continue;
          }

          // Check if version is approved (warning if not)
          const versionInfo = versions.find(v =>
            v.version === version ||
            v.version === normalizedVersion ||
            `v${v.version}` === normalizedVersion
          );

          if (versionInfo && versionInfo.status !== 'approved') {
            diagnostics.push(new vscode.Diagnostic(
              range,
              `Version "${version}" is ${versionInfo.status} - not approved for production use`,
              vscode.DiagnosticSeverity.Warning
            ));
          }
        }
      }

      // Warn about 'draft' usage
      if (version === 'draft') {
        diagnostics.push(new vscode.Diagnostic(
          range,
          `Using draft version - not approved for production use`,
          vscode.DiagnosticSeverity.Warning
        ));
      }
    }

    return diagnostics;
  }

  /**
   * Ensure cache is loaded and fresh
   */
  private async ensureCacheLoaded(): Promise<void> {
    // Check if cache is fresh
    if (this.tablesCache && Date.now() - this.cacheTimestamp < this.cacheTtlMs) {
      return;
    }

    try {
      const token = await this.authManager.getToken();
      if (!token) {
        this.tablesCache = null;
        return;
      }

      const config = this.authManager.getConfig();

      // Fetch all tables
      const response = await this.fetchWithAuth<{ tables: AMTableInfo[] }>(
        `${config.url}/tables`,
        token,
        config.timeoutMs
      );

      this.tablesCache = new Map();
      for (const table of response.tables || []) {
        this.tablesCache.set(table.name, table);
      }

      // Fetch versions for each table (in parallel)
      const versionPromises = Array.from(this.tablesCache.entries()).map(async ([name, table]) => {
        try {
          const versionsResponse = await this.fetchWithAuth<{ versions: AMVersionInfo[] }>(
            `${config.url}/tables/${table.id}/versions`,
            token,
            config.timeoutMs
          );
          this.versionsCache.set(name, versionsResponse.versions || []);
        } catch {
          // Ignore individual version fetch failures
          logger.debug(`Failed to fetch versions for table ${name}`);
        }
      });

      await Promise.allSettled(versionPromises);
      this.cacheTimestamp = Date.now();

      logger.debug(`AssumptionDiagnosticProvider: Cached ${this.tablesCache.size} tables`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`AssumptionDiagnosticProvider: Failed to load table cache: ${message}`);
      this.tablesCache = null;
    }
  }

  /**
   * Fetch with authorization header
   */
  private async fetchWithAuth<T>(url: string, token: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.tablesCache = null;
    this.versionsCache.clear();
    this.cacheTimestamp = 0;
    logger.debug('AssumptionDiagnosticProvider: Cache cleared');
  }

  /**
   * Clear all diagnostics
   */
  private clearAllDiagnostics(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Refresh validation (e.g., after cache invalidation)
   */
  public refresh(): void {
    this.clearCache();
    this.validateAllOpenDocuments();
  }

  public dispose(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
