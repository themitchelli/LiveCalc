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
  elements.pinComparisonBtn = document.getElementById('pin-comparison-btn');
  elements.comparisonBadge = document.getElementById('comparison-badge');
  elements.toggleChartOverlay = document.getElementById('toggle-chart-overlay');

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

  elements.assumptionsList.innerHTML = assumptions
    .map((a) => {
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
      const versionHtml = a.version ? `<span class="assumption-version">v${escapeHtml(a.version)}</span>` : '';

      // Build hash badge
      const hashHtml = a.hash ? `<span class="assumption-hash" title="Content hash: ${a.hash}">#${a.hash.slice(0, 6)}</span>` : '';

      // Build source link - use absolutePath for click handler if available
      let sourceHtml;
      if (a.isLocal) {
        const clickPath = a.absolutePath || a.source;
        sourceHtml = `<span class="assumption-source clickable" data-path="${escapeHtml(clickPath)}" title="Click to open: ${escapeHtml(clickPath)}">${escapeHtml(getFileName(a.source))}</span>`;
      } else {
        // AM reference - placeholder link for future integration
        sourceHtml = `<span class="assumption-am-ref" title="Assumptions Manager reference (not yet linked)">${escapeHtml(a.source)}</span>`;
      }

      return `
        <li class="assumption-item">
          <div class="assumption-left">
            <span class="assumption-name">${escapeHtml(a.name)}</span>
            ${versionHtml}
            ${multiplierHtml}
            ${modifiedHtml}
          </div>
          <div class="assumption-right">
            ${sourceHtml}
            ${hashHtml}
          </div>
        </li>
      `;
    })
    .join('');

  // Add click handlers for local file links
  elements.assumptionsList.querySelectorAll('.assumption-source.clickable').forEach((el) => {
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
