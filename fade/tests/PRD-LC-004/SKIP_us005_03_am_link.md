# SKIP: AM assumptions link to view in Assumptions Manager
## AC: For AM assumptions: link to view in Assumptions Manager (future)

### Reason for Skip
This acceptance criterion explicitly states "(future)" indicating it is a placeholder for future integration with the Assumptions Manager (PRD-LC-006). The current implementation shows AM references but cannot link to a non-existent system.

### What Is Implemented
The code does display AM references with a distinct style (`.assumption-am-ref`) and includes placeholder text indicating the link is "not yet linked":

```javascript
sourceHtml = `<span class="assumption-am-ref" title="Assumptions Manager reference (not yet linked)">${escapeHtml(a.source)}</span>`;
```

### Recommendation
Re-test this AC once PRD-LC-006 (Assumptions Manager Integration) is complete and the linking functionality is implemented.
