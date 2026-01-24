/**
 * Assumption Reference Definition Provider
 * Enables Ctrl+Click on assumptions:// references to open in Assumptions Manager
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { findAssumptionReferenceAtPosition } from './hover-provider';
import { AMTableInfo } from './types';

/**
 * Definition provider for assumption references
 * Ctrl+Click opens the table in Assumptions Manager (browser)
 */
export class AssumptionDefinitionProvider implements vscode.DefinitionProvider {
  // Cache for table ID lookups
  private tableIdCache = new Map<string, { id: string; fetchedAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly authManager: AuthManager) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
    const refInfo = findAssumptionReferenceAtPosition(document, position);
    if (!refInfo) {
      return null;
    }

    logger.debug(`AssumptionDefinitionProvider: Definition request for ${refInfo.reference}`);

    const config = this.authManager.getConfig();
    if (!config.url) {
      vscode.window.showWarningMessage('Assumptions Manager URL not configured. Set livecalc.assumptionsManager.url in settings.');
      return null;
    }

    // Get table ID if authenticated
    let tableId: string | null = null;
    if (this.authManager.isAuthenticated()) {
      tableId = await this.getTableId(refInfo.tableName);
    }

    // Build URL to open in browser
    let url: string;
    if (tableId) {
      // Direct link to table
      url = `${config.url}/tables/${tableId}`;
      if (refInfo.version !== 'latest' && refInfo.version !== 'draft') {
        url += `/versions/${refInfo.version}`;
      }
    } else {
      // Fallback to search
      url = `${config.url}/tables?search=${encodeURIComponent(refInfo.tableName)}`;
    }

    // Open in browser
    vscode.env.openExternal(vscode.Uri.parse(url));

    // Return null - we handled this via browser, not by jumping to a file location
    return null;
  }

  /**
   * Get table ID from name (for direct linking)
   */
  private async getTableId(tableName: string): Promise<string | null> {
    // Check cache
    const cached = this.tableIdCache.get(tableName);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.id;
    }

    try {
      const token = await this.authManager.getToken();
      if (!token) {
        return null;
      }

      const config = this.authManager.getConfig();
      const response = await this.fetchWithAuth<{ tables: AMTableInfo[] }>(
        `${config.url}/tables?name=${encodeURIComponent(tableName)}`,
        token,
        config.timeoutMs
      );

      const table = response.tables?.find(t => t.name === tableName);
      if (table) {
        this.tableIdCache.set(tableName, { id: table.id, fetchedAt: Date.now() });
        return table.id;
      }

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`AssumptionDefinitionProvider: Failed to get table ID for ${tableName}: ${message}`);
      return null;
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
    this.tableIdCache.clear();
    logger.debug('AssumptionDefinitionProvider: Cache cleared');
  }
}

/**
 * Document link provider for assumption references
 * Makes assumptions:// references clickable links in the editor
 */
export class AssumptionDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly authManager: AuthManager) {}

  public provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const pattern = /assumptions:\/\/([a-zA-Z0-9_-]+):(v?[0-9.]+|latest|draft)/g;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      // Create a command URI that will open in browser
      const config = this.authManager.getConfig();
      const tableName = match[1];
      const version = match[2];

      if (config.url) {
        // Use a command URI to handle the click
        const link = new vscode.DocumentLink(range);
        link.tooltip = `Open ${tableName}:${version} in Assumptions Manager`;
        links.push(link);
      }
    }

    return links;
  }

  public async resolveDocumentLink(
    link: vscode.DocumentLink,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink | null> {
    // The actual navigation is handled by the definition provider
    // when the user Ctrl+Clicks
    return link;
  }
}
