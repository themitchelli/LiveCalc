"""
LiveCalc GPU API Server

Standalone FastAPI server for GPU-accelerated projections.
Can run locally or on cloud instances with GPU support.

Usage:
    python api_server.py [--host 0.0.0.0] [--port 8000]
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import numpy as np
import time
import uuid
import argparse
from datetime import datetime, timedelta

# Import GPU engine
from numba_engine import (
    NumbaGPUEngine, Policy, ProjectionConfig, ExpenseAssumptions,
    Gender, ProductType, UnderwritingClass
)

# ============================================================================
# Configuration
# ============================================================================

JOB_TIMEOUT_SECONDS = 15 * 60  # 15 minutes
RESULT_RETENTION_SECONDS = 60 * 60  # 1 hour

# ============================================================================
# Initialize FastAPI
# ============================================================================

app = FastAPI(
    title="LiveCalc GPU API",
    description="GPU-accelerated actuarial projection API",
    version="1.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize GPU engine
engine = NumbaGPUEngine()
print(f"✅ GPU Engine initialized: {engine.get_schema()['gpu_model']}")

# Job storage (in-memory)
jobs: Dict[str, Dict] = {}

# ============================================================================
# Pydantic Models
# ============================================================================

class PolicyData(BaseModel):
    policy_id: int
    age: int
    gender: int  # 0=Male, 1=Female
    sum_assured: float
    premium: float
    term: int
    product_type: int = 0  # 0=Term
    underwriting_class: int = 0  # 0=Standard

class JobSubmitRequest(BaseModel):
    policies: List[PolicyData]
    scenarios: List[List[float]]  # num_scenarios × 50 years
    mortality_table: List[List[float]]  # 2 × 121
    lapse_table: List[float]  # 50 years
    expenses: Dict[str, float]
    config: Optional[Dict[str, float]] = None

class JobSubmitResponse(BaseModel):
    job_id: str
    status: str
    submitted_at: str
    num_policies: int
    num_scenarios: int

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # 'queued', 'running', 'completed', 'failed'
    submitted_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    progress: float = 0.0  # 0.0 to 1.0
    error: Optional[str] = None

class JobResultResponse(BaseModel):
    job_id: str
    status: str
    npvs: List[List[float]]  # num_policies × num_scenarios
    statistics: Dict[str, float]
    timing: Dict[str, float]
    gpu_model: str

# ============================================================================
# Background Job Processor
# ============================================================================

def process_job(job_id: str):
    """Process a projection job in background"""
    try:
        job = jobs[job_id]
        job['status'] = 'running'
        job['started_at'] = datetime.utcnow().isoformat()

        # Parse input data
        policies = [
            Policy(
                policy_id=p['policy_id'],
                age=p['age'],
                gender=Gender(p['gender']),
                sum_assured=p['sum_assured'],
                premium=p['premium'],
                term=p['term'],
                product_type=ProductType(p.get('product_type', 0)),
                underwriting_class=UnderwritingClass(p.get('underwriting_class', 0))
            )
            for p in job['request']['policies']
        ]

        scenarios = np.array(job['request']['scenarios'], dtype=np.float64)
        mortality_table = np.array(job['request']['mortality_table'], dtype=np.float64)
        lapse_table = np.array(job['request']['lapse_table'], dtype=np.float64)

        exp = job['request']['expenses']
        expenses = ExpenseAssumptions(
            per_policy_acquisition=exp['per_policy_acquisition'],
            per_policy_maintenance=exp['per_policy_maintenance'],
            percent_of_premium=exp['percent_of_premium'],
            claim_expense=exp['claim_expense']
        )

        config_data = job['request'].get('config', {})
        config = ProjectionConfig(
            detailed_cashflows=False,
            mortality_multiplier=config_data.get('mortality_multiplier', 1.0),
            lapse_multiplier=config_data.get('lapse_multiplier', 1.0),
            expense_multiplier=config_data.get('expense_multiplier', 1.0)
        )

        # Run projection
        job['progress'] = 0.5
        result = engine.project(policies, scenarios, mortality_table, lapse_table, expenses, config)

        # Store results
        job['status'] = 'completed'
        job['completed_at'] = datetime.utcnow().isoformat()
        job['progress'] = 1.0
        job['result'] = {
            'npvs': result.npvs.tolist(),
            'statistics': {
                'mean': float(np.mean(result.npvs)),
                'std': float(np.std(result.npvs)),
                'min': float(np.min(result.npvs)),
                'max': float(np.max(result.npvs)),
                'median': float(np.median(result.npvs))
            },
            'timing': {
                'total_runtime': result.total_runtime,
                'kernel_time': result.kernel_time,
                'memory_transfer_time': result.memory_transfer_time
            },
            'gpu_model': engine.get_schema()['gpu_model']
        }

        print(f"✅ Job {job_id} completed in {result.total_runtime:.2f}s")

    except Exception as e:
        job['status'] = 'failed'
        job['completed_at'] = datetime.utcnow().isoformat()
        job['error'] = str(e)
        print(f"❌ Job {job_id} failed: {e}")

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    return {
        "service": "LiveCalc GPU API",
        "version": "1.0",
        "status": "running",
        "gpu": engine.get_schema()['gpu_model']
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    schema = engine.get_schema()
    return {
        "status": "healthy",
        "gpu_model": schema['gpu_model'],
        "gpu_memory_gb": schema['gpu_memory_gb'],
        "compute_capability": schema['compute_capability'],
        "active_jobs": sum(1 for j in jobs.values() if j['status'] in ['queued', 'running']),
        "total_jobs": len(jobs)
    }

@app.post("/submit", response_model=JobSubmitResponse)
async def submit_job(request: JobSubmitRequest, background_tasks: BackgroundTasks):
    """Submit a new projection job"""
    job_id = str(uuid.uuid4())

    # Create job record
    job = {
        'job_id': job_id,
        'status': 'queued',
        'submitted_at': datetime.utcnow().isoformat(),
        'started_at': None,
        'completed_at': None,
        'progress': 0.0,
        'request': request.dict(),
        'result': None,
        'error': None
    }
    jobs[job_id] = job

    # Schedule background processing
    background_tasks.add_task(process_job, job_id)

    print(f"📝 Job {job_id} submitted: {len(request.policies)} policies × {len(request.scenarios)} scenarios")

    return JobSubmitResponse(
        job_id=job_id,
        status='queued',
        submitted_at=job['submitted_at'],
        num_policies=len(request.policies),
        num_scenarios=len(request.scenarios)
    )

@app.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get status of a job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return JobStatusResponse(
        job_id=job_id,
        status=job['status'],
        submitted_at=job['submitted_at'],
        started_at=job.get('started_at'),
        completed_at=job.get('completed_at'),
        progress=job['progress'],
        error=job.get('error')
    )

@app.get("/results/{job_id}", response_model=JobResultResponse)
async def get_job_results(job_id: str):
    """Get results of a completed job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    if job['status'] != 'completed':
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed yet. Status: {job['status']}"
        )

    result = job['result']
    return JobResultResponse(
        job_id=job_id,
        status=job['status'],
        npvs=result['npvs'],
        statistics=result['statistics'],
        timing=result['timing'],
        gpu_model=result['gpu_model']
    )

@app.delete("/job/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a job (if not yet completed)"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    if job['status'] in ['queued', 'running']:
        job['status'] = 'cancelled'
        job['completed_at'] = datetime.utcnow().isoformat()
        print(f"🛑 Job {job_id} cancelled")
        return {"message": "Job cancelled", "job_id": job_id}
    else:
        return {"message": f"Job cannot be cancelled (status: {job['status']})", "job_id": job_id}

# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="LiveCalc GPU API Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    print("\n" + "=" * 80)
    print("🚀 LiveCalc GPU API Server")
    print("=" * 80)
    print(f"\n📡 Starting server at http://{args.host}:{args.port}")
    print(f"🎮 GPU: {engine.get_schema()['gpu_model']}")
    print("\n" + "=" * 80)
    print("\nEndpoints:")
    print(f"  GET  /              - Root")
    print(f"  GET  /health        - Health check")
    print(f"  POST /submit        - Submit job")
    print(f"  GET  /status/{{id}}  - Job status")
    print(f"  GET  /results/{{id}} - Job results")
    print(f"  DELETE /job/{{id}}  - Cancel job")
    print("\n" + "=" * 80 + "\n")

    import uvicorn
    uvicorn.run(
        "api_server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )

if __name__ == "__main__":
    main()
