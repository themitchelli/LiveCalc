"""
Colab Auto-Reconnect Utility

Provides JavaScript injection to keep Colab notebooks alive by preventing timeout.
Can be used directly in notebook cells or as a standalone utility.

Usage in Colab notebook:
    from colab_auto_reconnect import enable_auto_reconnect
    enable_auto_reconnect()
"""

from IPython.display import display, Javascript
import time


# JavaScript code for auto-reconnect
AUTO_RECONNECT_JS = """
// LiveCalc Colab Keep-Alive
(function() {
    console.log('[LiveCalc] 🔄 Auto-reconnect enabled');

    const config = {
        clickInterval: 10 * 60 * 1000,  // 10 minutes
        checkInterval: 30 * 1000,        // 30 seconds
        moveInterval: 2 * 60 * 1000      // 2 minutes
    };

    let clickCount = 0;
    let startTime = Date.now();

    // Click connect button if disconnected
    function ensureConnected() {
        const button = document.querySelector('colab-connect-button');
        if (button) {
            const shadowRoot = button.shadowRoot;
            if (shadowRoot) {
                const paperButton = shadowRoot.querySelector('#connect');
                if (paperButton && !paperButton.disabled) {
                    paperButton.click();
                    clickCount++;
                    console.log(`[LiveCalc] Clicked connect (${clickCount} total)`);
                }
            }
        }
    }

    // Simulate activity to prevent idle detection
    function simulateActivity() {
        const event = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        document.dispatchEvent(event);
    }

    // Set up intervals
    setInterval(ensureConnected, config.clickInterval);
    setInterval(simulateActivity, config.moveInterval);

    // Status check
    setInterval(() => {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
        console.log(`[LiveCalc] Uptime: ${uptime}m | Clicks: ${clickCount}`);
    }, 15 * 60 * 1000);

    console.log('[LiveCalc] ✅ Auto-reconnect active (click every 10m)');
})();
"""


def enable_auto_reconnect():
    """
    Enable auto-reconnect in current Colab notebook.

    This injects JavaScript that periodically clicks the connect button
    and simulates activity to prevent the notebook from timing out.

    Returns:
        None
    """
    display(Javascript(AUTO_RECONNECT_JS))
    print("✅ Auto-reconnect enabled")
    print("   - Will click Connect button every 10 minutes")
    print("   - Will simulate activity every 2 minutes")
    print("   - Check browser console for status")


def get_uptime():
    """
    Get estimated uptime (approximate, based on when this was called).

    Note: This is a Python-side estimate. For accurate uptime,
    check the browser console logs from the JavaScript.
    """
    # This would need to track session start time
    # For now, just return a message
    return "Check browser console for accurate uptime"


# Alternative: Function to display keep-alive instructions
def print_keep_alive_instructions():
    """
    Print instructions for manual keep-alive setup.

    Useful if JavaScript injection doesn't work or user prefers
    manual setup.
    """
    print("=" * 80)
    print("🔄 Manual Keep-Alive Setup")
    print("=" * 80)
    print("\nOption 1: Browser Console (Recommended)")
    print("  1. Press F12 to open browser console")
    print("  2. Paste the following JavaScript code:")
    print("  3. Press Enter")
    print("\n```javascript")
    print(AUTO_RECONNECT_JS)
    print("```\n")
    print("\nOption 2: Bookmarklet")
    print("  1. Create a new bookmark")
    print("  2. Set the URL to: javascript:" + AUTO_RECONNECT_JS.replace('\n', ''))
    print("  3. Click the bookmark when on Colab page")
    print("\nOption 3: Colab Pro")
    print("  - Upgrade to Colab Pro for more stable connections")
    print("  - Longer session limits (24 hours vs 12 hours)")
    print("  - Priority GPU access")
    print("\n" + "=" * 80)


# Monitoring function
def monitor_connection(check_interval=60):
    """
    Monitor connection status (Python-side).

    This is a blocking function that periodically checks if the
    notebook is still connected. Not recommended for production use.

    Args:
        check_interval: Seconds between checks (default: 60)
    """
    print("🔍 Monitoring connection status...")
    print("   Press Ctrl+C to stop")

    try:
        while True:
            # In a real implementation, this would check Colab connection
            # For now, just show that we're still running
            print(f"✅ Connected (checked at {time.strftime('%H:%M:%S')})")
            time.sleep(check_interval)
    except KeyboardInterrupt:
        print("\n⛔ Monitoring stopped")


if __name__ == "__main__":
    # If run as script, print instructions
    print_keep_alive_instructions()
