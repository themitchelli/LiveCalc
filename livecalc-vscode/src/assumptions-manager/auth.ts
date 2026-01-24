/**
 * Assumptions Manager Authentication
 * Handles JWT-based authentication with the Assumptions Manager API
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import {
  AMAuthState,
  AMAuthResponse,
  AMConnectionState,
  AMCredentials,
  AMUserInfo,
  AMConfig,
} from './types';

// Secret storage keys
const TOKEN_KEY = 'livecalc.amToken';
const REFRESH_TOKEN_KEY = 'livecalc.amRefreshToken';
const AUTH_STATE_KEY = 'livecalc.amAuthState';

// Token refresh threshold (5 minutes before expiry)
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// Connection check interval (5 minutes)
const CONNECTION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Error class for authentication failures
 */
export class AMAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED' | 'NETWORK_ERROR' | 'SERVER_ERROR' | 'NOT_CONFIGURED' | 'REFRESH_FAILED'
  ) {
    super(message);
    this.name = 'AMAuthError';
  }
}

/**
 * AuthManager handles Assumptions Manager authentication
 * - Stores JWT tokens securely in VS Code SecretStorage
 * - Automatically refreshes tokens before expiry
 * - Emits events for login/logout/state changes
 */
export class AuthManager implements vscode.Disposable {
  private static instance: AuthManager | undefined;
  private authState: AMAuthState | undefined;
  private connectionState: AMConnectionState = 'disconnected';
  private tokenRefreshTimer?: NodeJS.Timeout;
  private connectionCheckTimer?: NodeJS.Timeout;
  private disposables: vscode.Disposable[] = [];

  // Event emitters
  private readonly _onDidLogin = new vscode.EventEmitter<AMUserInfo>();
  private readonly _onDidLogout = new vscode.EventEmitter<void>();
  private readonly _onDidChangeState = new vscode.EventEmitter<AMConnectionState>();
  private readonly _onDidTokenRefresh = new vscode.EventEmitter<void>();

  public readonly onDidLogin = this._onDidLogin.event;
  public readonly onDidLogout = this._onDidLogout.event;
  public readonly onDidChangeState = this._onDidChangeState.event;
  public readonly onDidTokenRefresh = this._onDidTokenRefresh.event;

  private constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      this._onDidLogin,
      this._onDidLogout,
      this._onDidChangeState,
      this._onDidTokenRefresh
    );
  }

  /**
   * Get singleton instance
   *
   * @param context - Extension context (required for first initialization)
   * @returns AuthManager instance, or undefined if not yet initialized and no context provided
   */
  public static getInstance(context?: vscode.ExtensionContext): AuthManager {
    if (!AuthManager.instance) {
      if (!context) {
        // Cannot create instance without context
        throw new Error('AuthManager not initialized. Call getInstance with context first.');
      }
      AuthManager.instance = new AuthManager(context);
    }
    return AuthManager.instance;
  }

  /**
   * Check if the singleton instance exists
   */
  public static hasInstance(): boolean {
    return AuthManager.instance !== undefined;
  }

  /**
   * Dispose singleton instance
   */
  public static disposeInstance(): void {
    if (AuthManager.instance) {
      AuthManager.instance.dispose();
      AuthManager.instance = undefined;
    }
  }

  /**
   * Initialize auth manager - restore state and optionally auto-login
   */
  public async initialize(): Promise<void> {
    logger.debug('AuthManager: Initializing...');

    // Restore auth state from secret storage
    await this.restoreAuthState();

    const config = this.getConfig();

    // Check if AM is configured
    if (!config.url) {
      logger.debug('AuthManager: No AM URL configured');
      this.setConnectionState('disconnected');
      return;
    }

    // If we have a stored token, validate it
    if (this.authState) {
      logger.debug('AuthManager: Found stored auth state');

      // Check if token is expired
      if (this.isTokenExpired()) {
        logger.debug('AuthManager: Token expired, attempting refresh');
        try {
          await this.refreshToken();
          this.startTokenRefreshTimer();
          this.startConnectionCheckTimer();
        } catch (error) {
          logger.warn('AuthManager: Failed to refresh expired token, logging out');
          await this.logout();
        }
      } else {
        // Token still valid
        this.setConnectionState('connected');
        this.startTokenRefreshTimer();
        this.startConnectionCheckTimer();
        logger.info(`AuthManager: Logged in as ${this.authState.user.email}`);
      }
    } else if (config.autoLogin) {
      logger.debug('AuthManager: No stored state, auto-login disabled');
      this.setConnectionState('disconnected');
    } else {
      this.setConnectionState('disconnected');
    }
  }

  /**
   * Login with username/password
   */
  public async login(credentials: AMCredentials): Promise<AMUserInfo> {
    const config = this.getConfig();

    if (!config.url) {
      throw new AMAuthError('Assumptions Manager URL not configured', 'NOT_CONFIGURED');
    }

    logger.debug(`AuthManager: Attempting login for ${credentials.email}`);

    try {
      const response = await this.fetchWithTimeout<AMAuthResponse>(
        `${config.url}/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
        },
        config.timeoutMs
      );

      // Store auth state
      this.authState = {
        token: response.token,
        refreshToken: response.refreshToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      };

      // Persist to secret storage
      await this.persistAuthState();

      // Update state and start timers
      this.setConnectionState('connected');
      this.startTokenRefreshTimer();
      this.startConnectionCheckTimer();

      logger.info(`AuthManager: Successfully logged in as ${response.user.email}`);
      this._onDidLogin.fire(response.user);

      return response.user;
    } catch (error) {
      logger.error('AuthManager: Login failed', error instanceof Error ? error : undefined);

      if (error instanceof AMAuthError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('401') || message.includes('Unauthorized')) {
        throw new AMAuthError('Invalid email or password', 'INVALID_CREDENTIALS');
      }

      if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED')) {
        throw new AMAuthError('Unable to connect to Assumptions Manager', 'NETWORK_ERROR');
      }

      throw new AMAuthError(`Login failed: ${message}`, 'SERVER_ERROR');
    }
  }

  /**
   * Login via browser OAuth flow
   * Opens browser for authentication, listens for callback
   */
  public async loginViaBrowser(): Promise<AMUserInfo> {
    const config = this.getConfig();

    if (!config.url) {
      throw new AMAuthError('Assumptions Manager URL not configured', 'NOT_CONFIGURED');
    }

    logger.debug('AuthManager: Starting browser login flow');

    // Create a unique state for CSRF protection
    const state = this.generateRandomState();

    // Store state for verification when callback comes
    await this.context.secrets.store('livecalc.amOAuthState', state);

    // Open browser to login page
    const loginUrl = `${config.url}/auth/login?redirect_uri=${encodeURIComponent('vscode://livecalc.livecalc-vscode/auth-callback')}&state=${state}`;

    await vscode.env.openExternal(vscode.Uri.parse(loginUrl));

    // Return a promise that will be resolved when the URI handler receives the callback
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new AMAuthError('Login timeout - please try again', 'NETWORK_ERROR'));
      }, 5 * 60 * 1000); // 5 minute timeout

      // Store the resolver for the URI handler to call
      this.pendingLoginResolve = { resolve, reject, timeout };
    });
  }

  private pendingLoginResolve?: {
    resolve: (user: AMUserInfo) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  };

  /**
   * Handle OAuth callback from browser
   * Called by URI handler when vscode://livecalc.livecalc-vscode/auth-callback is opened
   */
  public async handleAuthCallback(uri: vscode.Uri): Promise<void> {
    const query = new URLSearchParams(uri.query);
    const token = query.get('token');
    const refreshToken = query.get('refresh_token');
    const state = query.get('state');
    const error = query.get('error');

    // Verify state matches
    const storedState = await this.context.secrets.get('livecalc.amOAuthState');
    await this.context.secrets.delete('livecalc.amOAuthState');

    if (error) {
      const errorMsg = query.get('error_description') || error;
      this.pendingLoginResolve?.reject(new AMAuthError(errorMsg, 'SERVER_ERROR'));
      this.clearPendingLogin();
      return;
    }

    if (state !== storedState) {
      this.pendingLoginResolve?.reject(new AMAuthError('Invalid OAuth state - possible CSRF attack', 'SERVER_ERROR'));
      this.clearPendingLogin();
      return;
    }

    if (!token || !refreshToken) {
      this.pendingLoginResolve?.reject(new AMAuthError('Missing token in callback', 'SERVER_ERROR'));
      this.clearPendingLogin();
      return;
    }

    try {
      // Decode JWT to get user info and expiry
      const payload = this.decodeJwt(token);
      const user: AMUserInfo = {
        id: String(payload.sub || ''),
        email: String(payload.email || ''),
        name: payload.name ? String(payload.name) : undefined,
        tenantId: String(payload.tenant_id || ''),
        tenantName: payload.tenant_name ? String(payload.tenant_name) : undefined,
      };

      // Store auth state
      this.authState = {
        token,
        refreshToken,
        expiresAt: Number(payload.exp) * 1000,
        user,
      };

      await this.persistAuthState();
      this.setConnectionState('connected');
      this.startTokenRefreshTimer();
      this.startConnectionCheckTimer();

      logger.info(`AuthManager: Browser login successful as ${user.email}`);
      this._onDidLogin.fire(user);
      this.pendingLoginResolve?.resolve(user);
    } catch (error) {
      this.pendingLoginResolve?.reject(
        error instanceof Error ? error : new AMAuthError('Failed to process auth callback', 'SERVER_ERROR')
      );
    }

    this.clearPendingLogin();
  }

  private clearPendingLogin(): void {
    if (this.pendingLoginResolve) {
      clearTimeout(this.pendingLoginResolve.timeout);
      this.pendingLoginResolve = undefined;
    }
  }

  /**
   * Logout - clear stored credentials
   */
  public async logout(): Promise<void> {
    logger.debug('AuthManager: Logging out');

    // Clear timers
    this.stopTokenRefreshTimer();
    this.stopConnectionCheckTimer();

    // Clear stored credentials
    await this.context.secrets.delete(TOKEN_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.secrets.delete(AUTH_STATE_KEY);

    this.authState = undefined;
    this.setConnectionState('disconnected');

    logger.info('AuthManager: Logged out successfully');
    this._onDidLogout.fire();
  }

  /**
   * Refresh the access token
   */
  public async refreshToken(): Promise<void> {
    if (!this.authState?.refreshToken) {
      throw new AMAuthError('No refresh token available', 'REFRESH_FAILED');
    }

    const config = this.getConfig();

    if (!config.url) {
      throw new AMAuthError('Assumptions Manager URL not configured', 'NOT_CONFIGURED');
    }

    logger.debug('AuthManager: Refreshing token');

    try {
      const response = await this.fetchWithTimeout<AMAuthResponse>(
        `${config.url}/auth/refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: this.authState.refreshToken }),
        },
        config.timeoutMs
      );

      // Update auth state
      this.authState = {
        token: response.token,
        refreshToken: response.refreshToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      };

      await this.persistAuthState();

      logger.debug('AuthManager: Token refreshed successfully');
      this._onDidTokenRefresh.fire();
    } catch (error) {
      logger.error('AuthManager: Token refresh failed', error instanceof Error ? error : undefined);
      throw new AMAuthError('Failed to refresh token', 'REFRESH_FAILED');
    }
  }

  /**
   * Get current auth token for API calls
   * Automatically refreshes if close to expiry
   */
  public async getToken(): Promise<string | undefined> {
    if (!this.authState) {
      return undefined;
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken()) {
      try {
        await this.refreshToken();
      } catch (error) {
        logger.warn('AuthManager: Failed to refresh token on demand');
        // Return existing token, it might still work
      }
    }

    return this.authState.token;
  }

  /**
   * Get current user info
   */
  public getUser(): AMUserInfo | undefined {
    return this.authState?.user;
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authState !== undefined && !this.isTokenExpired();
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): AMConnectionState {
    return this.connectionState;
  }

  /**
   * Get configuration from VS Code settings
   */
  public getConfig(): AMConfig {
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
   * Check if Assumptions Manager is configured
   */
  public isConfigured(): boolean {
    return !!this.getConfig().url;
  }

  // Private helper methods

  private async restoreAuthState(): Promise<void> {
    try {
      const stateJson = await this.context.secrets.get(AUTH_STATE_KEY);
      if (stateJson) {
        this.authState = JSON.parse(stateJson) as AMAuthState;
        logger.debug('AuthManager: Restored auth state from storage');
      }
    } catch {
      logger.warn('AuthManager: Failed to restore auth state');
      this.authState = undefined;
    }
  }

  private async persistAuthState(): Promise<void> {
    if (this.authState) {
      await this.context.secrets.store(AUTH_STATE_KEY, JSON.stringify(this.authState));
    }
  }

  private setConnectionState(state: AMConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this._onDidChangeState.fire(state);
    }
  }

  private isTokenExpired(): boolean {
    if (!this.authState) {
      return true;
    }
    return Date.now() >= this.authState.expiresAt;
  }

  private shouldRefreshToken(): boolean {
    if (!this.authState) {
      return false;
    }
    // Refresh if token expires within threshold
    return Date.now() >= this.authState.expiresAt - TOKEN_REFRESH_THRESHOLD_MS;
  }

  private startTokenRefreshTimer(): void {
    this.stopTokenRefreshTimer();

    if (!this.authState) {
      return;
    }

    // Calculate when to refresh (5 minutes before expiry)
    const refreshTime = this.authState.expiresAt - TOKEN_REFRESH_THRESHOLD_MS - Date.now();

    if (refreshTime > 0) {
      logger.debug(`AuthManager: Scheduling token refresh in ${Math.round(refreshTime / 1000)}s`);
      this.tokenRefreshTimer = setTimeout(async () => {
        try {
          await this.refreshToken();
          this.startTokenRefreshTimer(); // Schedule next refresh
        } catch (error) {
          logger.error('AuthManager: Scheduled token refresh failed', error instanceof Error ? error : undefined);
          await this.logout();
        }
      }, refreshTime);
    }
  }

  private stopTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = undefined;
    }
  }

  private startConnectionCheckTimer(): void {
    this.stopConnectionCheckTimer();

    this.connectionCheckTimer = setInterval(async () => {
      await this.checkConnection();
    }, CONNECTION_CHECK_INTERVAL_MS);
  }

  private stopConnectionCheckTimer(): void {
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
      this.connectionCheckTimer = undefined;
    }
  }

  private async checkConnection(): Promise<void> {
    if (!this.isAuthenticated()) {
      return;
    }

    const config = this.getConfig();
    if (!config.url) {
      return;
    }

    try {
      // Simple health check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(`${config.url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (this.connectionState !== 'connected') {
        this.setConnectionState('connected');
        logger.debug('AuthManager: Connection restored');
      }
    } catch (error) {
      if (this.connectionState === 'connected') {
        this.setConnectionState('offline');
        logger.warn('AuthManager: Connection lost, using offline mode');
      }
    }
  }

  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AMAuthError('Request timeout', 'NETWORK_ERROR');
      }

      throw error;
    }
  }

  private decodeJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  private generateRandomState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  public dispose(): void {
    this.stopTokenRefreshTimer();
    this.stopConnectionCheckTimer();
    this.clearPendingLogin();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

// Helper function to dispose the singleton
export function disposeAuthManager(): void {
  AuthManager.disposeInstance();
}
