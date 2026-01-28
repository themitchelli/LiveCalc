/**
 * Google Colab GPU API Client
 *
 * Client for communicating with the LiveCalc GPU API running on Google Colab.
 * Handles job submission, status polling, and result retrieval.
 */

import * as vscode from 'vscode';

export interface ColabHealthResponse {
    status: string;
    gpu_model: string;
    gpu_memory_gb: number;
    compute_capability: string;
    active_jobs: number;
    total_jobs: number;
}

export interface JobSubmitResponse {
    job_id: string;
    status: string;
    submitted_at: string;
    num_policies: number;
    num_scenarios: number;
}

export interface JobStatusResponse {
    job_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    submitted_at: string;
    started_at?: string;
    completed_at?: string;
    progress: number;
    error?: string;
}

export interface JobResultResponse {
    job_id: string;
    status: string;
    npvs: number[][];
    statistics: {
        mean: number;
        std: number;
        min: number;
        max: number;
        median: number;
    };
    timing: {
        total_runtime: number;
        kernel_time: number;
        memory_transfer_time: number;
    };
    gpu_model: string;
}

export class ColabClient {
    private baseUrl: string;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private lastHealthCheck: Date | null = null;
    private isConnected: boolean = false;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    /**
     * Check if Colab server is healthy
     */
    async checkHealth(): Promise<ColabHealthResponse> {
        const response = await fetch(`${this.baseUrl}/health`);

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this.lastHealthCheck = new Date();
        this.isConnected = true;

        return data;
    }

    /**
     * Submit a projection job to Colab
     */
    async submitJob(jobData: any): Promise<JobSubmitResponse> {
        const response = await fetch(`${this.baseUrl}/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jobData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Job submission failed: ${response.status} ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Get job status
     */
    async getJobStatus(jobId: string): Promise<JobStatusResponse> {
        const response = await fetch(`${this.baseUrl}/status/${jobId}`);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Job not found: ${jobId}`);
            }
            throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get job results
     */
    async getJobResults(jobId: string): Promise<JobResultResponse> {
        const response = await fetch(`${this.baseUrl}/results/${jobId}`);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Job not found: ${jobId}`);
            }
            if (response.status === 400) {
                const error = await response.json();
                throw new Error(error.detail || 'Job not completed');
            }
            throw new Error(`Results retrieval failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Cancel a running job
     */
    async cancelJob(jobId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/job/${jobId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Job cancellation failed: ${response.status} ${response.statusText}`);
        }
    }

    /**
     * Poll job until completion
     */
    async pollJobUntilComplete(
        jobId: string,
        onProgress?: (status: JobStatusResponse) => void,
        timeoutMs: number = 300000 // 5 minutes default
    ): Promise<JobResultResponse> {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds

        while (true) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Job polling timeout after ${timeoutMs}ms`);
            }

            // Get status
            const status = await this.getJobStatus(jobId);

            // Call progress callback
            if (onProgress) {
                onProgress(status);
            }

            // Check if completed
            if (status.status === 'completed') {
                return await this.getJobResults(jobId);
            }

            // Check if failed
            if (status.status === 'failed') {
                throw new Error(`Job failed: ${status.error || 'Unknown error'}`);
            }

            // Check if cancelled
            if (status.status === 'cancelled') {
                throw new Error('Job was cancelled');
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs: number, onDisconnect?: () => void): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.checkHealth();
                this.isConnected = true;
            } catch (error) {
                this.isConnected = false;
                if (onDisconnect) {
                    onDisconnect();
                }
            }
        }, intervalMs);

        // Initial health check
        this.checkHealth().catch(() => {
            this.isConnected = false;
        });
    }

    /**
     * Stop health checks
     */
    stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Check if connected
     */
    getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Get last health check time
     */
    getLastHealthCheck(): Date | null {
        return this.lastHealthCheck;
    }

    /**
     * Update base URL
     */
    setBaseUrl(url: string): void {
        this.baseUrl = url.replace(/\/$/, '');
        this.isConnected = false;
        this.lastHealthCheck = null;
    }

    /**
     * Dispose and cleanup
     */
    dispose(): void {
        this.stopHealthChecks();
    }
}

/**
 * Get Colab client from configuration
 */
export function getColabClient(): ColabClient | null {
    const config = vscode.workspace.getConfiguration('livecalc');
    const colabUrl = config.get<string>('colabApiUrl');

    if (!colabUrl || colabUrl.trim() === '') {
        return null;
    }

    return new ColabClient(colabUrl);
}
