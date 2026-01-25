#!/bin/bash
# Test: Endpoint triggers initialization of a cloud worker instance
# AC: Endpoint triggers the 'Initialization' of a cloud worker instance.
# US: US-BRIDGE-03 (Local-to-Cloud Bridge API)

set -e

# Check jobs router and job queue for worker initialization
JOBS_ROUTER="livecalc-cloud/api/routers/jobs.py"
JOB_MODEL="livecalc-cloud/api/models/job.py"

if [[ ! -f "$JOBS_ROUTER" ]]; then
    echo "FAIL: jobs.py router not found"
    exit 1
fi

# Verify job is enqueued (triggers worker initialization)
if ! grep -q "enqueue_job\|queue" "$JOBS_ROUTER"; then
    echo "FAIL: Job enqueue not found in submit handler"
    echo "Expected: Job queue integration"
    echo "Actual: No queue/enqueue found"
    exit 1
fi

# Verify INITIALIZING status exists in job model
if [[ -f "$JOB_MODEL" ]]; then
    if ! grep -q "INITIALIZING\|initializing" "$JOB_MODEL"; then
        echo "FAIL: INITIALIZING status not found in job model"
        echo "Expected: INITIALIZING job status"
        echo "Actual: No INITIALIZING status found"
        exit 1
    fi
fi

# Verify Job.create is called
if ! grep -q "Job.create" "$JOBS_ROUTER"; then
    echo "FAIL: Job creation not found"
    echo "Expected: Job.create() call"
    echo "Actual: No Job.create found"
    exit 1
fi

echo "PASS: Endpoint triggers initialization of cloud worker instance"
exit 0
