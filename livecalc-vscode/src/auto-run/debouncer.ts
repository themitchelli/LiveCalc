import * as vscode from 'vscode';
import { logger } from '../logging/logger';

/**
 * Debouncer for auto-run functionality
 * Delays execution until no new changes arrive within the debounce period
 */
export class Debouncer implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private pendingFiles: Set<string> = new Set();
  private delayMs: number;
  private callback: ((files: string[]) => void) | undefined;

  constructor(delayMs: number = 500) {
    this.delayMs = delayMs;
  }

  /**
   * Set the callback to invoke when debounce period expires
   */
  public setCallback(callback: (files: string[]) => void): void {
    this.callback = callback;
  }

  /**
   * Get the current debounce delay
   */
  public getDelayMs(): number {
    return this.delayMs;
  }

  /**
   * Update the debounce delay
   */
  public setDelayMs(delayMs: number): void {
    this.delayMs = delayMs;
    logger.debug(`Debounce delay updated to ${delayMs}ms`);
  }

  /**
   * Add a file change to the debounce queue
   * Resets the timer if already running
   */
  public debounce(filePath: string): void {
    this.pendingFiles.add(filePath);
    logger.debug(`File change debounced: ${filePath} (${this.pendingFiles.size} pending)`);

    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Start new timer
    this.timer = setTimeout(() => {
      this.flush();
    }, this.delayMs);
  }

  /**
   * Immediately flush pending changes and invoke callback
   */
  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.pendingFiles.size > 0 && this.callback) {
      const files = Array.from(this.pendingFiles);
      this.pendingFiles.clear();
      logger.debug(`Debounce flushing ${files.length} files`);
      this.callback(files);
    }
  }

  /**
   * Cancel pending changes without invoking callback
   */
  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const count = this.pendingFiles.size;
    this.pendingFiles.clear();
    if (count > 0) {
      logger.debug(`Debounce cancelled ${count} pending files`);
    }
  }

  /**
   * Get list of pending files
   */
  public getPendingFiles(): string[] {
    return Array.from(this.pendingFiles);
  }

  /**
   * Check if there are pending changes
   */
  public hasPending(): boolean {
    return this.pendingFiles.size > 0;
  }

  /**
   * Get count of pending changes
   */
  public getPendingCount(): number {
    return this.pendingFiles.size;
  }

  public dispose(): void {
    this.cancel();
    this.callback = undefined;
  }
}
