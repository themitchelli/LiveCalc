/**
 * Assumptions Tree View Provider
 * Provides a tree view in the Explorer sidebar showing available assumptions
 * from both Assumptions Manager and local files
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';
import { AssumptionsManagerClient, AMClientError } from './client';
import { AMTableInfo, AMVersionInfo, AMConnectionState } from './types';
import { ConfigLoader } from '../config/config-loader';
import { LiveCalcConfig } from '../types';

/**
 * Tree item types
 */
export type TreeItemType =
  | 'root-am'
  | 'root-local'
  | 'table'
  | 'version'
  | 'local-file'
  | 'loading'
  | 'error'
  | 'message';

/**
 * Custom tree item data
 */
export interface AssumptionTreeItemData {
  type: TreeItemType;
  // For table items
  table?: AMTableInfo;
  // For version items
  version?: AMVersionInfo;
  tableName?: string;
  tableId?: string;
  // For local file items
  filePath?: string;
  fileType?: 'mortality' | 'lapse' | 'expenses';
  // For error/message items
  message?: string;
}

/**
 * Custom tree item for assumptions
 */
export class AssumptionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: AssumptionTreeItemData
  ) {
    super(label, collapsibleState);
    this.contextValue = data.type;
    this.setupItem();
  }

  private setupItem(): void {
    switch (this.data.type) {
      case 'root-am':
        this.iconPath = new vscode.ThemeIcon('cloud');
        this.description = 'Governed assumptions';
        break;

      case 'root-local':
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = 'Local files';
        break;

      case 'table':
        this.setupTableItem();
        break;

      case 'version':
        this.setupVersionItem();
        break;

      case 'local-file':
        this.setupLocalFileItem();
        break;

      case 'loading':
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.description = 'Loading...';
        break;

      case 'error':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        this.description = this.data.message;
        break;

      case 'message':
        this.iconPath = new vscode.ThemeIcon('info');
        this.description = '';
        break;
    }
  }

  private setupTableItem(): void {
    const table = this.data.table;
    if (!table) return;

    // Icon based on table type
    switch (table.type) {
      case 'mortality':
        this.iconPath = new vscode.ThemeIcon('pulse');
        break;
      case 'lapse':
        this.iconPath = new vscode.ThemeIcon('arrow-right');
        break;
      case 'expense':
        this.iconPath = new vscode.ThemeIcon('credit-card');
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('table');
    }

    // Description shows latest version
    if (table.latestApprovedVersion) {
      this.description = `Latest: ${table.latestApprovedVersion}`;
    }

    // Tooltip with full info
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${table.name}**\n\n`);
    if (table.description) {
      this.tooltip.appendMarkdown(`${table.description}\n\n`);
    }
    this.tooltip.appendMarkdown(`- Type: ${table.type}\n`);
    if (table.latestApprovedVersion) {
      this.tooltip.appendMarkdown(`- Latest approved: ${table.latestApprovedVersion}\n`);
    }
    this.tooltip.appendMarkdown(`- Updated: ${new Date(table.updatedAt).toLocaleDateString()}\n`);
  }

  private setupVersionItem(): void {
    const version = this.data.version;
    if (!version) return;

    // Icon and color based on status
    switch (version.status) {
      case 'approved':
        this.iconPath = new vscode.ThemeIcon('verified', new vscode.ThemeColor('testing.iconPassed'));
        this.description = 'Approved';
        break;
      case 'draft':
        this.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('editorWarning.foreground'));
        this.description = 'Draft';
        break;
      case 'pending':
        this.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('editorWarning.foreground'));
        this.description = 'Pending approval';
        break;
      case 'rejected':
        this.iconPath = new vscode.ThemeIcon('close', new vscode.ThemeColor('errorForeground'));
        this.description = 'Rejected';
        break;
    }

    // Tooltip with version details
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${this.data.tableName}:${version.version}**\n\n`);
    this.tooltip.appendMarkdown(`- Status: ${version.status}\n`);
    if (version.approvedBy) {
      this.tooltip.appendMarkdown(`- Approved by: ${version.approvedBy}\n`);
    }
    if (version.approvedAt) {
      this.tooltip.appendMarkdown(`- Approved: ${new Date(version.approvedAt).toLocaleDateString()}\n`);
    }
    if (version.changeNotes) {
      this.tooltip.appendMarkdown(`\n${version.changeNotes}\n`);
    }
    this.tooltip.appendMarkdown(`\n*Double-click to insert reference*`);

    // Command to insert reference on double-click
    this.command = {
      command: 'livecalc.amInsertReference',
      title: 'Insert Reference',
      arguments: [this.data.tableName, version.version],
    };
  }

  private setupLocalFileItem(): void {
    const filePath = this.data.filePath;
    if (!filePath) return;

    // Icon based on file type
    switch (this.data.fileType) {
      case 'mortality':
        this.iconPath = new vscode.ThemeIcon('pulse');
        break;
      case 'lapse':
        this.iconPath = new vscode.ThemeIcon('arrow-right');
        break;
      case 'expenses':
        this.iconPath = new vscode.ThemeIcon('credit-card');
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('file');
    }

    // Show file extension in description
    const ext = path.extname(filePath);
    this.description = ext;

    // Tooltip with full path
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${this.label}**\n\n`);
    this.tooltip.appendMarkdown(`Path: \`${filePath}\`\n\n`);
    this.tooltip.appendMarkdown(`*Click to open file*`);

    // Command to open file on click
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(filePath)],
    };

    // Resource URI for file decorations
    this.resourceUri = vscode.Uri.file(filePath);
  }
}

/**
 * AssumptionTreeDataProvider provides tree view data for the Assumptions panel
 */
export class AssumptionTreeDataProvider
  implements vscode.TreeDataProvider<AssumptionTreeItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<AssumptionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];
  private tablesCache: AMTableInfo[] | undefined;
  private versionsCache: Map<string, AMVersionInfo[]> = new Map();
  private isLoading = false;
  private loadError: string | undefined;
  private filterText = '';

  constructor(
    private readonly authManager: AuthManager,
    private readonly configLoader: ConfigLoader
  ) {
    // Listen for auth state changes
    this.disposables.push(
      authManager.onDidChangeState(() => {
        this.clearCache();
        this.refresh();
      })
    );

    this.disposables.push(
      authManager.onDidLogin(() => {
        this.clearCache();
        this.refresh();
      })
    );

    this.disposables.push(
      authManager.onDidLogout(() => {
        this.clearCache();
        this.refresh();
      })
    );
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    logger.debug('AssumptionTreeDataProvider: Refreshing');
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear cached data and refresh
   */
  public clearCache(): void {
    this.tablesCache = undefined;
    this.versionsCache.clear();
    this.loadError = undefined;
  }

  /**
   * Set filter text
   */
  public setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this.refresh();
  }

  /**
   * Get tree item for an element
   */
  public getTreeItem(element: AssumptionTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of an element
   */
  public async getChildren(element?: AssumptionTreeItem): Promise<AssumptionTreeItem[]> {
    // Root level - show AM and Local sections
    if (!element) {
      return this.getRootChildren();
    }

    // Handle different node types
    switch (element.data.type) {
      case 'root-am':
        return this.getAMTableChildren();

      case 'root-local':
        return this.getLocalFileChildren();

      case 'table':
        return this.getVersionChildren(element);

      default:
        return [];
    }
  }

  /**
   * Get root level children (AM and Local sections)
   */
  private async getRootChildren(): Promise<AssumptionTreeItem[]> {
    const items: AssumptionTreeItem[] = [];

    // Assumptions Manager section
    const amItem = new AssumptionTreeItem(
      'Assumptions Manager',
      vscode.TreeItemCollapsibleState.Expanded,
      { type: 'root-am' }
    );
    items.push(amItem);

    // Local Files section
    const localItem = new AssumptionTreeItem(
      'Local Files',
      vscode.TreeItemCollapsibleState.Expanded,
      { type: 'root-local' }
    );
    items.push(localItem);

    return items;
  }

  /**
   * Get AM table children
   */
  private async getAMTableChildren(): Promise<AssumptionTreeItem[]> {
    // Check connection state
    const connectionState = this.authManager.getConnectionState();

    if (connectionState === 'disconnected') {
      return [
        new AssumptionTreeItem(
          'Not connected',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message', message: 'Click to login' }
        ),
      ];
    }

    if (connectionState === 'error') {
      return [
        new AssumptionTreeItem(
          'Connection error',
          vscode.TreeItemCollapsibleState.None,
          { type: 'error', message: 'Check settings' }
        ),
      ];
    }

    // Check if configured
    if (!this.authManager.isConfigured()) {
      return [
        new AssumptionTreeItem(
          'Not configured',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message', message: 'Set livecalc.assumptionsManager.url' }
        ),
      ];
    }

    // Show loading indicator
    if (this.isLoading) {
      return [
        new AssumptionTreeItem(
          'Loading tables...',
          vscode.TreeItemCollapsibleState.None,
          { type: 'loading' }
        ),
      ];
    }

    // Show cached error
    if (this.loadError) {
      return [
        new AssumptionTreeItem(
          this.loadError,
          vscode.TreeItemCollapsibleState.None,
          { type: 'error' }
        ),
      ];
    }

    // Fetch tables if not cached
    if (!this.tablesCache) {
      return this.fetchAndShowTables();
    }

    // Return cached tables
    return this.createTableItems(this.tablesCache);
  }

  /**
   * Fetch tables from API and return items
   */
  private async fetchAndShowTables(): Promise<AssumptionTreeItem[]> {
    this.isLoading = true;
    this.refresh();

    try {
      const client = AssumptionsManagerClient.getInstance(this.authManager);
      const tables = await client.listTables();
      this.tablesCache = tables;
      this.loadError = undefined;
      logger.debug(`AssumptionTreeDataProvider: Loaded ${tables.length} tables`);
    } catch (error) {
      const message =
        error instanceof AMClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load tables';
      this.loadError = message;
      logger.error('AssumptionTreeDataProvider: Failed to load tables', error instanceof Error ? error : undefined);
    } finally {
      this.isLoading = false;
    }

    // Re-fire to show results
    this.refresh();
    return [];
  }

  /**
   * Create tree items for tables
   */
  private createTableItems(tables: AMTableInfo[]): AssumptionTreeItem[] {
    let filteredTables = tables;

    // Apply filter
    if (this.filterText) {
      filteredTables = tables.filter(
        (t) =>
          t.name.toLowerCase().includes(this.filterText) ||
          (t.description && t.description.toLowerCase().includes(this.filterText)) ||
          t.type.toLowerCase().includes(this.filterText)
      );
    }

    if (filteredTables.length === 0) {
      if (this.filterText) {
        return [
          new AssumptionTreeItem(
            'No matching tables',
            vscode.TreeItemCollapsibleState.None,
            { type: 'message', message: `No tables match "${this.filterText}"` }
          ),
        ];
      }
      return [
        new AssumptionTreeItem(
          'No tables available',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message' }
        ),
      ];
    }

    // Sort tables by type then name
    const sortedTables = [...filteredTables].sort((a, b) => {
      const typeOrder = { mortality: 0, lapse: 1, expense: 2, other: 3 };
      const typeA = typeOrder[a.type] ?? 3;
      const typeB = typeOrder[b.type] ?? 3;
      if (typeA !== typeB) return typeA - typeB;
      return a.name.localeCompare(b.name);
    });

    return sortedTables.map(
      (table) =>
        new AssumptionTreeItem(table.name, vscode.TreeItemCollapsibleState.Collapsed, {
          type: 'table',
          table,
        })
    );
  }

  /**
   * Get version children for a table
   */
  private async getVersionChildren(tableItem: AssumptionTreeItem): Promise<AssumptionTreeItem[]> {
    const table = tableItem.data.table;
    if (!table) return [];

    // Check cache
    const cached = this.versionsCache.get(table.id);
    if (cached) {
      return this.createVersionItems(cached, table.name);
    }

    // Fetch versions
    try {
      const client = AssumptionsManagerClient.getInstance(this.authManager);
      const versions = await client.listVersions(table.name);
      this.versionsCache.set(table.id, versions);
      logger.debug(`AssumptionTreeDataProvider: Loaded ${versions.length} versions for ${table.name}`);
      return this.createVersionItems(versions, table.name);
    } catch (error) {
      const message =
        error instanceof AMClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load versions';
      logger.error(`AssumptionTreeDataProvider: Failed to load versions for ${table.name}`, error instanceof Error ? error : undefined);
      return [
        new AssumptionTreeItem(
          message,
          vscode.TreeItemCollapsibleState.None,
          { type: 'error' }
        ),
      ];
    }
  }

  /**
   * Create tree items for versions
   */
  private createVersionItems(versions: AMVersionInfo[], tableName: string): AssumptionTreeItem[] {
    if (versions.length === 0) {
      return [
        new AssumptionTreeItem(
          'No versions',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message' }
        ),
      ];
    }

    // Sort: approved first, then by version (descending)
    const sortedVersions = [...versions].sort((a, b) => {
      // Approved first
      if (a.status === 'approved' && b.status !== 'approved') return -1;
      if (a.status !== 'approved' && b.status === 'approved') return 1;

      // Then by version (descending, assuming semver-like)
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

    return sortedVersions.map(
      (version) =>
        new AssumptionTreeItem(version.version, vscode.TreeItemCollapsibleState.None, {
          type: 'version',
          version,
          tableName,
          tableId: version.version, // Use version as part of ID
        })
    );
  }

  /**
   * Get local file children from config
   */
  private async getLocalFileChildren(): Promise<AssumptionTreeItem[]> {
    // Find config file
    const configPath = await this.configLoader.findConfigFile();
    if (!configPath) {
      return [
        new AssumptionTreeItem(
          'No config file',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message', message: 'No livecalc.config.json found' }
        ),
      ];
    }

    // Load config
    const config = await this.configLoader.loadConfig(configPath);
    if (!config) {
      return [
        new AssumptionTreeItem(
          'Config error',
          vscode.TreeItemCollapsibleState.None,
          { type: 'error', message: 'Failed to load config' }
        ),
      ];
    }

    return this.createLocalFileItems(config, path.dirname(configPath));
  }

  /**
   * Create tree items for local files
   */
  private createLocalFileItems(config: LiveCalcConfig, configDir: string): AssumptionTreeItem[] {
    const items: AssumptionTreeItem[] = [];

    // Helper to resolve path
    const resolvePath = (filePath: string): string => {
      // Remove local:// prefix if present
      const cleanPath = filePath.startsWith('local://') ? filePath.slice(8) : filePath;
      // Resolve relative to config directory
      return path.isAbsolute(cleanPath) ? cleanPath : path.join(configDir, cleanPath);
    };

    // Helper to check if a path is local (not an AM reference)
    const isLocalPath = (filePath: string): boolean => {
      return !filePath.startsWith('assumptions://');
    };

    // Add mortality file
    if (config.assumptions.mortality && isLocalPath(config.assumptions.mortality)) {
      const fullPath = resolvePath(config.assumptions.mortality);
      const fileName = path.basename(fullPath);
      items.push(
        new AssumptionTreeItem(fileName, vscode.TreeItemCollapsibleState.None, {
          type: 'local-file',
          filePath: fullPath,
          fileType: 'mortality',
        })
      );
    }

    // Add lapse file
    if (config.assumptions.lapse && isLocalPath(config.assumptions.lapse)) {
      const fullPath = resolvePath(config.assumptions.lapse);
      const fileName = path.basename(fullPath);
      items.push(
        new AssumptionTreeItem(fileName, vscode.TreeItemCollapsibleState.None, {
          type: 'local-file',
          filePath: fullPath,
          fileType: 'lapse',
        })
      );
    }

    // Add expenses file
    if (config.assumptions.expenses && isLocalPath(config.assumptions.expenses)) {
      const fullPath = resolvePath(config.assumptions.expenses);
      const fileName = path.basename(fullPath);
      items.push(
        new AssumptionTreeItem(fileName, vscode.TreeItemCollapsibleState.None, {
          type: 'local-file',
          filePath: fullPath,
          fileType: 'expenses',
        })
      );
    }

    // Add policy file if local
    if (config.policies && isLocalPath(config.policies)) {
      const fullPath = resolvePath(config.policies);
      const fileName = path.basename(fullPath);
      items.push(
        new AssumptionTreeItem(fileName, vscode.TreeItemCollapsibleState.None, {
          type: 'local-file',
          filePath: fullPath,
        })
      );
    }

    if (items.length === 0) {
      return [
        new AssumptionTreeItem(
          'No local files',
          vscode.TreeItemCollapsibleState.None,
          { type: 'message', message: 'All assumptions are from AM' }
        ),
      ];
    }

    // Apply filter
    if (this.filterText) {
      const filtered = items.filter(
        (item) =>
          item.label?.toString().toLowerCase().includes(this.filterText) ||
          item.data.fileType?.toLowerCase().includes(this.filterText)
      );
      if (filtered.length === 0) {
        return [
          new AssumptionTreeItem(
            'No matching files',
            vscode.TreeItemCollapsibleState.None,
            { type: 'message', message: `No files match "${this.filterText}"` }
          ),
        ];
      }
      return filtered;
    }

    return items;
  }

  /**
   * Get parent of an element (required for reveal)
   */
  public getParent(element: AssumptionTreeItem): AssumptionTreeItem | undefined {
    // Root items have no parent
    if (element.data.type === 'root-am' || element.data.type === 'root-local') {
      return undefined;
    }

    // Table items are under root-am
    if (element.data.type === 'table') {
      return new AssumptionTreeItem('Assumptions Manager', vscode.TreeItemCollapsibleState.Expanded, {
        type: 'root-am',
      });
    }

    // Version items are under their table
    if (element.data.type === 'version' && element.data.tableName) {
      const table = this.tablesCache?.find((t) => t.name === element.data.tableName);
      if (table) {
        return new AssumptionTreeItem(table.name, vscode.TreeItemCollapsibleState.Collapsed, {
          type: 'table',
          table,
        });
      }
    }

    // Local files are under root-local
    if (element.data.type === 'local-file') {
      return new AssumptionTreeItem('Local Files', vscode.TreeItemCollapsibleState.Expanded, {
        type: 'root-local',
      });
    }

    return undefined;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this._onDidChangeTreeData.dispose();
  }
}

/**
 * Create and register the Assumptions tree view
 */
export function createAssumptionTreeView(
  context: vscode.ExtensionContext,
  authManager: AuthManager,
  configLoader: ConfigLoader
): { treeView: vscode.TreeView<AssumptionTreeItem>; provider: AssumptionTreeDataProvider } {
  const provider = new AssumptionTreeDataProvider(authManager, configLoader);

  const treeView = vscode.window.createTreeView('livecalc.assumptionsExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // Add search box handling
  treeView.onDidChangeVisibility((e) => {
    if (e.visible) {
      provider.refresh();
    }
  });

  context.subscriptions.push(treeView);
  context.subscriptions.push(provider);

  return { treeView, provider };
}
