/**
 * Assumption Reference Completion Provider
 * Provides autocomplete for assumptions:// references
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { AMTableInfo, AMVersionInfo } from './types';

/**
 * Completion provider for assumption references
 * Triggers on 'assumptions://' and after table name + ':'
 */
export class AssumptionCompletionProvider implements vscode.CompletionItemProvider {
  // Cache for table list and versions
  private tablesCache: { tables: AMTableInfo[]; fetchedAt: number } | null = null;
  private versionsCache = new Map<string, { versions: AMVersionInfo[]; fetchedAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly authManager: AuthManager) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
    const line = document.lineAt(position.line).text;
    const textBeforeCursor = line.substring(0, position.character);

    // Check if we're completing table names (after 'assumptions://')
    const tableNameMatch = /assumptions:\/\/([a-zA-Z0-9_-]*)$/.exec(textBeforeCursor);
    if (tableNameMatch) {
      return this.provideTableNameCompletions(tableNameMatch[1]);
    }

    // Check if we're completing versions (after 'assumptions://table-name:')
    const versionMatch = /assumptions:\/\/([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]*)$/.exec(textBeforeCursor);
    if (versionMatch) {
      return this.provideVersionCompletions(versionMatch[1], versionMatch[2]);
    }

    // Check if we should trigger 'assumptions://' snippet
    // This triggers when user types 'assu' or similar
    const assumptionsTriggerMatch = /["']?(assu[a-z]*)$/i.exec(textBeforeCursor);
    if (assumptionsTriggerMatch) {
      return this.provideAssumptionsSnippet();
    }

    return null;
  }

  /**
   * Provide table name completions
   */
  private async provideTableNameCompletions(partial: string): Promise<vscode.CompletionItem[]> {
    if (!this.authManager.isAuthenticated()) {
      logger.debug('AssumptionCompletionProvider: Not authenticated, no completions');
      return [];
    }

    const tables = await this.getTablesList();
    if (!tables) {
      return [];
    }

    // Filter tables by partial match
    const filtered = tables.filter(t =>
      t.name.toLowerCase().includes(partial.toLowerCase())
    );

    return filtered.map(table => {
      const item = new vscode.CompletionItem(table.name, vscode.CompletionItemKind.Module);
      item.detail = table.type;
      item.documentation = new vscode.MarkdownString();
      item.documentation.appendMarkdown(`**${table.name}**\n\n`);
      if (table.description) {
        item.documentation.appendMarkdown(`${table.description}\n\n`);
      }
      item.documentation.appendMarkdown(`Type: ${table.type}\n\n`);
      if (table.latestApprovedVersion) {
        item.documentation.appendMarkdown(`Latest approved: ${table.latestApprovedVersion}`);
      }

      // Insert text includes the colon to trigger version completion
      item.insertText = table.name + ':';
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: 'Trigger Suggest',
      };

      // Sort by type relevance and name
      item.sortText = this.getSortPrefix(table.type) + table.name;

      return item;
    });
  }

  /**
   * Provide version completions for a specific table
   */
  private async provideVersionCompletions(tableName: string, partial: string): Promise<vscode.CompletionItem[]> {
    if (!this.authManager.isAuthenticated()) {
      return [];
    }

    const versions = await this.getTableVersions(tableName);
    if (!versions) {
      // Table might not exist - provide suggestions anyway
      return this.getDefaultVersionCompletions();
    }

    const items: vscode.CompletionItem[] = [];

    // Add 'latest' option
    const latestItem = new vscode.CompletionItem('latest', vscode.CompletionItemKind.Value);
    latestItem.detail = 'Latest approved version';
    latestItem.documentation = new vscode.MarkdownString('Uses the most recent approved version. Always fetches to ensure current data.');
    latestItem.sortText = '0-latest';
    if ('latest'.includes(partial.toLowerCase())) {
      items.push(latestItem);
    }

    // Add 'draft' option if there are drafts
    const hasDrafts = versions.some(v => v.status === 'draft');
    if (hasDrafts) {
      const draftItem = new vscode.CompletionItem('draft', vscode.CompletionItemKind.Value);
      draftItem.detail = 'Current draft version';
      draftItem.documentation = new vscode.MarkdownString('⚠️ Uses the latest draft version. Not approved for production.');
      draftItem.sortText = '1-draft';
      if ('draft'.includes(partial.toLowerCase())) {
        items.push(draftItem);
      }
    }

    // Add specific versions
    const approvedVersions = versions.filter(v => v.status === 'approved');
    const sortedVersions = approvedVersions.sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true })
    );

    for (const version of sortedVersions) {
      if (version.version.toLowerCase().includes(partial.toLowerCase()) ||
          `v${version.version}`.toLowerCase().includes(partial.toLowerCase())) {
        const item = new vscode.CompletionItem(version.version, vscode.CompletionItemKind.Constant);
        item.detail = this.getStatusLabel(version.status);
        item.documentation = new vscode.MarkdownString();
        item.documentation.appendMarkdown(`**Version ${version.version}**\n\n`);
        item.documentation.appendMarkdown(`Status: ${this.getStatusIcon(version.status)} ${version.status}\n\n`);
        if (version.approvedAt && version.approvedBy) {
          const date = new Date(version.approvedAt).toLocaleDateString();
          item.documentation.appendMarkdown(`Approved: ${date} by ${version.approvedBy}\n\n`);
        }
        if (version.changeNotes) {
          item.documentation.appendMarkdown(`Notes: ${version.changeNotes}`);
        }

        // Sort by version number (descending)
        item.sortText = `2-${String(1000 - sortedVersions.indexOf(version)).padStart(4, '0')}`;

        items.push(item);
      }
    }

    // If we have pending/draft versions, add them too (at the bottom)
    const otherVersions = versions.filter(v => v.status !== 'approved');
    for (const version of otherVersions) {
      if (version.version.toLowerCase().includes(partial.toLowerCase())) {
        const item = new vscode.CompletionItem(version.version, vscode.CompletionItemKind.Constant);
        item.detail = `${this.getStatusIcon(version.status)} ${version.status}`;
        item.sortText = `3-${version.version}`;
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Provide default version completions when table not found
   */
  private getDefaultVersionCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    const latestItem = new vscode.CompletionItem('latest', vscode.CompletionItemKind.Value);
    latestItem.detail = 'Latest approved version';
    latestItem.sortText = '0-latest';
    items.push(latestItem);

    const draftItem = new vscode.CompletionItem('draft', vscode.CompletionItemKind.Value);
    draftItem.detail = 'Current draft (if permitted)';
    draftItem.sortText = '1-draft';
    items.push(draftItem);

    return items;
  }

  /**
   * Provide the 'assumptions://' snippet
   */
  private provideAssumptionsSnippet(): vscode.CompletionItem[] {
    const item = new vscode.CompletionItem('assumptions://', vscode.CompletionItemKind.Snippet);
    item.detail = 'Assumption Manager reference';
    item.documentation = new vscode.MarkdownString('Reference a governed assumption table from Assumptions Manager.\n\nFormat: `assumptions://table-name:version`');
    item.insertText = new vscode.SnippetString('assumptions://${1:table-name}:${2:latest}');
    item.filterText = 'assumptions';
    item.sortText = '0-assumptions';

    // Trigger completion after inserting
    item.command = {
      command: 'editor.action.triggerSuggest',
      title: 'Trigger Suggest',
    };

    return [item];
  }

  /**
   * Get list of available tables
   */
  private async getTablesList(): Promise<AMTableInfo[] | null> {
    // Check cache
    if (this.tablesCache && Date.now() - this.tablesCache.fetchedAt < this.cacheTtlMs) {
      return this.tablesCache.tables;
    }

    try {
      const token = await this.authManager.getToken();
      if (!token) {
        return null;
      }

      const config = this.authManager.getConfig();
      const response = await this.fetchWithAuth<{ tables: AMTableInfo[] }>(
        `${config.url}/tables`,
        token,
        config.timeoutMs
      );

      this.tablesCache = {
        tables: response.tables || [],
        fetchedAt: Date.now(),
      };

      logger.debug(`AssumptionCompletionProvider: Fetched ${this.tablesCache.tables.length} tables`);
      return this.tablesCache.tables;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`AssumptionCompletionProvider: Failed to fetch tables: ${message}`);
      return null;
    }
  }

  /**
   * Get versions for a specific table
   */
  private async getTableVersions(tableName: string): Promise<AMVersionInfo[] | null> {
    // Check cache
    const cached = this.versionsCache.get(tableName);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.versions;
    }

    try {
      const token = await this.authManager.getToken();
      if (!token) {
        return null;
      }

      const config = this.authManager.getConfig();

      // First find the table ID
      const tablesResponse = await this.fetchWithAuth<{ tables: AMTableInfo[] }>(
        `${config.url}/tables?name=${encodeURIComponent(tableName)}`,
        token,
        config.timeoutMs
      );

      const table = tablesResponse.tables?.find(t => t.name === tableName);
      if (!table) {
        return null;
      }

      // Then get versions
      const versionsResponse = await this.fetchWithAuth<{ versions: AMVersionInfo[] }>(
        `${config.url}/tables/${table.id}/versions`,
        token,
        config.timeoutMs
      );

      const result = {
        versions: versionsResponse.versions || [],
        fetchedAt: Date.now(),
      };

      this.versionsCache.set(tableName, result);
      logger.debug(`AssumptionCompletionProvider: Fetched ${result.versions.length} versions for ${tableName}`);

      return result.versions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`AssumptionCompletionProvider: Failed to fetch versions for ${tableName}: ${message}`);
      return null;
    }
  }

  /**
   * Get sort prefix based on table type
   */
  private getSortPrefix(type: string): string {
    switch (type) {
      case 'mortality':
        return '0-';
      case 'lapse':
        return '1-';
      case 'expense':
        return '2-';
      default:
        return '3-';
    }
  }

  /**
   * Get status label
   */
  private getStatusLabel(status: string): string {
    switch (status) {
      case 'approved':
        return '✓ Approved';
      case 'draft':
        return '📝 Draft';
      case 'pending':
        return '⏳ Pending';
      case 'rejected':
        return '❌ Rejected';
      default:
        return status;
    }
  }

  /**
   * Get status icon
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
   * Clear all caches
   */
  public clearCache(): void {
    this.tablesCache = null;
    this.versionsCache.clear();
    logger.debug('AssumptionCompletionProvider: Cache cleared');
  }
}
