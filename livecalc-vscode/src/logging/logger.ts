import * as vscode from 'vscode';
import { LogLevel } from '../types';

/**
 * Performance metrics for logging
 */
export interface PerformanceMetrics {
  policyCount: number;
  scenarioCount: number;
  executionTimeMs: number;
  policiesPerSecond?: number;
  memoryUsageMb?: number;
}

/**
 * Logger for LiveCalc extension
 * Outputs to VS Code Output Channel with configurable log level
 */
export class Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel;
  private static instance: Logger;
  private timers: Map<string, number> = new Map();

  private readonly levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('LiveCalc');
    this.logLevel = this.getConfiguredLogLevel();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getConfiguredLogLevel(): LogLevel {
    const config = vscode.workspace.getConfiguration('livecalc');
    return config.get<LogLevel>('logLevel', 'info');
  }

  public updateLogLevel(): void {
    this.logLevel = this.getConfiguredLogLevel();
  }

  /**
   * Get current log level
   */
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] <= this.levelPriority[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    return `[${timestamp}] [${levelUpper}] ${message}`;
  }

  public error(message: string, error?: Error): void {
    if (this.shouldLog('error')) {
      this.outputChannel.appendLine(this.formatMessage('error', message));
      if (error?.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    }
  }

  public warn(message: string): void {
    if (this.shouldLog('warn')) {
      this.outputChannel.appendLine(this.formatMessage('warn', message));
    }
  }

  public info(message: string): void {
    if (this.shouldLog('info')) {
      this.outputChannel.appendLine(this.formatMessage('info', message));
    }
  }

  public debug(message: string): void {
    if (this.shouldLog('debug')) {
      this.outputChannel.appendLine(this.formatMessage('debug', message));
    }
  }

  /**
   * Start a timer for measuring durations
   */
  public startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * End a timer and log the elapsed time
   */
  public endTimer(name: string, logLevel: LogLevel = 'debug'): number {
    const start = this.timers.get(name);
    if (!start) {
      this.warn(`Timer '${name}' was not started`);
      return 0;
    }
    const elapsed = Date.now() - start;
    this.timers.delete(name);

    const msg = `${name}: ${elapsed}ms`;
    switch (logLevel) {
      case 'error':
        this.error(msg);
        break;
      case 'warn':
        this.warn(msg);
        break;
      case 'info':
        this.info(msg);
        break;
      case 'debug':
        this.debug(msg);
        break;
    }
    return elapsed;
  }

  /**
   * Log performance metrics from a valuation run
   */
  public logPerformanceMetrics(metrics: PerformanceMetrics): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const { policyCount, scenarioCount, executionTimeMs } = metrics;
    const totalProjections = policyCount * scenarioCount;
    const projectionsPerSecond = Math.round(
      (totalProjections / executionTimeMs) * 1000
    );

    const lines: string[] = [
      '--- Performance Metrics ---',
      `Policies: ${policyCount.toLocaleString()}`,
      `Scenarios: ${scenarioCount.toLocaleString()}`,
      `Total projections: ${totalProjections.toLocaleString()}`,
      `Execution time: ${executionTimeMs.toLocaleString()}ms`,
      `Throughput: ${projectionsPerSecond.toLocaleString()} projections/sec`,
    ];

    if (metrics.memoryUsageMb !== undefined) {
      lines.push(`Memory usage: ${metrics.memoryUsageMb.toFixed(1)} MB`);
    }

    lines.push('---------------------------');

    lines.forEach((line) => {
      this.outputChannel.appendLine(this.formatMessage('info', line));
    });
  }

  /**
   * Log a separator line for visual clarity
   */
  public separator(): void {
    if (this.shouldLog('info')) {
      this.outputChannel.appendLine('');
    }
  }

  /**
   * Log a milestone during execution
   */
  public milestone(message: string): void {
    this.info(`>>> ${message}`);
  }

  public show(): void {
    this.outputChannel.show(true);
  }

  public clear(): void {
    this.outputChannel.clear();
    this.info('Output channel cleared');
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}

export const logger = Logger.getInstance();
