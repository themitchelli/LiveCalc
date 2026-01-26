# FADE Self-Healing System Proposal

**Date:** 2026-01-25
**Incident:** PRD-LC-013 regression test failure blocking overnight session
**Impact:** ~8 hours wasted (developer asleep during blockage)

---

## Executive Summary

FADE currently exits when regression tests fail, blocking all forward progress until a human investigates and fixes the issue. This proposal introduces an **autonomous self-healing system** that detects, classifies, and automatically repairs test failures without human intervention.

**Key Benefits:**
- **Zero overnight blockages** - MEDIUM severity issues auto-heal in <15 minutes
- **5+ hours saved per incident** - Autonomous fixing vs manual discovery + fix
- **Intelligent escalation** - CRITICAL failures still alert immediately
- **Full audit trail** - All healing events logged for transparency
- **Safety-first** - Healers cannot modify production code

---

## Current Incident Analysis

### What Failed?
**11 tests in PRD-LC-013** (Cloud Platform Management)

**Failure Log:** `/Users/stevemitchell/Documents/GitHub/LiveCalc/fade/tests/failed.log`

### Root Cause #1: Shell Portability (10 tests)

**Failing Code (line 19 in test files):**
```bash
BODY=$(echo "$RESPONSE" | head -n-1)
```

**Error:**
```
head: illegal line count -- -1
```

**Why it fails:**
- `head -n-1` (all lines except last) is a GNU coreutils 8.23+ feature
- macOS ships with **BSD head** which doesn't support negative line counts
- Classic cross-platform compatibility bug

**The Fix:**
```bash
# Replace this:
BODY=$(echo "$RESPONSE" | head -n-1)

# With this (portable across BSD and GNU):
BODY=$(echo "$RESPONSE" | sed '$d')
```

**Files to fix (10 files):**
- `fade/tests/PRD-LC-013/test_us_plat_01_01_namespace_creation.sh` (line 19)
- `fade/tests/PRD-LC-013/test_us_plat_01_05_mttc_verification.sh` (line 21)
- `fade/tests/PRD-LC-013/test_us_plat_02_03_warm_pool_api.sh` (line 38)
- `fade/tests/PRD-LC-013/test_us_plat_03_01_mean_stddev_calculation.sh` (line 38)
- `fade/tests/PRD-LC-013/test_us_plat_03_02_3sigma_anomaly_flagging.sh`
- `fade/tests/PRD-LC-013/test_us_plat_03_03_diagnostic_bundle.sh`
- `fade/tests/PRD-LC-013/test_us_plat_04_01_debug_pause_step_api.sh`
- `fade/tests/PRD-LC-013/test_us_plat_04_03_memory_inspection.sh`
- `fade/tests/PRD-LC-013/test_us_plat_04_04_bus_resource_listing.sh`

**Estimated fix time:** 5 minutes (replace single line in 10 files, commit)

### Root Cause #2: Missing Infrastructure (2 tests)

**Error:**
```
FAIL: Could not create test namespace
Response: {"detail":"Not Found"}
```

**Why it fails:**
- Tests expect API server running on `http://localhost:8000`
- No Docker Compose or test infrastructure documented

**The Fix:**
- Add `fade/tests/README.md` documenting environment setup
- Create `fade/tests/docker-compose.test.yml` for local API + K8s
- Add infrastructure checks before running integration tests

**Estimated fix time:** 30 minutes (documentation + Docker setup)

---

## Severity Classification

**Current incident:** MEDIUM

**Classification Logic:**

| Severity | Criteria | Response |
|----------|----------|----------|
| **CRITICAL** | Security issue, production code broken, data loss risk | Alert immediately + EXIT |
| **HIGH** | >50% regression broken, infrastructure changes needed | Auto-heal + pause for approval |
| **MEDIUM** | Isolated test issue, simple fix, pattern detected | **Auto-heal + auto-resume** |
| **LOW** | Flaky tests, cosmetic issues, intermittent | Log + defer to next session |

**Why this is MEDIUM:**
- ✅ Test-only issue (production code works fine)
- ✅ Simple pattern-based fix (one-line replacement)
- ✅ Isolated to single PRD test suite
- ✅ Automatically detectable error pattern
- ❌ But: 100% blockage (all 11 tests fail)

**Not CRITICAL because:**
- No production impact
- No security implications
- Code implementation is correct

---

## Proposed Self-Healing Architecture

### Current Workflow (Traditional)
```
FADE runs → Tests fail → EXIT
         ↓
Developer wakes up (4 hours later)
         ↓
Read logs, investigate (1 hour)
         ↓
Fix tests (15 minutes)
         ↓
Re-run FADE
         ↓
TOTAL TIME WASTED: ~5.3 hours
```

### Proposed Workflow (Self-Healing)
```
FADE runs → Tests fail → Classify severity
                              ↓
                         MEDIUM detected
                              ↓
                    Spawn test-healer agent
                              ↓
                    Agent analyzes failures (10s)
                              ↓
                    Agent proposes fix (15s)
                              ↓
                    Agent implements fix (20s)
                              ↓
                    Agent re-runs tests (8s)
                              ↓
                    Tests PASS ✅
                              ↓
                    Commit fix + log event
                              ↓
                    Resume FADE session
                              ↓
TOTAL TIME WASTED: 0 minutes (53s auto-heal)
TIME SAVED: 5.3 hours
```

### Components

#### 1. Test Failure Classifier
**Input:** Test output, error patterns, failure scope
**Output:** Severity level + rationale
**Logic:**
- Detects shell syntax errors → MEDIUM
- Detects authentication failures → CRITICAL
- Detects >50% regression → HIGH
- Detects flaky tests → LOW

#### 2. Healing Decision Engine
**Input:** Severity, configuration
**Output:** Action (auto-heal, pause, escalate, defer)

**Decision Matrix:**

| Severity | Auto-Heal? | User Approval? | Timeout |
|----------|------------|----------------|---------|
| CRITICAL | ❌ No | ✅ Immediate alert | N/A |
| HIGH | ✅ Yes | ✅ Pause for approval | 30min |
| MEDIUM | ✅ Yes | ❌ Auto-resume | 15min |
| LOW | ❌ No | ❌ Log only | N/A |

#### 3. Test-Healer Agent
**Specialized agent with constrained permissions:**

**Allowed:**
- Read test files (fade/tests/**)
- Edit test files (fade/tests/**)
- Run tests (bash test execution)
- Commit fixes (chore: auto-heal prefix)

**Forbidden:**
- Modify production code (src/, lib/, livecalc-*)
- Change test intent or coverage
- More than 3 healing attempts

**Agent Prompt:**
```
You are a test-healer agent. Regression tests have failed.

FAILURE REPORT:
- Tests failed: 11/11 in PRD-LC-013
- Error pattern: "head: illegal line count -- -1"
- Severity: MEDIUM

YOUR TASK:
1. Read failing tests and identify the pattern
2. Propose a minimal, portable fix
3. Implement the fix
4. Re-run tests
5. If PASS: commit and signal HEALED
6. If FAIL: signal ESCALATE

TIME LIMIT: 15 minutes
BEGIN.
```

#### 4. Healing Report Generator

**Per-Incident Report (healing-log.md):**
```markdown
## Healing Event: 2026-01-25 03:05:22

**Severity:** MEDIUM
**Root Cause:** Shell portability (BSD vs GNU head)
**Tests Failed:** 11/11 in PRD-LC-013

**Actions Taken:**
- Analyzed error pattern: "illegal line count -- -1"
- Identified: macOS BSD head doesn't support negative offsets
- Fix: Replaced `head -n-1` with `sed '$d'` (portable)
- Files modified: 10 test scripts
- Re-ran tests: 11/11 PASSED ✅

**Impact:**
- Time to heal: 53 seconds
- Traditional workflow: ~5.3 hours
- Time saved: 5.2 hours

**Commit:** chore: auto-heal shell portability in PRD-LC-013 tests
```

**Session Summary (appended to progress.md):**
```markdown
## Session Test Summary - 2026-01-25

**Stories Completed:** 4
**Session Duration:** 2.5 hours

**Test Activity:**
- New tests added: 18
- Total test runs: 47
- Total test time: 3m 42s

**Healing Events:**
- Regression failures: 1 (11 tests)
- Auto-healed: 1 (MEDIUM severity)
- Manual interventions: 0
- Time blocked: 0 minutes
- Time spent healing: 53 seconds

**Efficiency Gain:**
- Traditional workflow: ~5.3 hours lost
- Self-healing workflow: 0 minutes lost
- **NET SAVINGS: 5.3 hours**
```

---

## Implementation PRD

**Created:** `PRD-FADE-SH-001-regression-test-self-healing.json`

**User Stories (6):**
1. **US-HEAL-01:** Automatic Test Failure Classification
2. **US-HEAL-02:** Autonomous Test Healing for MEDIUM Severity
3. **US-HEAL-03:** User Approval Mode for HIGH Severity
4. **US-HEAL-04:** Healing Event Reporting
5. **US-HEAL-05:** Session Test Summary Report
6. **US-HEAL-06:** Shell Portability Healer (specialized for BSD/GNU issues)

**Estimated Implementation:** 6 FADE sessions

**Key Safety Constraints:**
- Healer agents can ONLY modify fade/tests/ directory
- Cannot touch production code
- Max 3 healing attempts before escalation
- 15-minute timeout per healing session
- Append-only healing-log.md for audit trail

---

## Configuration Example

**fade_config.json:**
```json
{
  "self_healing": {
    "enabled": true,
    "auto_heal_severities": ["MEDIUM"],
    "pause_for_approval_severities": ["HIGH"],
    "never_auto_heal_severities": ["CRITICAL", "LOW"],
    "healing_timeout_seconds": 900,
    "max_healing_attempts": 3,
    "notifications": {
      "critical": {
        "enabled": true,
        "channels": ["console", "slack"]
      }
    },
    "safety_constraints": {
      "allowed_directories": ["fade/tests/"],
      "forbidden_patterns": ["src/", "lib/", "livecalc-"]
    }
  }
}
```

---

## Next Steps

### Option 1: Urgent Fix Now (Manual)
1. Copy `PRD-FADE-SH-001-regression-test-self-healing.json` to FADE repo
2. Manually fix current incident:
   - Replace `head -n-1` with `sed '$d'` in 10 test files
   - Commit: `chore: fix shell portability in PRD-LC-013 tests`
3. Resume FADE session
4. Queue self-healing PRD for future implementation

**Time:** 10 minutes (fix) + future implementation

### Option 2: Implement Self-Healing First (PRD)
1. Copy PRD to FADE repo as `prd.json` (priority injection)
2. Let FADE implement self-healing system (6 sessions)
3. Then FADE can auto-heal its own future test failures

**Time:** ~6 sessions to implement, but prevents ALL future blockages

### Option 3: Hybrid Approach (Recommended)
1. Manually fix current incident (10 min)
2. Add to learned.md: "macOS uses BSD coreutils - use portable shell syntax"
3. Queue self-healing PRD in FADE repo (don't prioritize yet)
4. Resume current LiveCalc work
5. Implement self-healing when we hit another blockage incident

**Time:** 10 minutes now, prevention for future

---

## Risk Mitigation

**Concern:** "What if healer agent makes wrong fix and breaks more tests?"

**Mitigations:**
- 3-attempt limit with escalation
- Healer can ONLY modify test files (not production)
- Append-only audit log (healing-log.md)
- Test re-run required before marking HEALED
- Failed healing escalates to HIGH → user approval required

**Concern:** "Auto-healing might mask real bugs in production code"

**Mitigations:**
- Classifier detects production code failures as CRITICAL (never auto-heal)
- Healer only fixes test infrastructure issues (shell syntax, missing setup, etc.)
- All healing events logged for later review

**Concern:** "15-minute timeout might be insufficient"

**Mitigations:**
- Configurable timeout
- Timeout triggers escalation to HIGH → user approval workflow
- Complex fixes naturally escalate to human review

---

## Metrics to Track

**Per Incident:**
- Severity classification accuracy
- Healing success rate (HEALED vs ESCALATED)
- Time to heal
- Traditional time estimate (human-equivalent)
- Time saved

**Per Session:**
- Total healing events
- Auto-healed vs manual interventions
- Total time blocked
- Total time saved
- Test coverage growth

**Over Time:**
- Healing pattern library growth (reusable fixes)
- False positive rate (incorrect auto-heals)
- ROI: Development time saved vs implementation cost

---

## Conclusion

The current incident (PRD-LC-013 shell portability bug) is a perfect example of a **MEDIUM severity issue that should never block overnight**. The fix is trivial (single-line replacement in 10 files) but the discovery time was massive (8 hours waiting for human).

**Self-healing system ROI:**
- **Implementation cost:** 6 FADE sessions (~1 day)
- **Per-incident savings:** 4-8 hours
- **Break-even:** After 2-3 incidents
- **Annual savings:** Dozens of hours (assuming 1 incident/month)

**Recommendation:** Implement self-healing system (PRD-FADE-SH-001) to prevent future overnight blockages and maximize autonomous FADE productivity.

---

**Files Created:**
1. `PRD-FADE-SH-001-regression-test-self-healing.json` - Complete PRD for FADE repo
2. `FADE-SELF-HEALING-PROPOSAL.md` - This document

**Next Action:** Review PRD and choose Option 1, 2, or 3 above.
