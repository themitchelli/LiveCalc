/**
 * Assumption Reference Hover Provider
 * Shows table metadata when hovering over assumptions:// references
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { AMTableInfo, AMVersionInfo } from './types';

/**
 * Regex pattern for assumption references
 * Matches: assumptions://table-name:version
 * Where version can be: v1.0, 1.0, latest, draft
 */
export const ASSUMPTION_REFERENCE_PATTERN = /assumptions:\/\/([a-zA-Z0-9_-]+):(v?[0-9.]+|latest|draft)/g;

/**
 * Parse an assumption reference string
 */
export function parseAssumptionReference(reference: string): { tableName: string; version: string } | null {
  const match = /^assumptions:\/\/([a-zA-Z0-9_-]+):(v?[0-9.]+|latest|draft)$/.exec(reference);
  if (!match) {
    return null;
  }
  return {
    tableName: match[1],
    version: match[2],
  };
}

/**
 * Find assumption reference at a position in a document
 */
export function findAssumptionReferenceAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): { reference: string; range: vscode.Range; tableName: string; version: string } | null {
  const line = document.lineAt(position.line).text;

  // Reset regex state
  ASSUMPTION_REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = ASSUMPTION_REFERENCE_PATTERN.exec(line)) !== null) {
    const startCol = match.index;
    const endCol = match.index + match[0].length;

    // Check if position is within this match
    if (position.character >= startCol && position.character <= endCol) {
      const range = new vscode.Range(
        position.line, startCol,
        position.line, endCol
      );
      return {
        reference: match[0],
        range,
        tableName: match[1],
        version: match[2],
      };
    }
  }

  return null;
}

/**
 * Hover provider for assumption references in MGA and JSON files
 */
export class AssumptionHoverProvider implements vscode.HoverProvider {
  // Cache for table metadata to avoid repeated API calls
  private tableCache = new Map<string, { info: AMTableInfo; versions: AMVersionInfo[]; fetchedAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly authManager: AuthManager) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const refInfo = findAssumptionReferenceAtPosition(document, position);
    if (!refInfo) {
      return null;
    }

    logger.debug(`AssumptionHoverProvider: Hover on ${refInfo.reference}`);

    // Build hover content
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Check if authenticated with AM
    if (!this.authManager.isAuthenticated()) {
      markdown.appendMarkdown(`**${refInfo.reference}**\n\n`);
      markdown.appendMarkdown('---\n\n');
      markdown.appendMarkdown('⚠️ *Not connected to Assumptions Manager*\n\n');
      markdown.appendMarkdown('[Login to Assumptions Manager](command:livecalc.amLogin) to view table metadata.');
      return new vscode.Hover(markdown, refInfo.range);
    }

    // Try to fetch table metadata
    const tableData = await this.getTableMetadata(refInfo.tableName);

    if (!tableData) {
      markdown.appendMarkdown(`**${refInfo.reference}**\n\n`);
      markdown.appendMarkdown('---\n\n');
      markdown.appendMarkdown(`❌ *Table "${refInfo.tableName}" not found*\n\n`);
      markdown.appendMarkdown('Check the table name and ensure you have access.');
      return new vscode.Hover(markdown, refInfo.range);
    }

    // Find the specific version if not 'latest' or 'draft'
    const versionInfo = this.findVersion(tableData.versions, refInfo.version);

    // Build rich hover content
    markdown.appendMarkdown(`**${refInfo.tableName}**`);
    if (versionInfo) {
      markdown.appendMarkdown(` \`${versionInfo.version}\``);
    } else if (refInfo.version === 'latest') {
      markdown.appendMarkdown(` \`latest → ${tableData.info.latestApprovedVersion || 'none'}\``);
    } else if (refInfo.version === 'draft') {
      markdown.appendMarkdown(` \`draft\``);
    } else {
      markdown.appendMarkdown(` \`${refInfo.version}\` ⚠️ *version not found*`);
    }
    markdown.appendMarkdown('\n\n---\n\n');

    // Table description
    if (tableData.info.description) {
      markdown.appendMarkdown(`*${tableData.info.description}*\n\n`);
    }

    // Table type
    markdown.appendMarkdown(`**Type:** ${tableData.info.type}\n\n`);

    // Version status
    if (versionInfo) {
      const statusIcon = this.getStatusIcon(versionInfo.status);
      markdown.appendMarkdown(`**Status:** ${statusIcon} ${versionInfo.status}\n\n`);

      if (versionInfo.approvedBy && versionInfo.approvedAt) {
        const approvedDate = new Date(versionInfo.approvedAt).toLocaleDateString();
        markdown.appendMarkdown(`**Approved:** ${approvedDate} by ${versionInfo.approvedBy}\n\n`);
      }

      if (versionInfo.changeNotes) {
        markdown.appendMarkdown(`**Notes:** ${versionInfo.changeNotes}\n\n`);
      }
    }

    // Available versions summary
    const approvedCount = tableData.versions.filter(v => v.status === 'approved').length;
    const draftCount = tableData.versions.filter(v => v.status === 'draft').length;
    markdown.appendMarkdown(`**Versions:** ${approvedCount} approved, ${draftCount} draft\n\n`);

    // Warning for draft/pending versions
    if (versionInfo && (versionInfo.status === 'draft' || versionInfo.status === 'pending')) {
      markdown.appendMarkdown(`\n⚠️ *Using ${versionInfo.status} version - not approved for production*\n\n`);
    }

    // Links
    markdown.appendMarkdown('---\n\n');
    const amUrl = this.authManager.getConfig().url;
    if (amUrl) {
      markdown.appendMarkdown(`[Open in Assumptions Manager](${amUrl}/tables/${tableData.info.id})`);
    }

    return new vscode.Hover(markdown, refInfo.range);
  }

  /**
   * Get table metadata from cache or API
   */
  private async getTableMetadata(tableName: string): Promise<{ info: AMTableInfo; versions: AMVersionInfo[] } | null> {
    // Check cache
    const cached = this.tableCache.get(tableName);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      logger.debug(`AssumptionHoverProvider: Cache hit for ${tableName}`);
      return cached;
    }

    // Fetch from API
    try {
      const token = await this.authManager.getToken();
      if (!token) {
        return null;
      }

      const config = this.authManager.getConfig();
      const baseUrl = config.url;

      // Fetch table info
      const tableResponse = await this.fetchWithAuth<{ tables: AMTableInfo[] }>(
        `${baseUrl}/tables?name=${encodeURIComponent(tableName)}`,
        token,
        config.timeoutMs
      );

      const tableInfo = tableResponse.tables?.find(t => t.name === tableName);
      if (!tableInfo) {
        return null;
      }

      // Fetch versions
      const versionsResponse = await this.fetchWithAuth<{ versions: AMVersionInfo[] }>(
        `${baseUrl}/tables/${tableInfo.id}/versions`,
        token,
        config.timeoutMs
      );

      const result = {
        info: tableInfo,
        versions: versionsResponse.versions || [],
        fetchedAt: Date.now(),
      };

      // Cache result
      this.tableCache.set(tableName, result);
      logger.debug(`AssumptionHoverProvider: Fetched and cached metadata for ${tableName}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`AssumptionHoverProvider: Failed to fetch metadata for ${tableName}: ${message}`);
      return null;
    }
  }

  /**
   * Find a specific version in the versions list
   */
  private findVersion(versions: AMVersionInfo[], versionStr: string): AMVersionInfo | null {
    if (versionStr === 'latest') {
      // Find latest approved version
      return versions.filter(v => v.status === 'approved')
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0] || null;
    }

    if (versionStr === 'draft') {
      // Find latest draft
      return versions.filter(v => v.status === 'draft')
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0] || null;
    }

    // Find exact version (with or without 'v' prefix)
    const normalizedVersion = versionStr.startsWith('v') ? versionStr : `v${versionStr}`;
    return versions.find(v =>
      v.version === versionStr ||
      v.version === normalizedVersion ||
      `v${v.version}` === normalizedVersion
    ) || null;
  }

  /**
   * Get status icon for version status
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'approved':
        return '✅';
      case 'draft':
        return '📝';
      case 'pending':
        return '⏳';
      case 'rejected':
        return '❌';
      default:
        return '❓';
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
   * Clear the metadata cache
   */
  public clearCache(): void {
    this.tableCache.clear();
    logger.debug('AssumptionHoverProvider: Cache cleared');
  }
}
