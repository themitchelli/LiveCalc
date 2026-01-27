/**
 * Assumptions Manager Credentials Environment Variables
 *
 * Provides helper functions to export AM credentials as environment variables
 * for consumption by calculation engines (C++, Python, etc.)
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { AuthManager } from './auth';

/**
 * Environment variable names for AM credentials
 */
export const AM_ENV_VARS = {
  /** Assumptions Manager API URL */
  URL: 'LIVECALC_AM_URL',
  /** JWT authentication token */
  TOKEN: 'LIVECALC_AM_TOKEN',
  /** Cache directory for assumptions */
  CACHE_DIR: 'LIVECALC_AM_CACHE_DIR',
} as const;

/**
 * AM credentials as environment variables
 */
export interface AMEnvironment {
  /** Assumptions Manager API URL */
  LIVECALC_AM_URL?: string;
  /** JWT token for authentication */
  LIVECALC_AM_TOKEN?: string;
  /** Cache directory path */
  LIVECALC_AM_CACHE_DIR?: string;
}

/**
 * Get AM credentials as environment variables
 *
 * Retrieves current AM credentials from AuthManager and formats them
 * as environment variables suitable for passing to child processes.
 *
 * @param context - VS Code extension context
 * @returns Environment variables object, or undefined if not configured
 */
export async function getAMEnvironment(context: vscode.ExtensionContext): Promise<AMEnvironment | undefined> {
  // Check if AuthManager is initialized
  if (!AuthManager.hasInstance()) {
    logger.debug('AM Environment: AuthManager not initialized');
    return undefined;
  }

  const authManager = AuthManager.getInstance(context);
  const config = vscode.workspace.getConfiguration('livecalc.assumptionsManager');
  const url = config.get<string>('url');

  // Check if AM is configured
  if (!url) {
    logger.debug('AM Environment: No AM URL configured');
    return undefined;
  }

  // Get current token
  const token = await authManager.getToken();
  if (!token) {
    logger.debug('AM Environment: No valid token available');
    return undefined;
  }

  // Get cache directory (use global storage path as default)
  const cacheDir = context.globalStorageUri.fsPath;

  const env: AMEnvironment = {
    LIVECALC_AM_URL: url,
    LIVECALC_AM_TOKEN: token,
    LIVECALC_AM_CACHE_DIR: cacheDir,
  };

  logger.debug(`AM Environment: Prepared credentials for ${url}`);
  return env;
}

/**
 * Set AM environment variables in the current process
 *
 * WARNING: This modifies process.env, which affects the entire Node.js process.
 * Use sparingly and only when necessary.
 *
 * @param env - AM environment variables to set
 */
export function setAMEnvironmentVariables(env: AMEnvironment): void {
  if (env.LIVECALC_AM_URL) {
    process.env[AM_ENV_VARS.URL] = env.LIVECALC_AM_URL;
  }
  if (env.LIVECALC_AM_TOKEN) {
    process.env[AM_ENV_VARS.TOKEN] = env.LIVECALC_AM_TOKEN;
  }
  if (env.LIVECALC_AM_CACHE_DIR) {
    process.env[AM_ENV_VARS.CACHE_DIR] = env.LIVECALC_AM_CACHE_DIR;
  }

  logger.debug('AM Environment: Set process environment variables');
}

/**
 * Clear AM environment variables from the current process
 */
export function clearAMEnvironmentVariables(): void {
  delete process.env[AM_ENV_VARS.URL];
  delete process.env[AM_ENV_VARS.TOKEN];
  delete process.env[AM_ENV_VARS.CACHE_DIR];

  logger.debug('AM Environment: Cleared process environment variables');
}

/**
 * Check if AM credentials are configured
 *
 * @param context - VS Code extension context
 * @returns True if AM is configured and credentials are available
 */
export async function hasAMCredentials(context: vscode.ExtensionContext): Promise<boolean> {
  const env = await getAMEnvironment(context);
  return env !== undefined && env.LIVECALC_AM_URL !== undefined && env.LIVECALC_AM_TOKEN !== undefined;
}
