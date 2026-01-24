import * as vscode from 'vscode';
import { LogLevel } from '../types';

/**
 * Logger for LiveCalc extension
 * Outputs to VS Code Output Channel with configurable log level
 */
export class Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel;
  private static instance: Logger;

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

  public show(): void {
    this.outputChannel.show(true);
  }

  public clear(): void {
    this.outputChannel.clear();
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}

export const logger = Logger.getInstance();
