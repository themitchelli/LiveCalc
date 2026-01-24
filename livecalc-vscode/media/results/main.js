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
let comparisonInfo = null; // Info about pinned/previous baseline
let baselineDistribution = null; // Distribution data for chart overlay
let showChartOverlay = false; // Whether to show baseline overlay on chart
let chart = null;
let chartType = 'histogram'; // 'histogram' or 'density'
let histogramBinData = { bins: [], binWidth: 0 }; // Store bin data for tooltips
let currentTriggerInfo = null; // Trigger info for auto-run indicator
let triggerAutoHideTimer = null; // Timer for auto-hiding trigger banner
let historyEntries = []; // Run history entries for display
let viewingHistoryRunId = null; // Run ID of currently viewed historical run (null = current)

// Display settings (configurable from extension)
let displaySettings = {
  currency: 'GBP',
  decimalPlaces: 0,
};

// DOM elements (cached on init)
const elements = {};

// Warnings state
let currentWarnings = [];

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
  elements.errorTypeBadge = document.getElementById('error-type-badge');
  elements.errorGuidanceContainer = document.getElementById('error-guidance-container');
  elements.errorGuidance = document.getElementById('error-guidance');
  elements.errorFileContainer = document.getElementById('error-file-container');
  elements.errorFile = document.getElementById('error-file');
  elements.warningsBanner = document.getElementById('warnings-banner');
  elements.warningsCount = document.getElementById('warnings-count');
  elements.warningsList = document.getElementById('warnings-list');
  elements.dismissWarningsBtn = document.getElementById('dismiss-warnings-btn');
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
  elements.pinComparisonBtn = document.getElementById('pin-comparison-btn');
  elements.comparisonBadge = document.getElementById('comparison-badge');
  elements.toggleChartOverlay = document.getElementById('toggle-chart-overlay');
  elements.triggerBanner = document.getElementById('trigger-banner');
  elements.triggerFiles = document.getElementById('trigger-files');
  elements.dismissTriggerBtn = document.getElementById('dismiss-trigger-btn');
  elements.historySection = document.getElementById('history-section');
  elements.historyCount = document.getElementById('history-count');
  elements.historyEmpty = document.getElementById('history-empty');
  elements.historyTable = document.getElementById('history-table');
  elements.historyBody = document.getElementById('history-body');
  elements.exportHistoryBtn = document.getElementById('export-history-btn');
  elements.clearHistoryBtn = document.getElementById('clear-history-btn');

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
    comparisonInfo = null;
    baselineDistribution = null;
    showChartOverlay = false;
    saveState();
    hideComparison();
    vscode.postMessage({ type: 'clearComparison' });
  });

  // Pin comparison
  elements.pinComparisonBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'pinComparison' });
  });

  // Toggle chart overlay
  elements.toggleChartOverlay?.addEventListener('click', () => {
    showChartOverlay = !showChartOverlay;
    elements.toggleChartOverlay.textContent = showChartOverlay ? 'Hide Overlay' : 'Show Overlay';
    if (currentState.type === 'results') {
      updateChart(currentState.results.distribution, currentState.results.statistics);
    }
    vscode.postMessage({ type: 'toggleChartOverlay' });
  });

  // Dismiss warnings button
  elements.dismissWarningsBtn?.addEventListener('click', () => {
    currentWarnings = [];
    elements.warningsBanner?.classList.add('hidden');
  });

  // Dismiss trigger banner button
  elements.dismissTriggerBtn?.addEventListener('click', () => {
    hideTriggerBanner();
    vscode.postMessage({ type: 'dismissTrigger' });
  });

  // Export history button
  elements.exportHistoryBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportHistory' });
  });

  // Clear history button
  elements.clearHistoryBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'clearHistory' });
  });

  // Pipeline data - bus resource selection
  document.getElementById('bus-resource-select')?.addEventListener('change', (e) => {
    const resourceName = e.target.value;
    selectBusResource(resourceName);
  });

  // Pipeline data - export bus resource
  document.getElementById('export-bus-resource-btn')?.addEventListener('click', () => {
    if (selectedBusResource) {
      vscode.postMessage({ type: 'exportBusResource', resourceName: selectedBusResource.name });
    }
  });

  // Pipeline data - comparison resource selection
  document.getElementById('comparison-resource-select')?.addEventListener('change', (e) => {
    const resourceNameB = e.target.value;
    if (resourceNameB) {
      compareBusResources(resourceNameB);
    } else {
      hideComparisonView();
      comparisonResourceB = null;
    }
  });

  // Pipeline data - inspect offset
  document.getElementById('inspect-offset-btn')?.addEventListener('click', () => {
    const offsetInput = document.getElementById('offset-input');
    if (offsetInput && offsetInput.value) {
      const offset = parseInt(offsetInput.value, 10);
      inspectOffset(offset);
    }
  });

  // Pipeline data - pagination
  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updateDataTable(selectedBusResource.data);
    }
  });

  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    if (selectedBusResource) {
      const totalPages = Math.ceil(selectedBusResource.data.length / pageSize);
      if (currentPage < totalPages) {
        currentPage++;
        updateDataTable(selectedBusResource.data);
      }
    }
  });

  document.getElementById('page-size-select')?.addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    currentPage = 1;
    if (selectedBusResource) {
      updateDataTable(selectedBusResource.data);
    }
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
    case 'setCancelled':
      showCancelled(message.message, message.newRunStarting);
      break;
    case 'setError':
      showError(message.error, message.details);
      break;
    case 'setErrorState':
      showStructuredError(message.errorState);
      break;
    case 'setWarnings':
      showWarnings(message.warnings);
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
    case 'setComparison':
      // Receive comparison state from extension (with persistence)
      if (message.comparison) {
        comparisonBaseline = message.comparison.baseline;
      }
      comparisonInfo = message.info;
      if (comparisonInfo) {
        baselineDistribution = comparisonInfo.baselineDistribution;
        updateComparisonUI();
        if (currentState.type === 'results') {
          showComparison(currentState.results.statistics, comparisonBaseline.statistics);
        }
      } else {
        hideComparison();
      }
      break;
    case 'setComparisonBaseline':
      // Receive baseline distribution for chart overlay
      baselineDistribution = message.distribution;
      updateComparisonUI();
      if (currentState.type === 'results') {
        updateChart(currentState.results.distribution, currentState.results.statistics);
      }
      break;
    case 'setSettings':
      displaySettings = message.settings;
      // Re-render statistics if we have results
      if (currentState.type === 'results') {
        updateStatistics(currentState.results.statistics);
      }
      break;
    case 'setTriggerInfo':
      if (message.trigger) {
        showTriggerBanner(message.trigger);
      } else {
        hideTriggerBanner();
      }
      break;
    case 'setHistory':
      updateHistory(message.entries);
      break;
    case 'setHistoryResults':
      showHistoryResults(message.results, message.runId);
      break;
    case 'setPipelineData':
      setPipelineData(message.pipelineData);
      break;

    case 'setPipelineTiming':
      setPipelineTiming(message.timing);
      break;

    case 'setTimingComparison':
      setTimingComparison(message.comparison);
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
 * Show cancelled state
 * Shows a cancelled message with optional indication that a new run is starting
 */
function showCancelled(message, newRunStarting) {
  currentState = { type: 'loading', message };
  hideAllStates();

  // Use loading state but with cancelled message
  const displayMessage = message || (newRunStarting ? 'Cancelled - new run starting...' : 'Execution cancelled');
  elements.loadingMessage.textContent = displayMessage;
  elements.loadingState.classList.remove('hidden');

  // Add cancelled styling class temporarily
  elements.loadingState.classList.add('cancelled');

  // If new run is starting, the loading state will be replaced
  // If not, transition to appropriate state after a brief pause
  if (!newRunStarting) {
    setTimeout(() => {
      elements.loadingState.classList.remove('cancelled');
    }, 2000);
  }
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
 * Show error state (simple string error)
 */
function showError(error, details) {
  currentState = { type: 'error', error, details };
  hideAllStates();

  // Hide enhanced error elements
  elements.errorTypeBadge?.classList.add('hidden');
  elements.errorGuidanceContainer?.classList.add('hidden');
  elements.errorFileContainer?.classList.add('hidden');

  elements.errorTitle.textContent = 'Error';
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
 * Show structured error with guidance
 */
function showStructuredError(errorState) {
  currentState = { type: 'error', error: errorState.message, details: errorState.details };
  hideAllStates();

  // Show error type badge
  if (elements.errorTypeBadge) {
    elements.errorTypeBadge.textContent = formatErrorType(errorState.type);
    elements.errorTypeBadge.classList.remove('hidden');
  }

  // Set title and message
  elements.errorTitle.textContent = errorState.title || 'Error';
  elements.errorMessage.textContent = errorState.message;

  // Show guidance if available
  if (errorState.guidance && elements.errorGuidance) {
    elements.errorGuidance.textContent = errorState.guidance;
    elements.errorGuidanceContainer.classList.remove('hidden');
  } else {
    elements.errorGuidanceContainer?.classList.add('hidden');
  }

  // Show file path if available
  if (errorState.filePath && elements.errorFile) {
    elements.errorFile.textContent = errorState.filePath;
    elements.errorFile.dataset.path = errorState.filePath;
    elements.errorFileContainer.classList.remove('hidden');

    // Add click handler for file link
    elements.errorFile.onclick = () => {
      vscode.postMessage({ type: 'openFile', path: errorState.filePath });
    };
  } else {
    elements.errorFileContainer?.classList.add('hidden');
  }

  // Show details/stack trace if available
  if (errorState.details) {
    elements.errorDetails.textContent = errorState.details;
    elements.errorDetailsContainer.classList.remove('hidden');
  } else {
    elements.errorDetailsContainer.classList.add('hidden');
  }

  // Update retry button based on recoverability
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    if (errorState.recoverable) {
      retryBtn.classList.remove('hidden');
    } else {
      retryBtn.classList.add('hidden');
    }
  }

  elements.errorState.classList.remove('hidden');
}

/**
 * Format error type for display
 */
function formatErrorType(type) {
  // Convert SNAKE_CASE to Title Case with spaces
  return type
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Show warnings banner
 */
function showWarnings(warnings) {
  currentWarnings = warnings || [];

  if (!elements.warningsBanner || !elements.warningsList) return;

  if (currentWarnings.length === 0) {
    elements.warningsBanner.classList.add('hidden');
    return;
  }

  // Update count
  if (elements.warningsCount) {
    const plural = currentWarnings.length === 1 ? '' : 's';
    elements.warningsCount.textContent = `${currentWarnings.length} Warning${plural}`;
  }

  // Build warnings list
  elements.warningsList.innerHTML = currentWarnings
    .map((warning) => {
      const categoryHtml = `<span class="warning-category">${escapeHtml(warning.category)}</span>`;
      const messageHtml = `<span class="warning-message">${escapeHtml(warning.message)}</span>`;
      const fileHtml = warning.filePath
        ? `<span class="warning-file" data-path="${escapeHtml(warning.filePath)}" title="Click to open">${escapeHtml(getFileName(warning.filePath))}</span>`
        : '';

      return `<li>${categoryHtml}${messageHtml}${fileHtml}</li>`;
    })
    .join('');

  // Add click handlers for file links
  elements.warningsList.querySelectorAll('.warning-file').forEach((el) => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      if (filePath) {
        vscode.postMessage({ type: 'openFile', path: filePath });
      }
    });
  });

  elements.warningsBanner.classList.remove('hidden');
}

/**
 * Show trigger info banner for auto-run
 * Shows which files triggered the re-run
 * @param {Object} trigger - Trigger info with files, types, and isAutoRun flag
 */
function showTriggerBanner(trigger) {
  // Only show for auto-triggered runs
  if (!trigger.isAutoRun) {
    hideTriggerBanner();
    return;
  }

  currentTriggerInfo = trigger;

  if (!elements.triggerBanner || !elements.triggerFiles) {
    return;
  }

  // Clear any existing auto-hide timer
  if (triggerAutoHideTimer) {
    clearTimeout(triggerAutoHideTimer);
    triggerAutoHideTimer = null;
  }

  // Build file list HTML
  const fileItems = trigger.files.map((file, index) => {
    const type = trigger.types[index] || 'modified';
    // Map internal types to display types
    const displayType = type === 'changed' ? 'modified' : type;
    const typeBadge = `<span class="trigger-type-badge ${displayType}">${displayType}</span>`;
    return `<span class="trigger-file-item" data-file="${escapeHtml(file)}">${escapeHtml(file)}${typeBadge}</span>`;
  });

  // Join with commas if multiple files
  elements.triggerFiles.innerHTML = fileItems.join(', ');

  // Add click handlers to file items
  elements.triggerFiles.querySelectorAll('.trigger-file-item').forEach((el) => {
    el.addEventListener('click', () => {
      const fileName = el.dataset.file;
      // Note: We don't have the full path here, just the filename
      // The click handler is informational - we'll log which file was clicked
      vscode.postMessage({ type: 'openFile', path: fileName });
    });
  });

  // Show the banner
  elements.triggerBanner.classList.remove('hidden');

  // Auto-hide after 5 seconds
  triggerAutoHideTimer = setTimeout(() => {
    hideTriggerBanner();
  }, 5000);
}

/**
 * Hide trigger info banner
 */
function hideTriggerBanner() {
  currentTriggerInfo = null;

  if (triggerAutoHideTimer) {
    clearTimeout(triggerAutoHideTimer);
    triggerAutoHideTimer = null;
  }

  elements.triggerBanner?.classList.add('hidden');
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

  // Show warnings if any
  if (results.warnings && results.warnings.length > 0) {
    // Convert string warnings to warning objects with default category
    const warningObjects = results.warnings.map((msg) => ({
      message: msg,
      category: 'data',
    }));
    showWarnings(warningObjects);
  } else {
    // Clear warnings
    elements.warningsBanner?.classList.add('hidden');
  }

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
 * Update comparison UI elements (badge, buttons)
 */
function updateComparisonUI() {
  const hasBaseline = comparisonBaseline !== null || comparisonInfo !== null;
  const isPinned = comparisonInfo?.isPinned || false;

  // Update comparison badge
  if (elements.comparisonBadge) {
    if (hasBaseline) {
      const badgeText = isPinned ? 'vs pinned' : 'vs previous';
      elements.comparisonBadge.textContent = badgeText;
      elements.comparisonBadge.classList.remove('hidden');
      elements.comparisonBadge.classList.toggle('pinned', isPinned);
    } else {
      elements.comparisonBadge.classList.add('hidden');
    }
  }

  // Update pin button visibility (show when we have results but no pinned baseline)
  if (elements.pinComparisonBtn) {
    if (currentState.type === 'results' && !isPinned) {
      elements.pinComparisonBtn.classList.remove('hidden');
    } else {
      elements.pinComparisonBtn.classList.add('hidden');
    }
  }

  // Update chart overlay toggle visibility
  if (elements.toggleChartOverlay) {
    if (hasBaseline && baselineDistribution && baselineDistribution.length > 0) {
      elements.toggleChartOverlay.classList.remove('hidden');
    } else {
      elements.toggleChartOverlay.classList.add('hidden');
      showChartOverlay = false;
    }
  }
}

/**
 * Show comparison deltas
 */
function showComparison(current, baseline) {
  elements.comparisonActions?.classList.remove('hidden');
  updateComparisonUI();

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

  // Hide comparison badge
  elements.comparisonBadge?.classList.add('hidden');

  // Hide chart overlay toggle
  elements.toggleChartOverlay?.classList.add('hidden');
  showChartOverlay = false;

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

  // Update comparison UI
  updateComparisonUI();
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
 * Format delta for display with direction indicator
 * - Positive: ▲ +£12,345 (+1.2%)
 * - Negative: ▼ -£5,432 (-0.5%)
 * - Neutral:  ≈ £0 (0.0%)
 */
function formatDelta(delta) {
  const sign = delta.absolute >= 0 ? '+' : '';
  const formatted = formatCurrency(delta.absolute, false);
  const percent = delta.percentage.toFixed(1);

  // Add direction indicator based on delta direction
  let indicator;
  if (delta.direction === 'positive') {
    indicator = '\u25B2'; // ▲
  } else if (delta.direction === 'negative') {
    indicator = '\u25BC'; // ▼
  } else {
    indicator = '\u2248'; // ≈
  }

  return `${indicator} ${sign}${formatted} (${sign}${percent}%)`;
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

  // Update interest rate parameters if available
  const irSection = document.getElementById('interest-rate-section');
  if (irSection && metadata.interestRate) {
    document.getElementById('meta-ir-initial').textContent = formatPercent(metadata.interestRate.initial);
    document.getElementById('meta-ir-drift').textContent = formatPercent(metadata.interestRate.drift);
    document.getElementById('meta-ir-volatility').textContent = formatPercent(metadata.interestRate.volatility);
    document.getElementById('meta-ir-min').textContent =
      metadata.interestRate.minRate !== undefined ? formatPercent(metadata.interestRate.minRate) : '-';
    document.getElementById('meta-ir-max').textContent =
      metadata.interestRate.maxRate !== undefined ? formatPercent(metadata.interestRate.maxRate) : '-';
    irSection.classList.remove('hidden');
  } else if (irSection) {
    irSection.classList.add('hidden');
  }

  // Update cloud execution info if applicable
  const cloudSection = document.getElementById('cloud-execution-section');
  if (cloudSection && metadata.executionMode === 'cloud') {
    document.getElementById('meta-job-id').textContent = metadata.jobId || '-';
    document.getElementById('meta-cost').textContent = metadata.cost !== undefined ? formatCurrency(metadata.cost) : '-';
    cloudSection.classList.remove('hidden');
  } else if (cloudSection) {
    cloudSection.classList.add('hidden');
  }
}

/**
 * Format a value as a percentage
 */
function formatPercent(value) {
  return (value * 100).toFixed(2) + '%';
}

/**
 * Update assumptions display
 */
function updateAssumptions(assumptions) {
  if (!elements.assumptionsList) return;

  // Check for any draft/unapproved assumptions to show warning
  const unapprovedAssumptions = assumptions.filter(
    (a) => !a.isLocal && a.approvalStatus && a.approvalStatus !== 'approved'
  );

  elements.assumptionsList.innerHTML = assumptions
    .map((a) => {
      // Build source icon - different for AM vs local
      const sourceIcon = a.isLocal
        ? '<svg class="assumption-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Local file"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>'
        : '<svg class="assumption-icon assumption-icon-am" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Assumptions Manager"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';

      // Build multiplier badge
      const multiplierHtml =
        a.multiplier && a.multiplier !== 1
          ? `<span class="assumption-multiplier" title="Stress testing multiplier">${a.multiplier}x</span>`
          : '';

      // Build modified indicator
      const modifiedHtml = a.modified
        ? '<span class="assumption-modified" title="File modified since run started">(modified)</span>'
        : '';

      // Build version badge for AM references
      let versionHtml = '';
      if (a.version) {
        // Show resolved version if different from requested
        const displayVersion = a.resolvedVersion && a.resolvedVersion !== a.version
          ? `${a.version} \u2192 ${a.resolvedVersion}`
          : a.version;
        versionHtml = `<span class="assumption-version" title="Version: ${escapeHtml(displayVersion)}">${escapeHtml(displayVersion)}</span>`;
      }

      // Build approval status badge (for AM references only)
      let approvalHtml = '';
      if (!a.isLocal && a.approvalStatus) {
        const statusClass = `assumption-status-${a.approvalStatus}`;
        const statusIcon = getApprovalStatusIcon(a.approvalStatus);
        let statusTooltip = `Status: ${a.approvalStatus}`;
        if (a.approvedBy) {
          statusTooltip += `\nApproved by: ${a.approvedBy}`;
        }
        if (a.approvedAt) {
          statusTooltip += `\nApproved: ${formatTimestamp(a.approvedAt)}`;
        }
        approvalHtml = `<span class="assumption-status ${statusClass}" title="${escapeHtml(statusTooltip)}">${statusIcon} ${a.approvalStatus}</span>`;
      }

      // Build hash badge
      const hashHtml = a.hash ? `<span class="assumption-hash" title="Content hash: ${a.hash}">#${a.hash.slice(0, 6)}</span>` : '';

      // Build source link - use absolutePath for click handler if available
      let sourceHtml;
      if (a.isLocal) {
        const clickPath = a.absolutePath || a.source;
        sourceHtml = `<span class="assumption-source clickable" data-path="${escapeHtml(clickPath)}" title="Click to open: ${escapeHtml(clickPath)}">${escapeHtml(getFileName(a.source))}</span>`;
      } else {
        // AM reference - clickable to open in Assumptions Manager
        const tableName = a.tableName || extractTableName(a.source);
        const version = a.resolvedVersion || a.version || 'latest';
        sourceHtml = `<span class="assumption-source assumption-am-link clickable" data-table="${escapeHtml(tableName)}" data-version="${escapeHtml(version)}" title="Click to open in Assumptions Manager">${escapeHtml(tableName)}</span>`;
      }

      // Build approval details row (for AM references with approval info)
      let approvalDetailsHtml = '';
      if (!a.isLocal && a.approvedBy && a.approvedAt) {
        approvalDetailsHtml = `<div class="assumption-approval-details">Approved by ${escapeHtml(a.approvedBy)} on ${formatTimestamp(a.approvedAt)}</div>`;
      }

      // Build modification time row (for local files)
      let modTimeHtml = '';
      if (a.isLocal && a.modTime) {
        modTimeHtml = `<div class="assumption-mod-time">Last modified: ${formatTimestamp(a.modTime)}</div>`;
      }

      return `
        <li class="assumption-item">
          <div class="assumption-main-row">
            <div class="assumption-left">
              ${sourceIcon}
              <span class="assumption-name">${escapeHtml(a.name)}</span>
              ${versionHtml}
              ${approvalHtml}
              ${multiplierHtml}
              ${modifiedHtml}
            </div>
            <div class="assumption-right">
              ${sourceHtml}
              ${hashHtml}
            </div>
          </div>
          ${approvalDetailsHtml}
          ${modTimeHtml}
        </li>
      `;
    })
    .join('');

  // Add click handlers for local file links
  elements.assumptionsList.querySelectorAll('.assumption-source.clickable:not(.assumption-am-link)').forEach((el) => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      if (filePath) {
        vscode.postMessage({ type: 'openFile', path: filePath });
      }
    });
  });

  // Add click handlers for AM reference links
  elements.assumptionsList.querySelectorAll('.assumption-am-link').forEach((el) => {
    el.addEventListener('click', () => {
      const tableName = el.dataset.table;
      const version = el.dataset.version;
      if (tableName) {
        vscode.postMessage({ type: 'openAMTable', tableName, version });
      }
    });
  });

  // Show warning for unapproved assumptions
  if (unapprovedAssumptions.length > 0) {
    showUnapprovedAssumptionWarning(unapprovedAssumptions);
  }
}

/**
 * Get icon for approval status
 */
function getApprovalStatusIcon(status) {
  switch (status) {
    case 'approved':
      return '\u2713'; // ✓
    case 'draft':
      return '\u270E'; // ✎
    case 'pending':
      return '\u23F3'; // ⏳
    case 'rejected':
      return '\u2717'; // ✗
    default:
      return '';
  }
}

/**
 * Extract table name from assumptions:// reference
 */
function extractTableName(source) {
  if (!source || !source.startsWith('assumptions://')) {
    return source;
  }
  const withoutPrefix = source.slice('assumptions://'.length);
  const parts = withoutPrefix.split(':');
  return parts[0] || withoutPrefix;
}

/**
 * Show warning banner for unapproved assumptions
 */
function showUnapprovedAssumptionWarning(unapprovedAssumptions) {
  const warningMessages = unapprovedAssumptions.map((a) => ({
    message: `${a.name} is using ${a.approvalStatus} assumption "${a.tableName || extractTableName(a.source)}"`,
    category: 'governance',
  }));

  // Merge with existing warnings
  const existingWarnings = currentWarnings.filter((w) => w.category !== 'governance');
  showWarnings([...warningMessages, ...existingWarnings]);
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
          label: 'Current',
          data: [],
          backgroundColor: 'rgba(14, 99, 156, 0.7)',
          borderColor: 'rgba(14, 99, 156, 1)',
          borderWidth: 1,
        },
        {
          label: 'Baseline',
          data: [],
          backgroundColor: 'rgba(136, 136, 136, 0.4)',
          borderColor: 'rgba(136, 136, 136, 0.8)',
          borderWidth: 1,
          hidden: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // Disable animation for fast updates
      plugins: {
        legend: {
          display: true,
          labels: {
            filter: (item) => {
              // Only show legend when overlay is enabled and dataset is visible
              return !item.hidden;
            },
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (items.length === 0) return '';
              const item = items[0];
              const binIndex = item.dataIndex;
              if (histogramBinData.isDensity) {
                // For density plot, show the x value
                const xValue = histogramBinData.bins[binIndex];
                return formatCurrency(xValue, false);
              }
              if (histogramBinData.bins.length > 0 && histogramBinData.binWidth > 0) {
                // For histogram, show bin range
                const binCenter = histogramBinData.bins[binIndex];
                const halfWidth = histogramBinData.binWidth / 2;
                const binStart = binCenter - halfWidth;
                const binEnd = binCenter + halfWidth;
                return `${formatCurrency(binStart, false)} - ${formatCurrency(binEnd, false)}`;
              }
              return `${item.label}`;
            },
            label: (item) => {
              if (histogramBinData.isDensity) {
                // For density plot, show density value
                const density = item.raw;
                return `Density: ${density.toFixed(6)}`;
              }
              // For histogram, show count and percentage
              const count = item.raw;
              const total = histogramBinData.totalCount || 0;
              const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
              return `Count: ${count.toLocaleString()} (${percentage}%)`;
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

  if (chartType === 'histogram') {
    updateHistogramChart(distribution, stats);
  } else {
    updateDensityChart(distribution, stats);
  }
}

/**
 * Update chart with histogram data
 */
function updateHistogramChart(distribution, stats) {
  // Calculate histogram bins
  const binCount = Math.min(Math.max(50, Math.sqrt(distribution.length)), 100);
  const { bins, counts, binWidth } = calculateHistogram(distribution, binCount);

  // Store bin data for tooltips
  histogramBinData = { bins, binWidth, totalCount: distribution.length, isDensity: false };

  // Update chart type to bar
  chart.config.type = 'bar';

  // Update chart data for current distribution
  chart.data.labels = bins.map((b) => formatCurrency(b, false));
  chart.data.datasets[0].data = counts;
  chart.data.datasets[0].label = 'Current';
  chart.data.datasets[0].backgroundColor = 'rgba(14, 99, 156, 0.7)';
  chart.data.datasets[0].borderColor = 'rgba(14, 99, 156, 1)';
  chart.data.datasets[0].borderWidth = 1;
  chart.data.datasets[0].pointRadius = 0;
  chart.data.datasets[0].fill = false;
  chart.data.datasets[0].tension = 0;
  chart.data.datasets[0].hidden = false;

  // Update baseline dataset (overlay)
  if (showChartOverlay && baselineDistribution && baselineDistribution.length > 0) {
    // Calculate histogram for baseline using same bins
    const baselineCounts = calculateHistogramWithBins(baselineDistribution, bins, binWidth);
    chart.data.datasets[1].data = baselineCounts;
    chart.data.datasets[1].label = 'Baseline';
    chart.data.datasets[1].backgroundColor = 'rgba(136, 136, 136, 0.4)';
    chart.data.datasets[1].borderColor = 'rgba(136, 136, 136, 0.8)';
    chart.data.datasets[1].borderWidth = 1;
    chart.data.datasets[1].hidden = false;
  } else {
    chart.data.datasets[1].data = [];
    chart.data.datasets[1].hidden = true;
  }

  // Update Y-axis title for histogram
  chart.options.scales.y.title.text = 'Frequency';

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
 * Calculate histogram counts using existing bins (for overlay comparison)
 */
function calculateHistogramWithBins(data, bins, binWidth) {
  if (bins.length === 0 || !data || data.length === 0) {
    return new Array(bins.length).fill(0);
  }

  const counts = new Array(bins.length).fill(0);
  const min = bins[0] - binWidth / 2;

  for (const value of data) {
    const binIndex = Math.floor((value - min) / binWidth);
    if (binIndex >= 0 && binIndex < bins.length) {
      counts[binIndex]++;
    }
    // Values outside the bin range are ignored (or could be clamped to edges)
  }

  return counts;
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
 * Update chart with density plot (Kernel Density Estimation)
 */
function updateDensityChart(distribution, stats) {
  // Calculate kernel density estimate
  const numPoints = 100; // Number of points in the density curve
  const { xValues, densityValues, bandwidth } = calculateKDE(distribution, numPoints);

  // Store for tooltips (use similar structure to histogram)
  histogramBinData = {
    bins: xValues,
    binWidth: xValues.length > 1 ? xValues[1] - xValues[0] : 0,
    totalCount: distribution.length,
    isDensity: true,
  };

  // Update chart data for line chart
  chart.config.type = 'line';
  chart.data.labels = xValues.map((x) => formatCurrency(x, false));
  chart.data.datasets[0].data = densityValues;
  chart.data.datasets[0].label = 'Current';
  chart.data.datasets[0].backgroundColor = 'rgba(14, 99, 156, 0.3)';
  chart.data.datasets[0].borderColor = 'rgba(14, 99, 156, 1)';
  chart.data.datasets[0].hidden = false;

  // Update baseline dataset (overlay)
  if (showChartOverlay && baselineDistribution && baselineDistribution.length > 0) {
    // Calculate KDE for baseline using same x-values for comparison
    const baselineKDE = calculateKDEWithXValues(baselineDistribution, xValues);
    chart.data.datasets[1].data = baselineKDE;
    chart.data.datasets[1].label = 'Baseline';
    chart.data.datasets[1].backgroundColor = 'rgba(136, 136, 136, 0.2)';
    chart.data.datasets[1].borderColor = 'rgba(136, 136, 136, 0.8)';
    chart.data.datasets[1].borderWidth = 2;
    chart.data.datasets[1].pointRadius = 0;
    chart.data.datasets[1].fill = true;
    chart.data.datasets[1].tension = 0.4;
    chart.data.datasets[1].hidden = false;
  } else {
    chart.data.datasets[1].data = [];
    chart.data.datasets[1].hidden = true;
  }

  // Update Y-axis title for density
  chart.options.scales.y.title.text = 'Density';
  chart.data.datasets[0].borderWidth = 2;
  chart.data.datasets[0].pointRadius = 0;
  chart.data.datasets[0].fill = true;
  chart.data.datasets[0].tension = 0.4;

  // Add percentile annotations (same as histogram)
  const annotations = {};

  // Find indices for annotations using the xValues
  const xStep = xValues.length > 1 ? xValues[1] - xValues[0] : 1;
  const minX = xValues[0];

  const getXIndex = (value) => {
    const idx = Math.round((value - minX) / xStep);
    return Math.min(Math.max(0, idx), xValues.length - 1);
  };

  // Mean line
  const meanIndex = getXIndex(stats.mean);
  annotations.meanLine = {
    type: 'line',
    xMin: meanIndex,
    xMax: meanIndex,
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
  const p95Index = getXIndex(stats.p95);
  annotations.p95Line = {
    type: 'line',
    xMin: p95Index,
    xMax: p95Index,
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
  const p99Index = getXIndex(stats.p99);
  annotations.p99Line = {
    type: 'line',
    xMin: p99Index,
    xMax: p99Index,
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
    xMin: p95Index,
    xMax: xValues.length - 1,
    backgroundColor: 'rgba(241, 76, 76, 0.15)',
    borderWidth: 0,
  };

  chart.options.plugins.annotation.annotations = annotations;
  chart.update('none');
}

/**
 * Calculate Kernel Density Estimation using Gaussian kernel
 * Uses Scott's rule for bandwidth selection
 */
function calculateKDE(data, numPoints) {
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);

  // Calculate standard deviation using population formula
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Scott's rule for bandwidth: h = 1.06 * sigma * n^(-1/5)
  const bandwidth = 1.06 * stdDev * Math.pow(n, -0.2);

  // Extend the range slightly for smoother edges
  const padding = 3 * bandwidth;
  const xMin = min - padding;
  const xMax = max + padding;
  const step = (xMax - xMin) / (numPoints - 1);

  const xValues = [];
  const densityValues = [];

  // Pre-calculate constants for Gaussian kernel
  const factor = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));

  for (let i = 0; i < numPoints; i++) {
    const x = xMin + i * step;
    xValues.push(x);

    // Calculate density at this point using Gaussian kernel
    let density = 0;
    for (const xi of data) {
      const u = (x - xi) / bandwidth;
      density += Math.exp(-0.5 * u * u);
    }
    density *= factor;
    densityValues.push(density);
  }

  return { xValues, densityValues, bandwidth };
}

/**
 * Calculate KDE for given x-values (for overlay comparison)
 */
function calculateKDEWithXValues(data, xValues) {
  if (!data || data.length === 0 || !xValues || xValues.length === 0) {
    return new Array(xValues.length).fill(0);
  }

  const n = data.length;

  // Calculate standard deviation using population formula
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Scott's rule for bandwidth
  const bandwidth = 1.06 * stdDev * Math.pow(n, -0.2);

  const densityValues = [];
  const factor = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));

  for (const x of xValues) {
    let density = 0;
    for (const xi of data) {
      const u = (x - xi) / bandwidth;
      density += Math.exp(-0.5 * u * u);
    }
    density *= factor;
    densityValues.push(density);
  }

  return densityValues;
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
 * Update run history display
 * @param {Array} entries - Array of RunHistoryEntry objects
 */
function updateHistory(entries) {
  historyEntries = entries || [];

  if (!elements.historyCount || !elements.historyTable || !elements.historyBody || !elements.historyEmpty) {
    return;
  }

  // Update count badge
  if (historyEntries.length > 0) {
    elements.historyCount.textContent = `(${historyEntries.length})`;
    elements.historyCount.classList.remove('hidden');
  } else {
    elements.historyCount.textContent = '';
    elements.historyCount.classList.add('hidden');
  }

  // Show empty state or table
  if (historyEntries.length === 0) {
    elements.historyEmpty.classList.remove('hidden');
    elements.historyTable.classList.add('hidden');
    return;
  }

  elements.historyEmpty.classList.add('hidden');
  elements.historyTable.classList.remove('hidden');

  // Build table rows
  const rows = historyEntries.map((entry, index) => {
    const isViewing = viewingHistoryRunId === entry.runId;
    const isCurrent = index === 0 && viewingHistoryRunId === null;
    const rowClass = isViewing || isCurrent ? 'history-row active' : 'history-row';

    // Format trigger info
    let triggerHtml;
    if (entry.trigger === 'auto') {
      const fileName = entry.triggerFile ? getFileName(entry.triggerFile) : 'file';
      triggerHtml = `<span class="history-trigger auto" title="Auto-run triggered by ${escapeHtml(fileName)}">Auto</span>`;
    } else {
      triggerHtml = '<span class="history-trigger manual">Manual</span>';
    }

    // Format time (relative for recent, absolute for older)
    const timeAgo = formatTimeAgo(new Date(entry.timestamp));

    return `
      <tr class="${rowClass}" data-run-id="${escapeHtml(entry.runId)}">
        <td class="history-time" title="${escapeHtml(formatTimestamp(entry.timestamp))}">${timeAgo}</td>
        <td>${triggerHtml}</td>
        <td>${formatDuration(entry.executionTimeMs)}</td>
        <td class="history-npv">${formatCurrency(entry.meanNpv)}</td>
        <td class="history-actions">
          <button class="btn btn-tiny history-view-btn" data-run-id="${escapeHtml(entry.runId)}" title="View results">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="btn btn-tiny history-compare-btn" data-run-id="${escapeHtml(entry.runId)}" title="Compare with current">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  });

  elements.historyBody.innerHTML = rows.join('');

  // Add click handlers for view buttons
  elements.historyBody.querySelectorAll('.history-view-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const runId = btn.dataset.runId;
      vscode.postMessage({ type: 'viewHistoryRun', runId });
    });
  });

  // Add click handlers for compare buttons
  elements.historyBody.querySelectorAll('.history-compare-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const runId = btn.dataset.runId;
      vscode.postMessage({ type: 'compareWithHistory', runId });
    });
  });

  // Add click handlers for entire rows (same as view button)
  elements.historyBody.querySelectorAll('.history-row').forEach((row) => {
    row.addEventListener('click', () => {
      const runId = row.dataset.runId;
      vscode.postMessage({ type: 'viewHistoryRun', runId });
    });
  });
}

/**
 * Show results from a historical run
 * @param {Object} results - ResultsState for the historical run
 * @param {string} runId - Run ID being viewed
 */
function showHistoryResults(results, runId) {
  if (!results) {
    // Clear viewing state, show current results
    viewingHistoryRunId = null;
    if (currentState.type === 'results') {
      showResults(currentState.results);
    }
    return;
  }

  viewingHistoryRunId = runId;

  // Update the display to show historical results
  // This reuses the showResults function but marks it as historical
  hideAllStates();
  elements.resultsState?.classList.remove('hidden');

  updateStatistics(results.statistics);
  updateRunInfo(results.metadata, results.executionTimeMs);
  updateChart(results.distribution, results.statistics);
  updateMetadata(results.metadata);
  updateAssumptions(results.assumptions);
  updateFooter(results);

  // Hide comparison for historical view (or compare with current)
  hideComparison();

  // Update history table to highlight viewed row
  updateHistory(historyEntries);
}

/**
 * Format a time as relative (e.g., "2 minutes ago")
 * @param {Date} date - The date to format
 * @returns {string} Relative time string
 */
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) {
    return 'Just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHour < 24) {
    return `${diffHour}h ago`;
  } else {
    // Show date for older entries
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
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

// ============================================
// Pipeline Data Inspection
// ============================================

let currentPipelineData = null;
let selectedBusResource = null;
let busHistogramChart = null;
let currentPage = 1;
let pageSize = 100;
let comparisonResourceB = null;

/**
 * Set pipeline data from orchestrator
 * @param {Object} pipelineData - PipelineDataState with bus resources
 */
function setPipelineData(pipelineData) {
  currentPipelineData = pipelineData;

  if (!pipelineData || !pipelineData.resources || pipelineData.resources.length === 0) {
    // Hide pipeline data section
    document.getElementById('pipeline-data-section')?.classList.add('hidden');
    return;
  }

  // Show pipeline data section
  document.getElementById('pipeline-data-section')?.classList.remove('hidden');

  // Populate bus resource dropdown
  const select = document.getElementById('bus-resource-select');
  if (select) {
    select.innerHTML = '<option value="">Select a bus resource...</option>';
    pipelineData.resources.forEach((resource) => {
      const option = document.createElement('option');
      option.value = resource.name;
      option.textContent = `${resource.name} (${resource.elementCount} elements)`;
      select.appendChild(option);
    });
  }

  // Populate comparison dropdown
  const compSelect = document.getElementById('comparison-resource-select');
  if (compSelect) {
    compSelect.innerHTML = '<option value="">Compare with...</option>';
    pipelineData.resources.forEach((resource) => {
      const option = document.createElement('option');
      option.value = resource.name;
      option.textContent = resource.name;
      compSelect.appendChild(option);
    });
  }

  // Reset selection
  selectedBusResource = null;
  showBusDataEmpty();
}

/**
 * Show empty state for bus data
 */
function showBusDataEmpty() {
  document.getElementById('bus-data-empty')?.classList.remove('hidden');
  document.getElementById('bus-data-stats')?.classList.add('hidden');
  document.getElementById('export-bus-resource-btn')?.setAttribute('disabled', 'disabled');
}

/**
 * Handle bus resource selection
 * @param {string} resourceName - Bus resource name
 */
function selectBusResource(resourceName) {
  if (!currentPipelineData || !resourceName) {
    showBusDataEmpty();
    return;
  }

  const resource = currentPipelineData.resources.find((r) => r.name === resourceName);
  if (!resource) {
    showBusDataEmpty();
    return;
  }

  selectedBusResource = resource;

  // Show stats section, hide empty
  document.getElementById('bus-data-empty')?.classList.add('hidden');
  document.getElementById('bus-data-stats')?.classList.remove('hidden');
  document.getElementById('export-bus-resource-btn')?.removeAttribute('disabled');

  // Update resource name
  const nameEl = document.getElementById('selected-resource-name');
  if (nameEl) {
    nameEl.textContent = resource.name;
  }

  // Calculate and show statistics
  const stats = calculateBusStatistics(resource.data);
  updateBusStatistics(stats, resource);

  // Show histogram
  updateBusHistogram(resource.data, stats);

  // Reset pagination
  currentPage = 1;
  updateDataTable(resource.data);

  // Clear comparison view
  hideComparisonView();
  comparisonResourceB = null;
  const compSelect = document.getElementById('comparison-resource-select');
  if (compSelect) {
    compSelect.value = '';
  }
}

/**
 * Calculate statistics for bus resource data
 * @param {number[]} data - Array of numbers
 * @returns {Object} Statistics
 */
function calculateBusStatistics(data) {
  if (!data || data.length === 0) {
    return {
      mean: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      count: 0,
    };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, val) => sum + val, 0) / count;
  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const percentile = (p) => {
    const index = (p / 100) * (count - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  return {
    mean,
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    count,
  };
}

/**
 * Update bus statistics display
 * @param {Object} stats - Statistics object
 * @param {Object} resource - Bus resource
 */
function updateBusStatistics(stats, resource) {
  document.getElementById('bus-stat-mean').textContent = formatNumber(stats.mean);
  document.getElementById('bus-stat-stddev').textContent = formatNumber(stats.stdDev);
  document.getElementById('bus-stat-minmax').textContent = `${formatNumber(stats.min)} / ${formatNumber(stats.max)}`;
  document.getElementById('bus-stat-p50').textContent = formatNumber(stats.p50);
  document.getElementById('bus-stat-p90').textContent = formatNumber(stats.p90);
  document.getElementById('bus-stat-p95').textContent = formatNumber(stats.p95);
  document.getElementById('bus-stat-count').textContent = stats.count.toLocaleString();

  const checksumEl = document.getElementById('bus-stat-checksum');
  if (checksumEl) {
    if (resource.checksum !== undefined) {
      checksumEl.textContent = resource.checksum.toString(16).padStart(8, '0').toUpperCase();
    } else {
      checksumEl.textContent = 'N/A';
    }
  }
}

/**
 * Update bus histogram chart
 * @param {number[]} data - Array of numbers
 * @param {Object} stats - Statistics
 */
function updateBusHistogram(data, stats) {
  const canvas = document.getElementById('bus-histogram-chart');
  if (!canvas) return;

  // Destroy existing chart
  if (busHistogramChart) {
    busHistogramChart.destroy();
  }

  // Calculate histogram bins
  const binCount = 50;
  const binWidth = (stats.max - stats.min) / binCount;
  const bins = [];

  for (let i = 0; i < binCount; i++) {
    const binMin = stats.min + i * binWidth;
    const binMax = binMin + binWidth;
    bins.push({
      min: binMin,
      max: binMax,
      count: 0,
      center: (binMin + binMax) / 2,
    });
  }

  // Populate bins
  for (const value of data) {
    const binIndex = Math.min(Math.floor((value - stats.min) / binWidth), binCount - 1);
    bins[binIndex].count++;
  }

  // Create chart
  const ctx = canvas.getContext('2d');
  busHistogramChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map((b) => formatNumber(b.center)),
      datasets: [
        {
          label: 'Frequency',
          data: bins.map((b) => b.count),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: 'Distribution of Bus Resource Data',
        },
        tooltip: {
          callbacks: {
            title: (context) => {
              const index = context[0].dataIndex;
              const bin = bins[index];
              return `${formatNumber(bin.min)} - ${formatNumber(bin.max)}`;
            },
            label: (context) => {
              return `Frequency: ${context.parsed.y}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Value',
          },
          ticks: {
            maxTicksLimit: 10,
          },
        },
        y: {
          title: {
            display: true,
            text: 'Frequency',
          },
          beginAtZero: true,
        },
      },
    },
  });
}

/**
 * Update data table with pagination
 * @param {number[]} data - Array of numbers
 */
function updateDataTable(data) {
  const tbody = document.getElementById('bus-data-table-body');
  if (!tbody || !data) return;

  const totalPages = Math.ceil(data.length / pageSize);
  const offset = (currentPage - 1) * pageSize;
  const end = Math.min(offset + pageSize, data.length);

  // Generate rows
  const rows = [];
  for (let i = offset; i < end; i++) {
    rows.push(`<tr><td>${i}</td><td>${formatNumber(data[i])}</td></tr>`);
  }

  tbody.innerHTML = rows.join('');

  // Update pagination controls
  document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prev-page-btn').disabled = currentPage <= 1;
  document.getElementById('next-page-btn').disabled = currentPage >= totalPages;
}

/**
 * Handle comparison resource selection
 * @param {string} resourceNameB - Bus resource name to compare
 */
function compareBusResources(resourceNameB) {
  if (!selectedBusResource || !resourceNameB || !currentPipelineData) {
    hideComparisonView();
    return;
  }

  const resourceB = currentPipelineData.resources.find((r) => r.name === resourceNameB);
  if (!resourceB) {
    hideComparisonView();
    return;
  }

  comparisonResourceB = resourceB;

  // Calculate differences
  const differences = [];
  const minLength = Math.min(selectedBusResource.data.length, resourceB.data.length);
  let totalAbsDiff = 0;
  let maxAbsDiff = 0;

  for (let i = 0; i < minLength; i++) {
    const diff = selectedBusResource.data[i] - resourceB.data[i];
    const absDiff = Math.abs(diff);

    if (absDiff > 0.001) {
      differences.push({
        index: i,
        valueA: selectedBusResource.data[i],
        valueB: resourceB.data[i],
        diff,
      });
    }

    totalAbsDiff += absDiff;
    maxAbsDiff = Math.max(maxAbsDiff, absDiff);
  }

  const summary = {
    totalDifferences: differences.length,
    maxAbsDiff,
    meanAbsDiff: totalAbsDiff / minLength,
    diffPercentage: (differences.length / minLength) * 100,
  };

  // Show comparison view
  showComparisonView(selectedBusResource.name, resourceB.name, summary, differences);
}

/**
 * Show comparison view
 */
function showComparisonView(nameA, nameB, summary, differences) {
  const compView = document.getElementById('comparison-view');
  if (!compView) return;

  compView.classList.remove('hidden');

  document.getElementById('comparison-summary').textContent = `${nameA} vs ${nameB}`;
  document.getElementById('comp-total-diffs').textContent = summary.totalDifferences.toLocaleString();
  document.getElementById('comp-max-diff').textContent = formatNumber(summary.maxAbsDiff);
  document.getElementById('comp-mean-diff').textContent = formatNumber(summary.meanAbsDiff);
  document.getElementById('comp-diff-pct').textContent = `${summary.diffPercentage.toFixed(2)}%`;

  // Populate difference table (first 100)
  const tbody = document.getElementById('comparison-table-body');
  if (tbody) {
    const rows = differences.slice(0, 100).map((d) => {
      return `<tr>
        <td>${d.index}</td>
        <td>${formatNumber(d.valueA)}</td>
        <td>${formatNumber(d.valueB)}</td>
        <td>${formatNumber(d.diff)}</td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('');
  }
}

/**
 * Hide comparison view
 */
function hideComparisonView() {
  const compView = document.getElementById('comparison-view');
  if (compView) {
    compView.classList.add('hidden');
  }
}

/**
 * Inspect value at specific offset
 * @param {number} offset - Array index
 */
function inspectOffset(offset) {
  if (!selectedBusResource || !selectedBusResource.data) return;

  if (offset < 0 || offset >= selectedBusResource.data.length) {
    alert(`Invalid offset. Valid range: 0 - ${selectedBusResource.data.length - 1}`);
    return;
  }

  const value = selectedBusResource.data[offset];
  const valueDisplay = document.getElementById('offset-value-display');
  const valueContainer = document.getElementById('offset-value');

  if (valueDisplay && valueContainer) {
    valueDisplay.textContent = formatNumber(value);
    valueContainer.classList.remove('hidden');
  }
}

// ============================================================================
// Pipeline Timing Visualization
// ============================================================================

let currentPipelineTiming = null;
let currentTimingComparison = null;

/**
 * Set pipeline timing data
 */
function setPipelineTiming(timing) {
  currentPipelineTiming = timing;

  const timingSection = document.getElementById('pipeline-timing-section');
  if (!timingSection) return;

  if (!timing) {
    timingSection.classList.add('hidden');
    return;
  }

  // Show timing section
  timingSection.classList.remove('hidden');

  // Update summary stats
  updateTimingSummary(timing);

  // Render waterfall chart
  renderWaterfallChart(timing);

  // Update per-node timing table
  updateNodeTimingTable(timing);

  // Populate comparison dropdown with history (placeholder - would need history from extension)
  const comparisonSelect = document.getElementById('timing-comparison-select');
  if (comparisonSelect) {
    // For now, just clear options except the default
    comparisonSelect.innerHTML = '<option value="">Compare with...</option>';
  }
}

/**
 * Update timing summary statistics
 */
function updateTimingSummary(timing) {
  document.getElementById('timing-total').textContent = `${timing.totalTimeMs.toFixed(0)}ms`;
  document.getElementById('timing-init').textContent = `${timing.totalInitTimeMs.toFixed(0)}ms`;
  document.getElementById('timing-execute').textContent = `${timing.totalExecuteTimeMs.toFixed(0)}ms`;
  document.getElementById('timing-handoff').textContent = `${timing.totalHandoffTimeMs.toFixed(0)}ms`;

  // Slowest node
  const slowestNode = timing.nodeTimings.find(n => n.nodeId === timing.slowestNodeId);
  if (slowestNode) {
    document.getElementById('timing-slowest-node').textContent = slowestNode.nodeName || slowestNode.nodeId;
    document.getElementById('timing-slowest-time').textContent = `${timing.slowestNodeTimeMs.toFixed(0)}ms`;
  }

  document.getElementById('timing-critical-path').textContent = `${timing.criticalPathMs.toFixed(0)}ms`;

  // Show parallel execution notice if applicable
  const parallelNotice = document.getElementById('waterfall-parallel-notice');
  if (parallelNotice) {
    if (timing.hasParallelExecution) {
      parallelNotice.classList.remove('hidden');
    } else {
      parallelNotice.classList.add('hidden');
    }
  }
}

/**
 * Render waterfall chart showing execution timeline
 */
function renderWaterfallChart(timing) {
  const svg = document.getElementById('waterfall-chart');
  if (!svg) return;

  // Clear existing content
  svg.innerHTML = '';

  const nodeTimings = timing.nodeTimings;
  if (!nodeTimings || nodeTimings.length === 0) return;

  // Calculate chart dimensions
  const margin = { top: 10, right: 20, bottom: 30, left: 120 };
  const width = 800;
  const barHeight = 30;
  const spacing = 10;
  const height = nodeTimings.length * (barHeight + spacing) + margin.top + margin.bottom;

  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Calculate time scale
  const maxTime = timing.totalTimeMs;
  const timeScale = (width - margin.left - margin.right) / maxTime;

  // Stage colors
  const stageColors = {
    wait: '#6c757d',
    init: '#ffc107',
    execute: '#0d6efd',
    handoff: '#198754'
  };

  // Draw bars for each node
  nodeTimings.forEach((node, index) => {
    const y = margin.top + index * (barHeight + spacing);
    let x = margin.left;

    // Node label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', margin.left - 10);
    label.setAttribute('y', y + barHeight / 2);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('fill', 'var(--vscode-editor-foreground)');
    label.setAttribute('font-size', '12');
    label.textContent = node.nodeName || node.nodeId;
    svg.appendChild(label);

    // Calculate relative start time from pipeline start
    const relativeStartMs = node.startTime - timing.timestamp;
    x = margin.left + (relativeStartMs * timeScale);

    // Draw stage bars
    const stages = [
      { name: 'wait', duration: node.waitTimeMs },
      { name: 'init', duration: node.initTimeMs },
      { name: 'execute', duration: node.executeTimeMs },
      { name: 'handoff', duration: node.handoffTimeMs }
    ];

    stages.forEach(stage => {
      if (stage.duration > 0) {
        const stageWidth = stage.duration * timeScale;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', stageWidth);
        rect.setAttribute('height', barHeight);
        rect.setAttribute('fill', stageColors[stage.name]);
        rect.setAttribute('opacity', '0.8');

        // Tooltip
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${node.nodeName || node.nodeId} - ${stage.name}: ${stage.duration.toFixed(1)}ms`;
        rect.appendChild(title);

        svg.appendChild(rect);

        // Time label for execute stage (main bar)
        if (stage.name === 'execute' && stageWidth > 40) {
          const timeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          timeLabel.setAttribute('x', x + stageWidth / 2);
          timeLabel.setAttribute('y', y + barHeight / 2);
          timeLabel.setAttribute('text-anchor', 'middle');
          timeLabel.setAttribute('dominant-baseline', 'middle');
          timeLabel.setAttribute('fill', 'white');
          timeLabel.setAttribute('font-size', '11');
          timeLabel.setAttribute('font-weight', 'bold');
          timeLabel.textContent = `${stage.duration.toFixed(0)}ms`;
          svg.appendChild(timeLabel);
        }

        x += stageWidth;
      }
    });
  });

  // Time axis at bottom
  const axisY = height - margin.bottom + 5;
  const axisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axisLine.setAttribute('x1', margin.left);
  axisLine.setAttribute('y1', axisY);
  axisLine.setAttribute('x2', width - margin.right);
  axisLine.setAttribute('y2', axisY);
  axisLine.setAttribute('stroke', 'var(--vscode-panel-border)');
  axisLine.setAttribute('stroke-width', '1');
  svg.appendChild(axisLine);

  // Time ticks
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const time = (maxTime / tickCount) * i;
    const tickX = margin.left + (time * timeScale);

    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', tickX);
    tick.setAttribute('y1', axisY);
    tick.setAttribute('x2', tickX);
    tick.setAttribute('y2', axisY + 5);
    tick.setAttribute('stroke', 'var(--vscode-panel-border)');
    tick.setAttribute('stroke-width', '1');
    svg.appendChild(tick);

    const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tickLabel.setAttribute('x', tickX);
    tickLabel.setAttribute('y', axisY + 18);
    tickLabel.setAttribute('text-anchor', 'middle');
    tickLabel.setAttribute('fill', 'var(--vscode-editor-foreground)');
    tickLabel.setAttribute('font-size', '10');
    tickLabel.textContent = `${time.toFixed(0)}ms`;
    svg.appendChild(tickLabel);
  }
}

/**
 * Update per-node timing table
 */
function updateNodeTimingTable(timing) {
  const tbody = document.getElementById('node-timing-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  timing.nodeTimings.forEach(node => {
    const row = tbody.insertRow();

    // Highlight slowest node
    if (node.nodeId === timing.slowestNodeId) {
      row.classList.add('slowest-node');
    }

    row.insertCell().textContent = node.nodeName || node.nodeId;
    row.insertCell().textContent = node.engineType;
    row.insertCell().textContent = `${node.waitTimeMs.toFixed(1)}ms`;
    row.insertCell().textContent = `${node.initTimeMs.toFixed(1)}ms`;
    row.insertCell().textContent = `${node.executeTimeMs.toFixed(1)}ms`;
    row.insertCell().textContent = `${node.handoffTimeMs.toFixed(1)}ms`;
    row.insertCell().textContent = `${node.totalTimeMs.toFixed(1)}ms`;
  });
}

/**
 * Set timing comparison data
 */
function setTimingComparison(comparison) {
  currentTimingComparison = comparison;

  const comparisonView = document.getElementById('timing-comparison-view');
  if (!comparisonView) return;

  if (!comparison) {
    comparisonView.classList.add('hidden');
    return;
  }

  // Show comparison view
  comparisonView.classList.remove('hidden');

  // Update summary
  const summaryText = `Current vs ${comparison.baselineRunId}`;
  document.getElementById('timing-comparison-summary').textContent = summaryText;

  // Update comparison stats
  const deltaMs = comparison.totalTimeDeltaMs;
  const deltaPercent = comparison.totalTimeDeltaPercent;
  const deltaClass = deltaMs > 0 ? 'negative' : 'positive';
  const deltaSign = deltaMs > 0 ? '+' : '';

  const totalDeltaEl = document.getElementById('timing-comp-total-delta');
  totalDeltaEl.textContent = `${deltaSign}${deltaMs.toFixed(0)}ms (${deltaSign}${deltaPercent.toFixed(1)}%)`;
  totalDeltaEl.className = `stat-value ${deltaClass}`;

  document.getElementById('timing-comp-slower-count').textContent = comparison.slowerNodes.length;
  document.getElementById('timing-comp-faster-count').textContent = comparison.fasterNodes.length;

  // Update comparison table
  updateTimingComparisonTable(comparison);
}

/**
 * Update timing comparison table
 */
function updateTimingComparisonTable(comparison) {
  const tbody = document.getElementById('timing-comparison-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  comparison.nodeDeltas.forEach(delta => {
    const row = tbody.insertRow();

    row.insertCell().textContent = delta.nodeName || delta.nodeId;
    row.insertCell().textContent = `${delta.baselineMs.toFixed(1)}ms`;
    row.insertCell().textContent = `${delta.currentMs.toFixed(1)}ms`;

    const deltaMs = delta.deltaMs;
    const deltaPercent = delta.deltaPercent;
    const deltaClass = deltaMs > 5 ? 'negative' : (deltaMs < -5 ? 'positive' : '');
    const deltaSign = deltaMs > 0 ? '+' : '';

    const deltaMsCell = row.insertCell();
    deltaMsCell.textContent = `${deltaSign}${deltaMs.toFixed(1)}ms`;
    deltaMsCell.className = deltaClass;

    const deltaPercentCell = row.insertCell();
    deltaPercentCell.textContent = `${deltaSign}${deltaPercent.toFixed(1)}%`;
    deltaPercentCell.className = deltaClass;
  });
}

// Add event listener for export timing button
document.getElementById('export-timing-btn')?.addEventListener('click', () => {
  if (currentPipelineTiming) {
    vscode.postMessage({ type: 'exportTiming', runId: currentPipelineTiming.runId });
  }
});

// Add event listener for timing comparison select
document.getElementById('timing-comparison-select')?.addEventListener('change', (e) => {
  const baselineRunId = e.target.value;
  if (baselineRunId && currentPipelineTiming) {
    vscode.postMessage({ type: 'selectTimingComparison', baselineRunId });
  }
});

// ============================================================================
// Message Handler Updates
// ============================================================================

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
