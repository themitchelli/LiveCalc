import * as vscode from 'vscode';
import { logger } from './logging/logger';
import { StatusBar } from './ui/status-bar';
import { ConfigLoader } from './config/config-loader';
import { registerCommands } from './commands';
import { getEngineManager } from './engine/livecalc-engine';
import { disposeDataCache } from './data/cache';
import { disposeDataValidator } from './data/data-validator';
import { ResultsPanel } from './ui/results-panel';
import { ComparisonManager, disposeComparisonManager } from './ui/comparison';
import { AutoRunController, disposeCacheManager } from './auto-run';
import { RunHistoryManager, disposeRunHistoryManager } from './auto-run/run-history';
import { runCommand } from './commands/run';
import {
  AuthManager,
  AMStatusBar,
  AMCache,
  disposeAuthManager,
  disposeAMClient,
  disposeAMCache,
  disposeResolver,
  AssumptionHoverProvider,
  AssumptionCompletionProvider,
  AssumptionDefinitionProvider,
  AssumptionDocumentLinkProvider,
  AssumptionDiagnosticProvider,
} from './assumptions-manager';

let statusBar: StatusBar | undefined;
let configLoader: ConfigLoader | undefined;
let resultsPanel: ResultsPanel | undefined;
let comparisonManager: ComparisonManager | undefined;
let runHistoryManager: RunHistoryManager | undefined;
let autoRunController: AutoRunController | undefined;
let authManager: AuthManager | undefined;
let amStatusBar: AMStatusBar | undefined;
let amCache: AMCache | undefined;
let assumptionDiagnosticProvider: AssumptionDiagnosticProvider | undefined;

/**
 * Extension activation
 * Called when VS Code activates the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  const version = context.extension.packageJSON.version;
  logger.info(`LiveCalc extension v${version} activating...`);

  // Create status bar
  statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  // Create config loader
  configLoader = new ConfigLoader(context);
  context.subscriptions.push(configLoader);

  // Initialize engine manager with extension path (lazy initialization)
  const engineManager = getEngineManager();
  engineManager.setExtensionPath(context.extensionPath);

  // Update status bar when engine initializes
  context.subscriptions.push(
    engineManager.onDidInitialize(() => {
      statusBar?.setEngineInitialized(true);
      logger.debug('Engine initialization detected, status bar updated');
    })
  );

  context.subscriptions.push(engineManager);

  // Create results panel (singleton)
  resultsPanel = ResultsPanel.getInstance(context.extensionUri);
  context.subscriptions.push(resultsPanel);

  // Create comparison manager (with workspace state persistence)
  comparisonManager = ComparisonManager.getInstance(context);
  context.subscriptions.push(comparisonManager);

  // Create run history manager (in-memory, cleared on reload per AC)
  runHistoryManager = RunHistoryManager.getInstance(context);
  context.subscriptions.push(runHistoryManager);

  // Create auto-run controller
  autoRunController = new AutoRunController(context, configLoader, statusBar);
  context.subscriptions.push(autoRunController);

  // Set up auto-run to execute the run command
  autoRunController.setRunCommand(async (options) => {
    if (statusBar && configLoader && resultsPanel && comparisonManager && runHistoryManager) {
      await runCommand(statusBar, configLoader, resultsPanel, comparisonManager, runHistoryManager, options);
    }
  });

  // Update status bar with initial auto-run state
  statusBar.setAutoRunEnabled(autoRunController.isEnabled());

  // Initialize Assumptions Manager authentication
  authManager = AuthManager.getInstance(context);
  context.subscriptions.push(authManager);

  // Create AM cache for storing fetched assumptions
  amCache = AMCache.getInstance(context);
  context.subscriptions.push(amCache);

  // Create AM status bar (separate from main status bar)
  amStatusBar = new AMStatusBar(authManager);
  context.subscriptions.push(amStatusBar);

  // Initialize auth manager (restore state, auto-login if configured)
  authManager.initialize().catch(() => {
    logger.warn('AuthManager initialization failed');
  });

  // Initialize AM cache (load index, create directory)
  amCache.initialize().catch(() => {
    logger.warn('AMCache initialization failed');
  });

  // Register assumption reference language providers
  // These work in both MGA files and JSON files (for livecalc.config.json)
  const documentSelector = [
    { language: 'mga' },
    { language: 'json', pattern: '**/livecalc.config.json' },
  ];

  // Hover provider - shows table metadata on hover
  const hoverProvider = new AssumptionHoverProvider(authManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(documentSelector, hoverProvider)
  );

  // Completion provider - autocomplete for assumptions:// references
  const completionProvider = new AssumptionCompletionProvider(authManager);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      completionProvider,
      '/', // Trigger after 'assumptions:/'
      ':' // Trigger after 'table-name:'
    )
  );

  // Definition provider - Ctrl+Click opens in Assumptions Manager
  const definitionProvider = new AssumptionDefinitionProvider(authManager);
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(documentSelector, definitionProvider)
  );

  // Document link provider - makes references clickable
  const documentLinkProvider = new AssumptionDocumentLinkProvider(authManager);
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(documentSelector, documentLinkProvider)
  );

  // Diagnostic provider - shows error squiggles for invalid references
  assumptionDiagnosticProvider = new AssumptionDiagnosticProvider(authManager);
  context.subscriptions.push(assumptionDiagnosticProvider);

  logger.debug('Assumption reference language providers registered');

  // Listen for pause state changes to update status bar
  context.subscriptions.push(
    autoRunController.onPauseStateChanged((pauseState) => {
      if (!statusBar || !autoRunController) {
        return;
      }
      if (pauseState.isPaused) {
        statusBar.setPaused(pauseState.pendingChanges.size);
      } else {
        // Restore to normal auto-run state
        statusBar.setAutoRunEnabled(autoRunController.isEnabled());
        statusBar.setReady();
      }
    })
  );

  // Register commands
  registerCommands(context, statusBar, configLoader, resultsPanel, comparisonManager, runHistoryManager, autoRunController, authManager, amStatusBar, amCache);

  // Show status bar when appropriate
  updateStatusBarVisibility();

  // Watch for editor changes to update status bar visibility
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusBarVisibility();
    })
  );

  // Watch for config changes to update log level
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('livecalc.logLevel')) {
        logger.updateLogLevel();
        logger.debug('Log level updated from configuration');
      }
    })
  );

  logger.info('LiveCalc extension activated successfully');
}

/**
 * Update status bar visibility based on current context
 */
function updateStatusBarVisibility(): void {
  if (!statusBar) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const shouldShow =
    editor?.document.languageId === 'mga' ||
    editor?.document.fileName.endsWith('livecalc.config.json') ||
    hasConfigInWorkspace();

  if (shouldShow) {
    statusBar.show();
    // Also show AM status bar if configured
    amStatusBar?.show();
  } else {
    statusBar.hide();
    amStatusBar?.hide();
  }
}

/**
 * Check if workspace contains a livecalc.config.json
 */
function hasConfigInWorkspace(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  // Async check happens on first run command, for status bar
  // we do a quick sync check based on cached state
  return configLoader?.getConfigDirectory() !== null;
}

/**
 * Extension deactivation
 * Called when VS Code deactivates the extension
 */
export function deactivate(): void {
  logger.info('LiveCalc extension deactivating...');

  // Cleanup data loader components
  disposeDataCache();
  disposeDataValidator();
  disposeComparisonManager();
  disposeRunHistoryManager();
  disposeCacheManager();
  disposeResolver();
  disposeAMCache();
  disposeAMClient();
  disposeAuthManager();

  // Cleanup is handled via context.subscriptions
  statusBar = undefined;
  configLoader = undefined;
  resultsPanel = undefined;
  comparisonManager = undefined;
  runHistoryManager = undefined;
  autoRunController = undefined;
  authManager = undefined;
  amStatusBar = undefined;
  amCache = undefined;
  assumptionDiagnosticProvider = undefined;

  logger.info('LiveCalc extension deactivated');
}
