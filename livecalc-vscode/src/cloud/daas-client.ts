/**
 * DaaS (Debugging-as-a-Service) Client
 *
 * Provides remote debugging capabilities for cloud-executed pipeline runs.
 */

import * as vscode from 'vscode';
import { BusResourceInfo, DebugState } from '../ui/results-panel';
import { logger } from '../logging/logger';

/**
 * DaaS Client for remote debugging
 */
export class DaaSClient {
  private apiUrl: string;
  private token: string | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Pause remote run
   */
  async pauseRun(runId: string, nodeId?: string): Promise<{ success: boolean; sessionId: string }> {
    const response = await this.request(`/v1/platform/debug/${runId}/pause`, {
      method: 'POST',
      body: JSON.stringify({ node_id: nodeId })
    });

    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail || 'Failed to pause run');
    }

    return response.json() as Promise<{ success: boolean; sessionId: string }>;
  }

  /**
   * Resume paused run
   */
  async resumeRun(runId: string): Promise<{ success: boolean }> {
    const response = await this.request(`/v1/platform/debug/${runId}/resume`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail || 'Failed to resume run');
    }

    return response.json() as Promise<{ success: boolean }>;
  }

  /**
   * Execute single step in paused pipeline
   */
  async stepRun(runId: string): Promise<{ success: boolean }> {
    const response = await this.request(`/v1/platform/debug/${runId}/step`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail || 'Failed to step run');
    }

    return response.json() as Promise<{ success: boolean }>;
  }

  /**
   * Inspect raw memory segment
   */
  async inspectMemory(
    runId: string,
    busUri: string,
    offset: number = 0,
    length: number = 1024
  ): Promise<ArrayBuffer> {
    const response = await this.request(`/v1/platform/debug/${runId}/inspect`, {
      method: 'POST',
      body: JSON.stringify({
        bus_uri: busUri,
        offset,
        length
      })
    });

    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail || 'Failed to inspect memory');
    }

    return response.arrayBuffer();
  }

  /**
   * Get list of available bus resources
   */
  async getBusResources(runId: string): Promise<BusResourceInfo[]> {
    const response = await this.request(`/v1/platform/debug/${runId}/resources`);

    if (!response.ok) {
      const error = await response.json() as { detail?: string };
      throw new Error(error.detail || 'Failed to get bus resources');
    }

    const data = await response.json() as { resources?: BusResourceInfo[] };
    return data.resources || [];
  }

  /**
   * Make authenticated request to DaaS API
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${this.apiUrl}${path}`;
    logger.debug(`DaaS request: ${options.method || 'GET'} ${url}`);

    return fetch(url, {
      ...options,
      headers
    });
  }
}

/**
 * Singleton instance
 */
let daasClientInstance: DaaSClient | null = null;

/**
 * Get DaaS client instance
 */
export function getDaaSClient(): DaaSClient {
  if (!daasClientInstance) {
    const config = vscode.workspace.getConfiguration('livecalc');
    const apiUrl = config.get<string>('cloud.apiUrl') || '';
    daasClientInstance = new DaaSClient(apiUrl);
  }
  return daasClientInstance;
}

/**
 * Dispose DaaS client instance
 */
export function disposeDaaSClient(): void {
  daasClientInstance = null;
}
