/**
 * LiveCalc Results Panel - Main JavaScript
 * Handles communication with VS Code extension and renders results
 */

/* global Chart, vscode */

// Acquire VS Code API
const vscode = acquireVsCodeApi();

// Global state
let currentState = { type: 'empty' };
let previousResults = null;
let comparisonBaseline = null;
let chart = null;
let chartType = 'histogram'; // 'histogram' or 'density'

// Display settings (configurable from extension)
let displaySettings = {
  currency: 'GBP',
  decimalPlaces: 0,
};

// DOM elements (cached on init)
const elements = {};

/**
 * Initialize the webview
 */
function init() {
  // Cache DOM elements
  elements.loadingState = document.getElementById('loading-state');
  elements.errorState = document.getElementById('error-state');
  elements.emptyState = document.getElementById('empty-state');
  elements.resultsState = document.getElementById('results-state');
  elements.loadingMessage = document.getElementById('loading-message');
  elements.errorTitle = document.getElementById('error-title');
  elements.errorMessage = document.getElementById('error-message');
  elements.errorDetails = document.getElementById('error-details');
  elements.errorDetailsContainer = document.getElementById('error-details-container');
  elements.exportBtn = document.getElementById('export-btn');
  elements.exportMenu = document.getElementById('export-menu');
  elements.chartCanvas = document.getElementById('distribution-chart');
  elements.toggleChartType = document.getElementById('toggle-chart-type');
  elements.footerSummary = document.getElementById('footer-summary');
  elements.statPolicies = document.getElementById('stat-policies');
  elements.statScenarios = document.getElementById('stat-scenarios');
  elements.statExecTime = document.getElementById('stat-exectime');
  elements.comparisonActions = document.getElementById('comparison-actions');
  elements.clearComparisonBtn = document.getElementById('clear-comparison-btn');
  elements.assumptionsList = document.getElementById('assumptions-list');

  // Setup event listeners
  setupEventListeners();

  // Initialize chart
  initChart();

  // Notify extension that webview is ready
  vscode.postMessage({ type: 'ready' });

  // Restore state if any
  const savedState = vscode.getState();
  if (savedState) {
    previousResults = savedState.previousResults;
    comparisonBaseline = savedState.comparisonBaseline;
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Retry button
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'retry' });
  });

  // View logs button
  document.getElementById('view-logs-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'viewLogs' });
  });

  // Export dropdown
  elements.exportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.exportMenu?.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    elements.exportMenu?.classList.add('hidden');
  });

  // Export menu items
  elements.exportMenu?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      vscode.postMessage({ type: 'export', format });
      elements.exportMenu.classList.add('hidden');
    });
  });

  // Toggle chart type
  elements.toggleChartType?.addEventListener('click', () => {
    chartType = chartType === 'histogram' ? 'density' : 'histogram';
    elements.toggleChartType.textContent = chartType === 'histogram' ? 'Histogram' : 'Density';
    if (currentState.type === 'results') {
      updateChart(currentState.results.distribution, currentState.results.statistics);
    }
    vscode.postMessage({ type: 'toggleChartType' });
  });

  // Clear comparison
  elements.clearComparisonBtn?.addEventListener('click', () => {
    comparisonBaseline = null;
    saveState();
    hideComparison();
    vscode.postMessage({ type: 'clearComparison' });
  });

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    handleMessage(message);
  });
}

/**
 * Handle message from extension
 */
function handleMessage(message) {
  switch (message.type) {
    case 'setState':
      setState(message.state);
      break;
    case 'setLoading':
      showLoading(message.message);
      break;
    case 'setError':
      showError(message.error, message.details);
      break;
    case 'setResults':
      showResults(message.results);
      break;
    case 'clearComparison':
      comparisonBaseline = null;
      saveState();
      hideComparison();
      break;
    case 'pinComparison':
      if (currentState.type === 'results') {
        comparisonBaseline = currentState.results;
        saveState();
      }
      break;
    case 'setSettings':
      displaySettings = message.settings;
      // Re-render statistics if we have results
      if (currentState.type === 'results') {
        updateStatistics(currentState.results.statistics);
      }
      break;
  }
}

/**
 * Set the panel state
 */
function setState(state) {
  currentState = state;

  switch (state.type) {
    case 'empty':
      showEmpty();
      break;
    case 'loading':
      showLoading(state.message);
      break;
    case 'error':
      showError(state.error, state.details);
      break;
    case 'results':
      showResults(state.results);
      break;
  }
}

/**
 * Show loading state
 */
function showLoading(message) {
  currentState = { type: 'loading', message };
  hideAllStates();
  elements.loadingMessage.textContent = message || 'Loading...';
  elements.loadingState.classList.remove('hidden');
}

/**
 * Show empty state
 */
function showEmpty() {
  currentState = { type: 'empty' };
  hideAllStates();
  elements.emptyState.classList.remove('hidden');
}

/**
 * Show error state
 */
function showError(error, details) {
  currentState = { type: 'error', error, details };
  hideAllStates();
  elements.errorMessage.textContent = error;

  if (details) {
    elements.errorDetails.textContent = details;
    elements.errorDetailsContainer.classList.remove('hidden');
  } else {
    elements.errorDetailsContainer.classList.add('hidden');
  }

  elements.errorState.classList.remove('hidden');
}

/**
 * Show results state
 */
function showResults(results) {
  // Store previous for comparison (if not already storing baseline)
  if (currentState.type === 'results' && !comparisonBaseline) {
    previousResults = currentState.results;
  }

  currentState = { type: 'results', results };
  saveState();

  hideAllStates();
  elements.resultsState.classList.remove('hidden');

  // Update statistics
  updateStatistics(results.statistics);

  // Update run info (policies, scenarios, execution time)
  updateRunInfo(results.metadata, results.executionTimeMs);

  // Update chart
  updateChart(results.distribution, results.statistics);

  // Update metadata
  updateMetadata(results.metadata);

  // Update assumptions
  updateAssumptions(results.assumptions);

  // Update footer
  updateFooter(results);

  // Update comparison if baseline exists
  if (comparisonBaseline || previousResults) {
    const baseline = comparisonBaseline || previousResults;
    showComparison(results.statistics, baseline.statistics);
  } else {
    hideComparison();
  }
}

/**
 * Hide all state containers
 */
function hideAllStates() {
  elements.loadingState?.classList.add('hidden');
  elements.errorState?.classList.add('hidden');
  elements.emptyState?.classList.add('hidden');
  elements.resultsState?.classList.add('hidden');
}

/**
 * Update statistics display
 */
function updateStatistics(stats) {
  setStatValue('stat-mean', stats.mean);
  setStatValue('stat-stddev', stats.stdDev);
  setStatValue('stat-cte95', stats.cte95);
  setStatValue('stat-p50', stats.p50);
  setStatValue('stat-p75', stats.p75);
  setStatValue('stat-p90', stats.p90);
  setStatValue('stat-p95', stats.p95);
  setStatValue('stat-p99', stats.p99);

  // Min/max doesn't use standard formatting
  const minMaxEl = document.getElementById('stat-minmax');
  if (minMaxEl) {
    minMaxEl.textContent = `${formatCurrency(stats.min)} / ${formatCurrency(stats.max)}`;
  }
}

/**
 * Set a statistic value with formatting
 */
function setStatValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.textContent = formatCurrency(value);
  el.classList.toggle('negative', value < 0);
}

/**
 * Show comparison deltas
 */
function showComparison(current, baseline) {
  elements.comparisonActions?.classList.remove('hidden');

  const pairs = [
    ['delta-mean', current.mean, baseline.mean],
    ['delta-stddev', current.stdDev, baseline.stdDev],
    ['delta-cte95', current.cte95, baseline.cte95],
    ['delta-p50', current.p50, baseline.p50],
    ['delta-p75', current.p75, baseline.p75],
    ['delta-p90', current.p90, baseline.p90],
    ['delta-p95', current.p95, baseline.p95],
    ['delta-p99', current.p99, baseline.p99],
  ];

  pairs.forEach(([elementId, currentVal, baselineVal]) => {
    const el = document.getElementById(elementId);
    if (!el) return;

    const delta = calculateDelta(currentVal, baselineVal);
    el.textContent = formatDelta(delta);
    el.className = 'stat-delta ' + delta.direction;
    el.classList.remove('hidden');
  });
}

/**
 * Hide comparison deltas
 */
function hideComparison() {
  elements.comparisonActions?.classList.add('hidden');

  const deltaIds = [
    'delta-mean',
    'delta-stddev',
    'delta-cte95',
    'delta-p50',
    'delta-p75',
    'delta-p90',
    'delta-p95',
    'delta-p99',
  ];

  deltaIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

/**
 * Calculate delta between two values
 */
function calculateDelta(current, baseline) {
  const absolute = current - baseline;
  const percentage = baseline !== 0 ? (absolute / Math.abs(baseline)) * 100 : 0;

  let direction;
  if (Math.abs(percentage) < 0.1) {
    direction = 'neutral';
  } else if (absolute > 0) {
    direction = 'positive';
  } else {
    direction = 'negative';
  }

  return { absolute, percentage, direction };
}

/**
 * Format delta for display
 */
function formatDelta(delta) {
  const sign = delta.absolute >= 0 ? '+' : '';
  const formatted = formatCurrency(delta.absolute, false);
  const percent = delta.percentage.toFixed(1);
  return `${sign}${formatted} (${sign}${percent}%)`;
}

/**
 * Update metadata display
 */
function updateMetadata(metadata) {
  document.getElementById('meta-runid').textContent = metadata.runId;
  document.getElementById('meta-timestamp').textContent = formatTimestamp(metadata.timestamp);
  document.getElementById('meta-model').textContent = metadata.modelFile;
  document.getElementById('meta-policies').textContent = metadata.policyFile || '-';
  document.getElementById('meta-policy-count').textContent = metadata.policyCount.toLocaleString();
  document.getElementById('meta-scenario-count').textContent = metadata.scenarioCount.toLocaleString();
  document.getElementById('meta-seed').textContent = metadata.seed;
  document.getElementById('meta-mode').textContent = metadata.executionMode === 'cloud' ? 'Cloud' : 'Local';
}

/**
 * Update assumptions display
 */
function updateAssumptions(assumptions) {
  if (!elements.assumptionsList) return;

  elements.assumptionsList.innerHTML = assumptions
    .map((a) => {
      const multiplierHtml = a.multiplier && a.multiplier !== 1 ? `<span class="assumption-multiplier">${a.multiplier}x</span>` : '';
      const modifiedHtml = a.modified ? '<span class="assumption-modified">(modified)</span>' : '';
      const sourceHtml = a.isLocal
        ? `<span class="assumption-source" data-path="${escapeHtml(a.source)}">${escapeHtml(getFileName(a.source))}</span>`
        : `<span>${escapeHtml(a.source)}</span>`;

      return `
        <li>
          <span class="assumption-name">${escapeHtml(a.name)}</span>
          <span>
            ${sourceHtml}
            ${multiplierHtml}
            ${modifiedHtml}
          </span>
        </li>
      `;
    })
    .join('');

  // Add click handlers for local file links
  elements.assumptionsList.querySelectorAll('.assumption-source').forEach((el) => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      if (filePath) {
        vscode.postMessage({ type: 'openFile', path: filePath });
      }
    });
  });
}

/**
 * Update run info display (policies, scenarios, execution time)
 */
function updateRunInfo(metadata, executionTimeMs) {
  if (elements.statPolicies) {
    elements.statPolicies.textContent = metadata.policyCount.toLocaleString();
  }
  if (elements.statScenarios) {
    elements.statScenarios.textContent = metadata.scenarioCount.toLocaleString();
  }
  if (elements.statExecTime) {
    elements.statExecTime.textContent = formatDuration(executionTimeMs);
  }
}

/**
 * Update footer summary
 */
function updateFooter(results) {
  const policyCount = results.metadata.policyCount.toLocaleString();
  const scenarioCount = results.metadata.scenarioCount.toLocaleString();
  const duration = formatDuration(results.executionTimeMs);

  elements.footerSummary.textContent = `${policyCount} policies \u00D7 ${scenarioCount} scenarios \u2022 Completed in ${duration}`;
}

/**
 * Initialize Chart.js chart
 */
function initChart() {
  if (!elements.chartCanvas) return;

  const ctx = elements.chartCanvas.getContext('2d');

  // Get theme colors from CSS variables
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue('--vscode-editor-foreground').trim() || '#cccccc';
  const gridColor = style.getPropertyValue('--vscode-panel-border').trim() || '#3c3c3c';

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Frequency',
          data: [],
          backgroundColor: 'rgba(14, 99, 156, 0.7)',
          borderColor: 'rgba(14, 99, 156, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // Disable animation for fast updates
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (items.length === 0) return '';
              const item = items[0];
              return `${item.label}`;
            },
            label: (item) => {
              return `Count: ${item.raw}`;
            },
          },
        },
        annotation: {
          annotations: {},
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'NPV',
            color: textColor,
          },
          ticks: {
            color: textColor,
            maxTicksLimit: 8,
          },
          grid: {
            color: gridColor,
          },
        },
        y: {
          title: {
            display: true,
            text: 'Frequency',
            color: textColor,
          },
          ticks: {
            color: textColor,
          },
          grid: {
            color: gridColor,
          },
        },
      },
    },
  });
}

/**
 * Update chart with new data
 */
function updateChart(distribution, stats) {
  if (!chart || !distribution || distribution.length === 0) return;

  // Calculate histogram bins
  const binCount = Math.min(Math.max(50, Math.sqrt(distribution.length)), 100);
  const { bins, counts, binWidth } = calculateHistogram(distribution, binCount);

  // Update chart data
  chart.data.labels = bins.map((b) => formatCurrency(b, false));
  chart.data.datasets[0].data = counts;

  // Add percentile annotations
  const annotations = {};

  // Mean line
  const meanBinIndex = findBinIndex(stats.mean, bins, binWidth);
  annotations.meanLine = {
    type: 'line',
    xMin: meanBinIndex,
    xMax: meanBinIndex,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 2,
    borderDash: [5, 5],
    label: {
      display: true,
      content: 'Mean',
      position: 'start',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#ffffff',
      font: { size: 10 },
    },
  };

  // P95 line
  const p95BinIndex = findBinIndex(stats.p95, bins, binWidth);
  annotations.p95Line = {
    type: 'line',
    xMin: p95BinIndex,
    xMax: p95BinIndex,
    borderColor: 'rgba(241, 76, 76, 0.8)',
    borderWidth: 2,
    label: {
      display: true,
      content: 'P95',
      position: 'start',
      backgroundColor: 'rgba(241, 76, 76, 0.7)',
      color: '#ffffff',
      font: { size: 10 },
    },
  };

  // P99 line
  const p99BinIndex = findBinIndex(stats.p99, bins, binWidth);
  annotations.p99Line = {
    type: 'line',
    xMin: p99BinIndex,
    xMax: p99BinIndex,
    borderColor: 'rgba(204, 167, 0, 0.8)',
    borderWidth: 2,
    label: {
      display: true,
      content: 'P99',
      position: 'start',
      backgroundColor: 'rgba(204, 167, 0, 0.7)',
      color: '#ffffff',
      font: { size: 10 },
    },
  };

  // CTE shaded region (tail beyond P95)
  annotations.cteRegion = {
    type: 'box',
    xMin: p95BinIndex,
    xMax: bins.length - 1,
    backgroundColor: 'rgba(241, 76, 76, 0.15)',
    borderWidth: 0,
  };

  chart.options.plugins.annotation.annotations = annotations;
  chart.update('none'); // Update without animation
}

/**
 * Calculate histogram bins and counts
 */
function calculateHistogram(data, binCount) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binWidth = (max - min) / binCount;

  const bins = [];
  const counts = new Array(binCount).fill(0);

  for (let i = 0; i < binCount; i++) {
    bins.push(min + i * binWidth + binWidth / 2);
  }

  for (const value of data) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    counts[binIndex]++;
  }

  return { bins, counts, binWidth };
}

/**
 * Find bin index for a value
 */
function findBinIndex(value, bins, binWidth) {
  if (bins.length === 0) return 0;
  const min = bins[0] - binWidth / 2;
  return Math.min(Math.max(0, Math.floor((value - min) / binWidth)), bins.length - 1);
}

/**
 * Get currency symbol for configured currency
 */
function getCurrencySymbol() {
  switch (displaySettings.currency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '\u20AC';
    case 'GBP':
    default:
      return '\u00A3';
  }
}

/**
 * Format currency value
 */
function formatCurrency(value, abbreviate = true) {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const decimals = displaySettings.decimalPlaces;

  let formatted;
  let suffix = '';

  if (abbreviate && absValue >= 1000000000) {
    // For billions, use 2 decimals for precision
    formatted = (absValue / 1000000000).toFixed(2);
    suffix = 'B';
  } else if (abbreviate && absValue >= 1000000) {
    // For millions, use 2 decimals for precision
    formatted = (absValue / 1000000).toFixed(2);
    suffix = 'M';
  } else if (abbreviate && absValue >= 1000) {
    // For thousands, use 1 decimal
    formatted = (absValue / 1000).toFixed(1);
    suffix = 'K';
  } else {
    // For small numbers, use configured decimal places
    formatted = absValue.toFixed(decimals);
  }

  // Add thousands separator
  const parts = formatted.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  formatted = parts.join('.');

  const currencySymbol = getCurrencySymbol();
  return `${sign}${currencySymbol}${formatted}${suffix}`;
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Get file name from path
 */
function getFileName(path) {
  const cleaned = path.replace(/^local:\/\//, '');
  return cleaned.split('/').pop() || cleaned;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Save state to VS Code
 */
function saveState() {
  vscode.setState({
    previousResults,
    comparisonBaseline,
  });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
