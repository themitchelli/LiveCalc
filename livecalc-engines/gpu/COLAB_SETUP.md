# Google Colab Setup Guide

Complete guide for setting up LiveCalc GPU API on Google Colab with auto-reconnect.

## Quick Start

1. **Open the notebook**: Upload `colab_api_server.ipynb` to Google Colab
2. **Enable GPU**: Runtime → Change runtime type → GPU (T4/V100/A100)
3. **Run all cells**: Runtime → Run all
4. **Copy the ngrok URL**: Configure VS Code extension
5. **Enable auto-reconnect**: See below

## Auto-Reconnect Setup

Google Colab free tier disconnects after **12 hours** of inactivity. Use one of these methods to keep your session alive:

### Method 1: Python Helper (Recommended)

Add this cell to your notebook after the setup cells:

```python
# Enable auto-reconnect
from colab_auto_reconnect import enable_auto_reconnect
enable_auto_reconnect()
```

This injects JavaScript that:
- Clicks the Connect button every 10 minutes
- Simulates mouse activity every 2 minutes
- Logs status to browser console every 15 minutes

### Method 2: Browser Console

1. Press **F12** to open browser console
2. Paste this JavaScript code:
3. Press **Enter**

```javascript
(function() {
    console.log('[LiveCalc] Auto-reconnect enabled');

    function ensureConnected() {
        const button = document.querySelector('colab-connect-button');
        if (button) {
            const shadowRoot = button.shadowRoot;
            if (shadowRoot) {
                const paperButton = shadowRoot.querySelector('#connect');
                if (paperButton && !paperButton.disabled) {
                    paperButton.click();
                    console.log('[LiveCalc] Clicked connect');
                }
            }
        }
    }

    setInterval(ensureConnected, 10 * 60 * 1000);  // Every 10 minutes
    console.log('[LiveCalc] Will click Connect every 10 minutes');
})();
```

### Method 3: Colab Pro

**Upgrade to Colab Pro** for best reliability:
- **Longer sessions**: 24 hours vs 12 hours
- **Priority GPU access**: T4/V100/A100
- **Faster GPUs**: More likely to get V100/A100
- **Background execution**: Run even when tab is closed (limited)

Cost: **$9.99/month** (USD)

👉 [Sign up for Colab Pro](https://colab.research.google.com/signup)

### Method 4: External Keep-Alive (Advanced)

Run a Selenium script on a separate machine to keep the browser tab open:

```python
# keep_colab_alive.py
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

driver = webdriver.Chrome()
driver.get("https://colab.research.google.com/YOUR_NOTEBOOK_URL")

while True:
    try:
        # Click connect button if exists
        connect_button = driver.find_element(By.ID, "runtime-connect")
        if connect_button.is_enabled():
            connect_button.click()
            print(f"[{time.strftime('%H:%M:%S')}] Clicked connect")
    except:
        pass

    time.sleep(10 * 60)  # Every 10 minutes
```

**Note**: Requires a machine that stays on 24/7 (e.g., Raspberry Pi, home server).

## Connection Monitoring

### Check Connection Status

In your notebook, monitor connection with:

```python
import time
from IPython.display import clear_output

while True:
    clear_output(wait=True)
    print(f"✅ Connected at {time.strftime('%H:%M:%S')}")
    print(f"GPU: {engine.get_schema()['gpu_model']}")
    print(f"Active jobs: {sum(1 for j in jobs.values() if j['status'] in ['queued', 'running'])}")
    time.sleep(60)
```

### VS Code Extension Monitoring

The VS Code extension automatically detects disconnections:
- Polls `/health` endpoint every 5 minutes
- Shows "Reconnecting..." status if server is down
- Notifies user if connection lost for >10 minutes

Configure in VS Code settings:
```json
{
  "livecalc.colabApiUrl": "https://YOUR_NGROK_URL",
  "livecalc.colabHealthCheckInterval": 300000  // 5 minutes
}
```

## Troubleshooting

### Session Disconnected Despite Keep-Alive

**Causes:**
1. **Hard limit reached**: Free tier has absolute 12-hour limit regardless of activity
2. **Resource constraints**: Colab may evict sessions during high demand
3. **JavaScript blocked**: Browser extension blocking script execution

**Solutions:**
- Upgrade to Colab Pro (24-hour limit)
- Use external keep-alive script (Selenium)
- Split long-running jobs into smaller batches

### ngrok URL Changed After Reconnect

**Cause**: Free ngrok URLs are ephemeral (regenerated each session)

**Solutions:**
1. **ngrok auth token**: Sign up for free ngrok account and set auth token:
   ```python
   from pyngrok import ngrok
   ngrok.set_auth_token("YOUR_TOKEN_HERE")
   public_url = ngrok.connect(8000)
   ```
   Free tier provides persistent URLs for 8 hours

2. **Update VS Code**: Manually update `livecalc.colabApiUrl` after reconnect

3. **Webhook notification**: Configure ngrok webhook to notify VS Code of URL changes (Pro feature)

### GPU Not Available

**Symptoms**: `❌ CUDA not available!` when checking GPU

**Causes:**
1. GPU not enabled in runtime settings
2. All GPUs in use (free tier limits)
3. Exceeded daily GPU quota

**Solutions:**
1. Runtime → Change runtime type → GPU (select T4)
2. Wait 5-10 minutes and try again
3. Use Colab Pro for priority access
4. Check quota: Runtime → View runtime history

### Server Stops Responding

**Symptoms**: `/health` endpoint returns 502/504 or times out

**Causes:**
1. Colab session disconnected
2. Python kernel crashed
3. ngrok tunnel closed

**Solutions:**
1. Check browser console for errors
2. Restart notebook: Runtime → Restart runtime
3. Re-run all cells
4. Check ngrok status: `ngrok.get_tunnels()`

## Best Practices

### Free Tier

For users on **Colab free tier**:

✅ **DO:**
- Use auto-reconnect scripts
- Monitor connection status
- Split large jobs into smaller batches
- Save intermediate results frequently
- Run during off-peak hours (late night UTC)

❌ **DON'T:**
- Expect 100% uptime
- Submit jobs >1 hour duration
- Rely on Colab for production workloads
- Mine cryptocurrency or run non-ML workloads (violates TOS)

### Colab Pro

For users on **Colab Pro**:

✅ **DO:**
- Use full 24-hour sessions
- Request V100/A100 GPUs when available
- Run larger batches (1M policies × 1K scenarios)
- Use background execution for long jobs

❌ **DON'T:**
- Assume 100% V100/A100 availability (still best-effort)
- Violate usage limits (see Colab Pro TOS)

### Production Deployment

For **production use**, consider alternatives to Colab:

1. **Cloud GPU instances**:
   - AWS EC2 (g4dn.xlarge with T4 GPU)
   - Google Cloud (n1-standard-4 with T4 GPU)
   - Azure (NC6 series)
   - Lambda Labs (cheaper than big clouds)

2. **Serverless GPU**:
   - Modal (Python functions with GPU)
   - Banana.dev (GPU inference)
   - Replicate (GPU model hosting)

3. **Dedicated GPU server**:
   - Local workstation with RTX 4090
   - Hetzner dedicated servers
   - OVH/Scaleway GPU servers

## Comparison Table

| Feature | Free Tier | Colab Pro | Cloud GPU | Local GPU |
|---------|-----------|-----------|-----------|-----------|
| **Cost** | Free | $10/mo | $0.50-2/hr | $500-2000 upfront |
| **Max session** | 12 hours | 24 hours | Unlimited | Unlimited |
| **GPU** | T4 (16GB) | T4/V100/A100 | Any | Your choice |
| **Reliability** | Low | Medium | High | Highest |
| **Auto-reconnect** | Required | Helpful | N/A | N/A |
| **Setup time** | 5 minutes | 5 minutes | 30 minutes | 1-2 hours |
| **Best for** | Testing | Development | Production | Power users |

## Next Steps

1. ✅ Set up auto-reconnect (this guide)
2. ⏭️ Test API with `test_api_server.py`
3. ⏭️ Configure VS Code extension (US-LC-015-004)
4. ⏭️ Run benchmark (US-LC-015-009)

## Support

- **Issues**: https://github.com/themitchelli/LiveCalc/issues
- **Discussions**: https://github.com/themitchelli/LiveCalc/discussions
- **Colab Help**: https://research.google.com/colaboratory/faq.html
