/**
 * Pipeline View - DAG Visualization
 *
 * Implements SVG-based DAG rendering with automatic layout using a simple layered approach.
 * Real-time updates for node status, timing, and checksums during pipeline execution.
 */

(function () {
  const vscode = acquireVsCodeApi();
  let currentState = null;
  let selectedNodeId = null;
  let breakpoints = new Set();
  let isPaused = false;
  let pausedData = null;

  // DOM elements
  const container = document.getElementById('container');
  const emptyState = document.getElementById('emptyState');
  const svg = document.getElementById('pipelineSvg');
  const nodesGroup = document.getElementById('nodes');
  const connectionsGroup = document.getElementById('connections');
  const nodeDetails = document.getElementById('nodeDetails');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportBtn = document.getElementById('exportBtn');
  const closeDetailsBtn = document.getElementById('closeDetailsBtn');
  const statusText = document.getElementById('statusText');
  const debugControls = document.getElementById('debugControls');
  const stepBtn = document.getElementById('stepBtn');
  const continueBtn = document.getElementById('continueBtn');
  const abortBtn = document.getElementById('abortBtn');

  // Initialize
  window.addEventListener('load', () => {
    vscode.postMessage({ type: 'ready' });
  });

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'setState':
        currentState = message.state;
        renderPipeline();
        break;
      case 'updateNodeStatus':
        updateNodeStatus(message.nodeId, message.status, message.timing, message.checksums, message.error);
        break;
      case 'setCurrentNode':
        setCurrentNode(message.nodeId);
        break;
      case 'clear':
        clearView();
        break;
      case 'setBreakpoints':
        setBreakpoints(message.breakpoints);
        break;
      case 'setPaused':
        setPausedState(message.isPaused, message.nodeId, message.busData, message.checksums);
        break;
    }
  });

  // Button handlers
  refreshBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  exportBtn.addEventListener('click', () => {
    exportSvg();
  });

  closeDetailsBtn.addEventListener('click', () => {
    hideNodeDetails();
  });

  // Debug control handlers
  stepBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'step' });
    debugControls.classList.add('hidden');
  });

  continueBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'continue' });
    debugControls.classList.add('hidden');
  });

  abortBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'abort' });
    debugControls.classList.add('hidden');
  });

  /**
   * Render the entire pipeline DAG
   */
  function renderPipeline() {
    if (!currentState || currentState.nodes.length === 0) {
      emptyState.classList.remove('hidden');
      svg.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    svg.classList.remove('hidden');

    // Calculate layout
    const layout = calculateLayout(currentState);

    // Update SVG dimensions
    const padding = 40;
    const svgWidth = layout.width + padding * 2;
    const svgHeight = layout.height + padding * 2;
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);

    // Clear existing content
    nodesGroup.innerHTML = '';
    connectionsGroup.innerHTML = '';

    // Render connections first (so they appear behind nodes)
    renderConnections(layout);

    // Render nodes
    renderNodes(layout);

    // Update status text
    updateStatusText();
  }

  /**
   * Calculate DAG layout using simple layered approach
   * Nodes are arranged in layers based on their depth in the DAG
   */
  function calculateLayout(state) {
    const nodePositions = new Map();
    const nodeWidth = 160;
    const nodeHeight = 80;
    const spacingX = 240;
    const spacingY = 140;

    // Calculate node layers (depth in the DAG)
    const layers = calculateLayers(state);
    const layerCounts = new Map();

    // Assign positions based on layers
    state.nodes.forEach((node) => {
      const layer = layers.get(node.id) || 0;
      const posInLayer = layerCounts.get(layer) || 0;
      layerCounts.set(layer, posInLayer + 1);

      const x = 40 + layer * spacingX;
      const y = 40 + posInLayer * spacingY;

      nodePositions.set(node.id, { x, y, width: nodeWidth, height: nodeHeight });
    });

    // Calculate total dimensions
    const maxLayer = Math.max(...layers.values(), 0);
    const maxLayerCount = Math.max(...layerCounts.values(), 1);
    const width = (maxLayer + 1) * spacingX + nodeWidth;
    const height = maxLayerCount * spacingY + nodeHeight;

    return { nodePositions, width, height, layers };
  }

  /**
   * Calculate layers (depth) for each node in the DAG
   * Source nodes (no inputs from other nodes) are in layer 0
   */
  function calculateLayers(state) {
    const layers = new Map();
    const visited = new Set();

    // Helper to get upstream nodes
    const getUpstreamNodes = (nodeId) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return [];

      const upstream = [];
      for (const input of node.inputs) {
        if (input.startsWith('bus://')) {
          const conn = state.connections.find(
            (c) => c.to === nodeId && c.busResource === input
          );
          if (conn) {
            upstream.push(conn.from);
          }
        }
      }
      return upstream;
    };

    // Recursive DFS to calculate layer
    const calculateLayer = (nodeId) => {
      if (visited.has(nodeId)) {
        return layers.get(nodeId) || 0;
      }

      visited.add(nodeId);
      const upstream = getUpstreamNodes(nodeId);

      if (upstream.length === 0) {
        layers.set(nodeId, 0);
        return 0;
      }

      const maxUpstreamLayer = Math.max(...upstream.map(calculateLayer));
      const layer = maxUpstreamLayer + 1;
      layers.set(nodeId, layer);
      return layer;
    };

    // Calculate layer for all nodes
    state.nodes.forEach((node) => calculateLayer(node.id));

    return layers;
  }

  /**
   * Render nodes as SVG foreignObject elements with HTML content
   */
  function renderNodes(layout) {
    currentState.nodes.forEach((node) => {
      const pos = layout.nodePositions.get(node.id);
      if (!pos) return;

      // Create foreignObject for HTML content
      const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      foreignObject.setAttribute('x', pos.x);
      foreignObject.setAttribute('y', pos.y);
      foreignObject.setAttribute('width', pos.width);
      foreignObject.setAttribute('height', pos.height);
      foreignObject.setAttribute('data-node-id', node.id);

      // Create node HTML
      const nodeDiv = document.createElement('div');
      nodeDiv.className = `pipeline-node status-${node.status}`;
      if (currentState.currentNode === node.id) {
        nodeDiv.classList.add('current');
      }
      if (node.hasBreakpoint) {
        nodeDiv.classList.add('has-breakpoint');
      }
      if (node.isPausedAt) {
        nodeDiv.classList.add('paused-at');
      }

      // Breakpoint indicator
      const breakpointIndicator = node.hasBreakpoint ? '<div class="breakpoint-indicator" title="Breakpoint set">⬤</div>' : '';
      // Paused indicator
      const pausedIndicator = node.isPausedAt ? '<div class="paused-indicator" title="Paused here">⏸</div>' : '';

      nodeDiv.innerHTML = `
        ${breakpointIndicator}
        ${pausedIndicator}
        <div class="node-header">
          <div class="node-icon ${node.engineType}">${node.engineType === 'wasm' ? 'W' : 'P'}</div>
          <div class="node-name" title="${node.name}">${node.name}</div>
        </div>
        <div class="node-status ${node.status}">${node.status}</div>
        <div class="node-info">
          <div class="node-info-item">
            <span>Inputs:</span>
            <span>${node.inputs.filter(i => i.startsWith('bus://')).length}</span>
          </div>
          <div class="node-info-item">
            <span>Outputs:</span>
            <span>${node.outputs.length}</span>
          </div>
        </div>
      `;

      nodeDiv.addEventListener('click', () => {
        handleNodeClick(node.id);
      });

      // Double-click to toggle breakpoint
      nodeDiv.addEventListener('dblclick', () => {
        handleNodeDoubleClick(node.id);
      });

      foreignObject.appendChild(nodeDiv);
      nodesGroup.appendChild(foreignObject);
    });
  }

  /**
   * Render connections between nodes as SVG paths
   */
  function renderConnections(layout) {
    currentState.connections.forEach((conn) => {
      const fromPos = layout.nodePositions.get(conn.from);
      const toPos = layout.nodePositions.get(conn.to);
      if (!fromPos || !toPos) return;

      // Calculate connection points (right side of from node to left side of to node)
      const x1 = fromPos.x + fromPos.width;
      const y1 = fromPos.y + fromPos.height / 2;
      const x2 = toPos.x;
      const y2 = toPos.y + toPos.height / 2;

      // Create curved path
      const midX = (x1 + x2) / 2;
      const pathData = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', 'connection-line');
      path.setAttribute('data-from', conn.from);
      path.setAttribute('data-to', conn.to);

      // Mark active connections
      const fromNode = currentState.nodes.find((n) => n.id === conn.from);
      const toNode = currentState.nodes.find((n) => n.id === conn.to);
      if (fromNode && toNode && fromNode.status === 'complete' && toNode.status !== 'pending') {
        path.classList.add('active');
      }

      connectionsGroup.appendChild(path);

      // Add label for bus resource
      const labelX = midX;
      const labelY = (y1 + y2) / 2 - 10;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', labelX);
      label.setAttribute('y', labelY);
      label.setAttribute('class', 'connection-label');
      label.textContent = conn.busResource.replace('bus://', '');
      connectionsGroup.appendChild(label);
    });
  }

  /**
   * Update node status during execution
   */
  function updateNodeStatus(nodeId, status, timing, checksums, error) {
    if (!currentState) return;

    const node = currentState.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    node.status = status;
    if (timing) {
      node.timing = { ...node.timing, ...timing };
    }
    if (checksums) {
      node.checksums = { ...node.checksums, ...checksums };
    }
    if (error) {
      node.error = error;
    }

    // Update node appearance
    const foreignObject = nodesGroup.querySelector(`[data-node-id="${nodeId}"]`);
    if (foreignObject) {
      const nodeDiv = foreignObject.querySelector('.pipeline-node');
      if (nodeDiv) {
        nodeDiv.className = `pipeline-node status-${status}`;
        if (currentState.currentNode === nodeId) {
          nodeDiv.classList.add('current');
        }
        const statusSpan = nodeDiv.querySelector('.node-status');
        if (statusSpan) {
          statusSpan.className = `node-status ${status}`;
          statusSpan.textContent = status;
        }
      }
    }

    // Update connections
    updateConnectionStates();

    // Update status text
    updateStatusText();

    // Update details panel if this node is selected
    if (selectedNodeId === nodeId) {
      showNodeDetails(node);
    }
  }

  /**
   * Update connection visual states based on node statuses
   */
  function updateConnectionStates() {
    const paths = connectionsGroup.querySelectorAll('.connection-line');
    paths.forEach((path) => {
      const fromId = path.getAttribute('data-from');
      const toId = path.getAttribute('data-to');
      const fromNode = currentState.nodes.find((n) => n.id === fromId);
      const toNode = currentState.nodes.find((n) => n.id === toId);

      if (fromNode && toNode && fromNode.status === 'complete' && toNode.status !== 'pending') {
        path.classList.add('active');
      } else {
        path.classList.remove('active');
      }
    });
  }

  /**
   * Set the currently executing node
   */
  function setCurrentNode(nodeId) {
    if (!currentState) return;

    currentState.currentNode = nodeId;

    // Update all nodes
    const foreignObjects = nodesGroup.querySelectorAll('[data-node-id]');
    foreignObjects.forEach((fo) => {
      const nid = fo.getAttribute('data-node-id');
      const nodeDiv = fo.querySelector('.pipeline-node');
      if (nodeDiv) {
        if (nid === nodeId) {
          nodeDiv.classList.add('current');
        } else {
          nodeDiv.classList.remove('current');
        }
      }
    });
  }

  /**
   * Handle node click
   */
  function handleNodeClick(nodeId) {
    const node = currentState.nodes.find((n) => n.id === nodeId);
    if (node) {
      selectedNodeId = nodeId;
      showNodeDetails(node);
      vscode.postMessage({ type: 'nodeClicked', nodeId });
    }
  }

  /**
   * Show node details panel
   */
  function showNodeDetails(node) {
    document.getElementById('detailsTitle').textContent = node.name;

    // Status
    const statusDiv = document.getElementById('detailsStatus');
    statusDiv.textContent = node.status;
    statusDiv.className = node.status;

    // Engine
    document.getElementById('detailsEngine').textContent = node.engineType + '://' + node.name;

    // Inputs
    const inputsList = document.getElementById('detailsInputs');
    inputsList.innerHTML = '';
    node.inputs.forEach((input) => {
      const li = document.createElement('li');
      li.textContent = input;
      inputsList.appendChild(li);
    });

    // Outputs
    const outputsList = document.getElementById('detailsOutputs');
    outputsList.innerHTML = '';
    node.outputs.forEach((output) => {
      const li = document.createElement('li');
      li.textContent = output;
      outputsList.appendChild(li);
    });

    // Timing
    const timingSection = document.getElementById('timingSection');
    if (node.timing) {
      timingSection.classList.remove('hidden');
      document.getElementById('timingInit').textContent = formatTiming(node.timing.initMs);
      document.getElementById('timingExecute').textContent = formatTiming(node.timing.executeMs);
      document.getElementById('timingHandoff').textContent = formatTiming(node.timing.handoffMs);
      document.getElementById('timingTotal').textContent = formatTiming(node.timing.totalMs);
    } else {
      timingSection.style.display = 'none';
    }

    // Checksums
    const checksumSection = document.getElementById('checksumSection');
    const checksumsList = document.getElementById('detailsChecksums');
    if (node.checksums && Object.keys(node.checksums).length > 0) {
      checksumSection.classList.remove('hidden');
      checksumsList.innerHTML = '';
      for (const [key, value] of Object.entries(node.checksums)) {
        const li = document.createElement('li');
        li.textContent = `${key}: 0x${value.toString(16).padStart(8, '0')}`;
        checksumsList.appendChild(li);
      }
    } else {
      checksumSection.style.display = 'none';
    }

    // Error
    const errorSection = document.getElementById('errorSection');
    const errorDiv = document.getElementById('detailsError');
    if (node.error) {
      errorSection.classList.remove('hidden');
      errorDiv.textContent = node.error;
    } else {
      errorSection.style.display = 'none';
    }

    nodeDetails.classList.remove('hidden');
  }

  /**
   * Hide node details panel
   */
  function hideNodeDetails() {
    selectedNodeId = null;
    nodeDetails.classList.add('hidden');
  }

  /**
   * Update status text in toolbar
   */
  function updateStatusText() {
    if (!currentState) {
      statusText.textContent = '';
      return;
    }

    const total = currentState.nodes.length;
    const pending = currentState.nodes.filter((n) => n.status === 'pending').length;
    const running = currentState.nodes.filter((n) => n.status === 'running').length;
    const complete = currentState.nodes.filter((n) => n.status === 'complete').length;
    const error = currentState.nodes.filter((n) => n.status === 'error').length;

    if (error > 0) {
      statusText.textContent = `${error} error(s), ${complete}/${total} complete`;
    } else if (complete === total) {
      statusText.textContent = `Pipeline complete (${total} nodes)`;
    } else if (running > 0) {
      statusText.textContent = `Running... ${complete}/${total} complete`;
    } else {
      statusText.textContent = `${total} nodes, ${complete} complete`;
    }
  }

  /**
   * Clear the view
   */
  function clearView() {
    currentState = null;
    selectedNodeId = null;
    nodesGroup.innerHTML = '';
    connectionsGroup.innerHTML = '';
    emptyState.classList.remove('hidden');
    svg.classList.add('hidden');
    nodeDetails.classList.add('hidden');
    statusText.textContent = '';
  }

  /**
   * Export SVG to file
   */
  function exportSvg() {
    if (!currentState) return;

    // Clone the SVG
    const svgClone = svg.cloneNode(true);

    // Convert to string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);

    // Create blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'livecalc-pipeline.svg';
    a.click();
    URL.revokeObjectURL(url);

    vscode.postMessage({ type: 'exportSvg' });
  }

  /**
   * Format timing value
   */
  function formatTiming(ms) {
    if (ms === undefined || ms === null) return '-';
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Set breakpoints on pipeline nodes
   */
  function setBreakpoints(bpArray) {
    breakpoints = new Set(bpArray);
    // Re-render nodes to show breakpoint indicators
    if (currentState) {
      currentState.nodes.forEach((node) => {
        node.hasBreakpoint = breakpoints.has(node.id);
      });
      renderPipeline();
    }
  }

  /**
   * Set paused state when breakpoint is hit
   */
  function setPausedState(paused, nodeId, busData, checksums) {
    isPaused = paused;

    if (paused && nodeId) {
      pausedData = { nodeId, busData, checksums };

      // Show debug controls
      debugControls.classList.remove('hidden');

      // Update status text
      statusText.textContent = `⏸ Paused at: ${nodeId}`;
      statusText.classList.add('paused');

      // Highlight paused node
      if (currentState) {
        currentState.nodes.forEach((node) => {
          node.isPausedAt = (node.id === nodeId);
        });
        renderPipeline();

        // Auto-select paused node details
        showNodeDetails(nodeId);
      }
    } else {
      pausedData = null;

      // Hide debug controls
      debugControls.classList.add('hidden');

      // Update status text
      statusText.textContent = '';
      statusText.classList.remove('paused');

      // Clear paused state
      if (currentState) {
        currentState.nodes.forEach((node) => {
          node.isPausedAt = false;
        });
        renderPipeline();
      }
    }
  }

  /**
   * Toggle breakpoint on a node (double-click handler)
   */
  function handleNodeDoubleClick(nodeId) {
    vscode.postMessage({ type: 'toggleBreakpoint', nodeId });
  }
})();
