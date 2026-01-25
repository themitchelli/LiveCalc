/**
 * Cloud Client for LiveCalc Cloud API
 *
 * Handles authentication, job submission, and status polling.
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';

export interface CloudConfig {
  apiUrl: string;
  token?: string;
}

export interface JobSubmitResponse {
  jobId: string;
  status: string;
  websocketUrl: string;
  createdAt: string;
  estimatedStartTime?: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: string;
  tenantId: string;
  userId: string;
  modelName?: string;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  packagePath: string;
  packageHash: string;
  websocketUrl: string;
}

export enum CloudJobStatus {
  QUEUED = 'queued',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export class CloudClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'CloudClientError';
  }
}

/**
 * Client for interacting with LiveCalc Cloud API
 */
export class CloudClient {
  private config: CloudConfig;

  constructor(config: CloudConfig) {
    this.config = config;
  }

  /**
   * Submit a job to cloud execution
   */
  async submitJob(
    packageBuffer: Buffer,
    modelName?: string,
    priority: number = 0
  ): Promise<JobSubmitResponse> {
    const { apiUrl, token } = this.config;

    if (!token) {
      throw new CloudClientError('Authentication token not found. Please login to Assumptions Manager.');
    }

    logger.debug(`Submitting job to ${apiUrl}/v1/jobs/submit`);

    // Create form data
    const formData = new FormData();
    formData.append('package', new Blob([packageBuffer]), 'model-package.zip');
    if (modelName) {
      formData.append('model_name', modelName);
    }
    formData.append('priority', priority.toString());

    try {
      const response = await fetch(`${apiUrl}/v1/jobs/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        throw new CloudClientError(
          `Job submission failed: ${response.statusText}`,
          response.status,
          errorData.detail || errorData.message
        );
      }

      const result = await response.json() as JobSubmitResponse;
      logger.info(`Job submitted successfully: ${result.jobId}`);
      return result;
    } catch (error) {
      if (error instanceof CloudClientError) {
        throw error;
      }
      throw new CloudClientError(
        `Failed to submit job: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const { apiUrl, token } = this.config;

    if (!token) {
      throw new CloudClientError('Authentication token not found');
    }

    try {
      const response = await fetch(`${apiUrl}/v1/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        throw new CloudClientError(
          `Failed to get job status: ${response.statusText}`,
          response.status,
          errorData.detail
        );
      }

      return await response.json() as JobStatusResponse;
    } catch (error) {
      if (error instanceof CloudClientError) {
        throw error;
      }
      throw new CloudClientError(
        `Failed to get job status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const { apiUrl, token } = this.config;

    if (!token) {
      throw new CloudClientError('Authentication token not found');
    }

    try {
      const response = await fetch(`${apiUrl}/v1/jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        throw new CloudClientError(
          `Failed to cancel job: ${response.statusText}`,
          response.status,
          errorData.detail
        );
      }

      logger.info(`Job ${jobId} cancelled successfully`);
    } catch (error) {
      if (error instanceof CloudClientError) {
        throw error;
      }
      throw new CloudClientError(
        `Failed to cancel job: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CloudConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<CloudConfig> {
    return { ...this.config };
  }
}

/**
 * Get cloud client instance with authentication
 */
export async function getCloudClient(context: vscode.ExtensionContext): Promise<CloudClient> {
  // Get API URL from configuration
  const config = vscode.workspace.getConfiguration('livecalc');
  const apiUrl = config.get<string>('cloud.apiUrl');

  if (!apiUrl) {
    throw new CloudClientError('Cloud API URL not configured. Please set livecalc.cloud.apiUrl in settings.');
  }

  // Get auth token from Assumptions Manager auth (reuse same JWT)
  const token = await context.secrets.get('am.token');

  if (!token) {
    throw new CloudClientError(
      'Not authenticated. Please login to Assumptions Manager first.',
      401
    );
  }

  return new CloudClient({ apiUrl, token });
}
