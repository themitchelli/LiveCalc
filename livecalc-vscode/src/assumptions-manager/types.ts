/**
 * Assumptions Manager Types
 * Type definitions for Assumptions Manager API integration
 */

/**
 * Connection state for Assumptions Manager
 */
export type AMConnectionState = 'connected' | 'disconnected' | 'error' | 'offline';

/**
 * User info from authentication
 */
export interface AMUserInfo {
  id: string;
  email: string;
  name?: string;
  tenantId: string;
  tenantName?: string;
}

/**
 * JWT token response from auth endpoint
 */
export interface AMAuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: 'Bearer';
  user: AMUserInfo;
}

/**
 * Stored auth state (persisted via SecretStorage)
 */
export interface AMAuthState {
  token: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  user: AMUserInfo;
}

/**
 * Login credentials
 */
export interface AMCredentials {
  email: string;
  password: string;
}

/**
 * Table metadata from API
 */
export interface AMTableInfo {
  id: string;
  name: string;
  description?: string;
  type: 'mortality' | 'lapse' | 'expense' | 'other';
  latestVersion?: string;
  latestApprovedVersion?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Table version metadata
 */
export interface AMVersionInfo {
  version: string;
  status: 'approved' | 'draft' | 'pending' | 'rejected';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  description?: string;
  changeNotes?: string;
}

/**
 * Table data response from API
 */
export interface AMTableData {
  tableId: string;
  tableName: string;
  version: string;
  columns: string[];
  rows: (string | number)[][];
  metadata: {
    status: AMVersionInfo['status'];
    approvedAt?: string;
    approvedBy?: string;
    contentHash: string;
  };
}

/**
 * Error response from API
 */
export interface AMApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Configuration for Assumptions Manager
 */
export interface AMConfig {
  url: string;
  autoLogin: boolean;
  timeoutMs: number;
  cacheSizeMb: number;
  offlineMode: 'warn' | 'fail';
}

/**
 * Events emitted by AuthManager
 */
export interface AMAuthEvents {
  onDidLogin: (user: AMUserInfo) => void;
  onDidLogout: () => void;
  onDidChangeState: (state: AMConnectionState) => void;
  onDidTokenRefresh: () => void;
}

/**
 * Cache entry for assumption data
 */
export interface AMCacheEntry {
  data: AMTableData;
  fetchedAt: string; // ISO8601
  accessedAt: string; // ISO8601
  sizeBytes: number;
}

/**
 * Cache index for LRU tracking
 */
export interface AMCacheIndex {
  entries: Record<string, { accessedAt: string; sizeBytes: number }>;
  totalSizeBytes: number;
}

/**
 * Resolved assumption reference
 */
export interface ResolvedAssumption {
  reference: string; // Original reference (e.g., 'assumptions://mortality:v2.1')
  tableName: string;
  version: string;
  resolvedVersion: string; // Actual version (if 'latest' was used)
  source: 'am' | 'local';
  data: number[][];
  columns: string[];
  metadata: {
    status?: AMVersionInfo['status'];
    approvedAt?: string;
    approvedBy?: string;
    contentHash: string;
    fetchedAt?: string;
  };
}
