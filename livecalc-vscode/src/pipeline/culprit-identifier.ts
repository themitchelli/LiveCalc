/**
 * Culprit Identifier for Pipeline Debugging
 *
 * Integrates with IntegrityChecker to automatically identify which pipeline node
 * corrupted shared memory. Displays integrity failures in the Pipeline View with
 * visual indicators and detailed reports.
 *
 * @module pipeline/culprit-identifier
 */

import type { IntegrityCheckResult, IntegrityReport } from '@livecalc/engine';

/**
 * Integrity failure information for UI display
 */
export interface IntegrityFailure {
  /** Bus resource that failed integrity check */
  busResource: string;
  /** Node that produced the corrupted data (culprit) */
  culpritNodeId: string;
  /** Node that detected the corruption (consumer) */
  consumerNodeId: string;
  /** Expected checksum value */
  expectedChecksum: string;
  /** Actual checksum value */
  actualChecksum: string;
  /** Byte offset of first difference (if available) */
  diffOffset?: number;
  /** Timestamp of failure */
  timestamp: number;
  /** Human-readable description */
  description: string;
}

/**
 * Integrity summary for pipeline execution
 */
export interface IntegritySummary {
  /** Whether all integrity checks passed */
  allValid: boolean;
  /** Total checks performed */
  totalChecked: number;
  /** Total failures detected */
  totalFailed: number;
  /** List of failures */
  failures: IntegrityFailure[];
  /** Set of culprit node IDs */
  culpritNodeIds: string[];
  /** Timestamp of summary generation */
  timestamp: number;
}

/**
 * CulpritIdentifier manages integrity check results and provides
 * formatted information for UI display.
 */
export class CulpritIdentifier {
  private _currentSummary: IntegritySummary | null = null;
  private _failureHistory: IntegrityFailure[] = [];
  private readonly _maxHistorySize: number;

  /**
   * Create a new CulpritIdentifier
   *
   * @param maxHistorySize - Maximum number of failures to keep in history
   */
  constructor(maxHistorySize = 100) {
    this._maxHistorySize = maxHistorySize;
  }

  /**
   * Process an integrity report and generate summary
   *
   * @param report - Integrity report from IntegrityChecker
   * @returns Integrity summary for display
   */
  processReport(report: IntegrityReport): IntegritySummary {
    const failures: IntegrityFailure[] = [];

    for (const result of report.results) {
      if (!result.valid) {
        const failure = this.formatFailure(result);
        failures.push(failure);
        this.addToHistory(failure);
      }
    }

    this._currentSummary = {
      allValid: report.allValid,
      totalChecked: report.totalChecked,
      totalFailed: report.totalFailed,
      failures,
      culpritNodeIds: report.culpritNodeIds,
      timestamp: report.timestamp,
    };

    return this._currentSummary;
  }

  /**
   * Format an integrity check result into a displayable failure
   *
   * @param result - Integrity check result
   * @returns Formatted integrity failure
   */
  private formatFailure(result: IntegrityCheckResult): IntegrityFailure {
    const expectedHex = `0x${result.expectedChecksum.toString(16).padStart(8, '0')}`;
    const actualHex = `0x${result.actualChecksum.toString(16).padStart(8, '0')}`;

    const description = this.generateDescription(result);

    return {
      busResource: result.busResource,
      culpritNodeId: result.culpritNodeId ?? 'unknown',
      consumerNodeId: result.consumerNodeId ?? 'unknown',
      expectedChecksum: expectedHex,
      actualChecksum: actualHex,
      diffOffset: result.diffOffset,
      timestamp: result.timestamp,
      description,
    };
  }

  /**
   * Generate human-readable description of integrity failure
   *
   * @param result - Integrity check result
   * @returns Description string
   */
  private generateDescription(result: IntegrityCheckResult): string {
    const resource = result.busResource.replace('bus://', '');
    const culprit = result.culpritNodeId ?? 'unknown';
    const consumer = result.consumerNodeId ?? 'unknown';

    let description = `Data corruption detected in '${resource}'.`;
    description += ` Node '${culprit}' wrote invalid data.`;
    description += ` Detected by node '${consumer}' during read.`;

    if (result.diffOffset !== undefined) {
      description += ` First difference at byte offset ${result.diffOffset}.`;
    }

    return description;
  }

  /**
   * Add failure to history with size limit
   *
   * @param failure - Integrity failure to add
   */
  private addToHistory(failure: IntegrityFailure): void {
    this._failureHistory.push(failure);

    // Trim history if it exceeds max size
    if (this._failureHistory.length > this._maxHistorySize) {
      this._failureHistory = this._failureHistory.slice(-this._maxHistorySize);
    }
  }

  /**
   * Get current integrity summary
   *
   * @returns Current summary or null if no report processed
   */
  getCurrentSummary(): IntegritySummary | null {
    return this._currentSummary;
  }

  /**
   * Get failure history
   *
   * @param limit - Maximum number of recent failures to return
   * @returns Array of recent failures
   */
  getFailureHistory(limit?: number): IntegrityFailure[] {
    if (limit && limit < this._failureHistory.length) {
      return this._failureHistory.slice(-limit);
    }
    return [...this._failureHistory];
  }

  /**
   * Check if a specific node is a culprit
   *
   * @param nodeId - Node ID to check
   * @returns True if node is identified as a culprit
   */
  isNodeCulprit(nodeId: string): boolean {
    if (!this._currentSummary) {
      return false;
    }
    return this._currentSummary.culpritNodeIds.includes(nodeId);
  }

  /**
   * Get failures for a specific node
   *
   * @param nodeId - Node ID to get failures for
   * @returns Array of failures where this node is the culprit
   */
  getFailuresForNode(nodeId: string): IntegrityFailure[] {
    if (!this._currentSummary) {
      return [];
    }
    return this._currentSummary.failures.filter((f) => f.culpritNodeId === nodeId);
  }

  /**
   * Get failures for a specific bus resource
   *
   * @param busResource - Bus resource name
   * @returns Array of failures for this resource
   */
  getFailuresForResource(busResource: string): IntegrityFailure[] {
    if (!this._currentSummary) {
      return [];
    }
    return this._currentSummary.failures.filter((f) => f.busResource === busResource);
  }

  /**
   * Clear current summary and optionally history
   *
   * @param clearHistory - Whether to clear failure history
   */
  clear(clearHistory = false): void {
    this._currentSummary = null;
    if (clearHistory) {
      this._failureHistory = [];
    }
  }

  /**
   * Generate detailed integrity report as text
   *
   * @returns Formatted text report
   */
  generateTextReport(): string {
    if (!this._currentSummary) {
      return 'No integrity report available';
    }

    const lines: string[] = [];
    lines.push('=== Pipeline Integrity Report ===');
    lines.push('');
    lines.push(`Status: ${this._currentSummary.allValid ? 'PASSED' : 'FAILED'}`);
    lines.push(`Total Checks: ${this._currentSummary.totalChecked}`);
    lines.push(`Failed Checks: ${this._currentSummary.totalFailed}`);
    lines.push('');

    if (this._currentSummary.totalFailed > 0) {
      lines.push('Failures:');
      lines.push('');

      for (let i = 0; i < this._currentSummary.failures.length; i++) {
        const failure = this._currentSummary.failures[i];
        lines.push(`${i + 1}. ${failure.busResource}`);
        lines.push(`   Culprit: ${failure.culpritNodeId}`);
        lines.push(`   Consumer: ${failure.consumerNodeId}`);
        lines.push(`   Expected: ${failure.expectedChecksum}`);
        lines.push(`   Actual:   ${failure.actualChecksum}`);
        if (failure.diffOffset !== undefined) {
          lines.push(`   Diff at:  byte ${failure.diffOffset}`);
        }
        lines.push(`   ${failure.description}`);
        lines.push('');
      }

      lines.push('Culprit Nodes:');
      for (const nodeId of this._currentSummary.culpritNodeIds) {
        const failureCount = this.getFailuresForNode(nodeId).length;
        lines.push(`  - ${nodeId} (${failureCount} failure${failureCount > 1 ? 's' : ''})`);
      }
    }

    lines.push('');
    lines.push(`Report generated: ${new Date(this._currentSummary.timestamp).toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Export summary as JSON
   *
   * @returns JSON string of current summary
   */
  exportJSON(): string {
    if (!this._currentSummary) {
      return JSON.stringify({ error: 'No integrity report available' });
    }
    return JSON.stringify(this._currentSummary, null, 2);
  }
}

/**
 * Create a CulpritIdentifier instance
 *
 * @param maxHistorySize - Maximum number of failures to keep in history
 * @returns CulpritIdentifier instance
 */
export function createCulpritIdentifier(maxHistorySize = 100): CulpritIdentifier {
  return new CulpritIdentifier(maxHistorySize);
}
