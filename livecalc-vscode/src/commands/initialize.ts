import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { Notifications } from '../ui/notifications';

/**
 * Default livecalc.config.json content
 */
const DEFAULT_CONFIG = `{
  "$schema": "./node_modules/livecalc-vscode/schemas/livecalc.config.schema.json",
  "model": "model.mga",
  "assumptions": {
    "mortality": "local://assumptions/mortality.csv",
    "lapse": "local://assumptions/lapse.csv",
    "expenses": "local://assumptions/expenses.json"
  },
  "scenarios": {
    "count": 1000,
    "seed": 42,
    "interestRate": {
      "initial": 0.04,
      "drift": 0.001,
      "volatility": 0.02
    }
  },
  "execution": {
    "autoRunOnSave": true,
    "timeout": 300,
    "maxPolicies": 100000
  },
  "output": {
    "percentiles": [50, 75, 90, 95, 99],
    "showDistribution": true,
    "showCashflows": false
  }
}
`;

/**
 * Default model.mga content
 */
const DEFAULT_MODEL = `// Simple 20-year term life projection

PRODUCT TermLife
  TERM 20
  SUM_ASSURED 100000
  PREMIUM 1200
END

ASSUMPTIONS
  MORTALITY assumptions://mortality-standard:v2.1
  LAPSE local://assumptions/lapse.csv
  EXPENSES {
    PER_POLICY 50
    PERCENT_PREMIUM 0.02
  }
END

PROJECTION
  survival = 1.0
  npv = 0.0

  FOR year IN 1..TERM
    // Decrements
    deaths = survival * MORTALITY[AGE + year]
    lapses = survival * (1 - deaths) * LAPSE[year]
    survival = survival - deaths - lapses

    // Cash flows
    premium_cf = PREMIUM * survival
    death_cf = SUM_ASSURED * deaths
    expense_cf = EXPENSES.PER_POLICY + PREMIUM * EXPENSES.PERCENT_PREMIUM

    // Net and discount
    net_cf = premium_cf - death_cf - expense_cf
    npv = npv + net_cf * DISCOUNT[year]
  END

  RETURN npv
END
`;

/**
 * Initialize project command handler
 * Creates default config and sample files
 */
export async function initializeCommand(): Promise<void> {
  logger.info('Initialize project command invoked');

  // Get workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    logger.warn('No workspace folder open');
    Notifications.warn('Please open a folder first');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const configPath = path.join(rootPath, 'livecalc.config.json');

  // Check if config already exists
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
    const overwrite = await vscode.window.showWarningMessage(
      'livecalc.config.json already exists. Overwrite?',
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') {
      logger.info('User cancelled overwrite');
      return;
    }
  } catch {
    // File doesn't exist, proceed with creation
  }

  try {
    // Create config file
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(configPath),
      Buffer.from(DEFAULT_CONFIG, 'utf-8')
    );
    logger.info(`Created ${configPath}`);

    // Create sample model file
    const modelPath = path.join(rootPath, 'model.mga');
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
      // Model already exists, don't overwrite
    } catch {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(modelPath),
        Buffer.from(DEFAULT_MODEL, 'utf-8')
      );
      logger.info(`Created ${modelPath}`);
    }

    // Create assumptions directory
    const assumptionsDir = path.join(rootPath, 'assumptions');
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(assumptionsDir));
      logger.info(`Created ${assumptionsDir}`);
    } catch {
      // Directory may already exist
    }

    Notifications.info('Project initialized successfully');

    // Open config file
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize project', error instanceof Error ? error : undefined);
    await Notifications.error(`Failed to initialize: ${errorMessage}`);
  }
}

/**
 * Register the initialize command
 */
export function registerInitializeCommand(
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.commands.registerCommand('livecalc.initialize', initializeCommand);
}
