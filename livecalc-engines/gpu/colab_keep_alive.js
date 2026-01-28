/**
 * Colab Keep-Alive Script
 *
 * Prevents Google Colab from timing out by periodically clicking the
 * "Connect" button and simulating activity.
 *
 * Usage in Colab:
 *   1. Open browser console (F12)
 *   2. Paste this entire script
 *   3. Press Enter
 *   4. Leave the tab open
 *
 * Alternative: Add as bookmarklet or inject via notebook cell.
 */

(function() {
    'use strict';

    console.log('🔄 Colab Keep-Alive: Starting...');

    // Configuration
    const config = {
        clickInterval: 10 * 60 * 1000,  // 10 minutes
        checkInterval: 5 * 1000,         // 5 seconds
        moveInterval: 2 * 60 * 1000,     // 2 minutes (mouse movement)
        logPrefix: '[Keep-Alive]'
    };

    // State
    let clickCount = 0;
    let moveCount = 0;
    let startTime = Date.now();

    /**
     * Find and click the Connect button
     */
    function clickConnectButton() {
        // Try multiple selectors (Colab UI changes over time)
        const selectors = [
            'colab-connect-button',
            'paper-button[id=runtime-connect]',
            'paper-button:has-text("Connect")',
            'button[aria-label="Connect"]'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) {
                button.click();
                clickCount++;
                console.log(`${config.logPrefix} Clicked connect button (${clickCount} total)`);
                return true;
            }
        }

        return false;
    }

    /**
     * Simulate mouse movement to prevent idle detection
     */
    function simulateActivity() {
        const event = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
        });

        document.dispatchEvent(event);
        moveCount++;
    }

    /**
     * Check connection status
     */
    function checkConnectionStatus() {
        // Look for disconnect indicators
        const disconnectSelectors = [
            'div[data-status="disconnected"]',
            'paper-icon-button[icon="hardware:phonelink-off"]',
            'span:has-text("Disconnected")'
        ];

        for (const selector of disconnectSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.warn(`${config.logPrefix} Disconnected detected! Attempting reconnect...`);
                clickConnectButton();
                return false;
            }
        }

        return true;
    }

    /**
     * Display status
     */
    function displayStatus() {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60); // minutes
        console.log(`${config.logPrefix} Status: Connected | Uptime: ${uptime}m | Clicks: ${clickCount} | Moves: ${moveCount}`);
    }

    // Periodic tasks
    setInterval(() => {
        checkConnectionStatus();
    }, config.checkInterval);

    setInterval(() => {
        clickConnectButton();
    }, config.clickInterval);

    setInterval(() => {
        simulateActivity();
    }, config.moveInterval);

    // Status logging every 15 minutes
    setInterval(() => {
        displayStatus();
    }, 15 * 60 * 1000);

    console.log(`${config.logPrefix} Initialized! Will click connect every ${config.clickInterval/60000} minutes.`);
    console.log(`${config.logPrefix} To stop, run: location.reload()`);

})();
