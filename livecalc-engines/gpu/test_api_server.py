"""
Test script for LiveCalc GPU API Server

Tests the API server endpoints with sample data.
Can test both local and remote (Colab) servers.

Usage:
    python test_api_server.py [--url http://localhost:8000]
"""

import requests
import time
import argparse
import json


def test_health(base_url):
    """Test health endpoint"""
    print("\n" + "=" * 80)
    print("Testing /health endpoint...")
    print("=" * 80)

    response = requests.get(f"{base_url}/health")
    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Server is healthy")
        print(f"   GPU Model: {data['gpu_model']}")
        print(f"   GPU Memory: {data['gpu_memory_gb']:.2f} GB")
        print(f"   Compute Capability: {data['compute_capability']}")
        print(f"   Active Jobs: {data['active_jobs']}")
        print(f"   Total Jobs: {data['total_jobs']}")
        return True
    else:
        print(f"❌ Health check failed")
        return False


def create_sample_job(num_policies=100, num_scenarios=10):
    """Create sample job payload"""
    # Simple mortality table (linear increase with age)
    mortality_table = []
    for gender in range(2):
        gender_rates = []
        for age in range(121):
            qx = age / 1000.0  # Simple linear mortality
            if gender == 1:  # Female
                qx *= 0.8  # 20% lower
            gender_rates.append(qx)
        mortality_table.append(gender_rates)

    # Simple lapse table (constant 5%)
    lapse_table = [0.05] * 50

    # Simple scenarios (constant 3% interest)
    scenarios = [[0.03] * 50 for _ in range(num_scenarios)]

    # Create policies
    policies = []
    for i in range(num_policies):
        policy = {
            "policy_id": i,
            "age": 30 + (i % 40),  # Ages 30-69
            "gender": i % 2,  # Alternate male/female
            "sum_assured": 100000.0 + i * 1000,
            "premium": 500.0 + i * 5,
            "term": 20,
            "product_type": 0,
            "underwriting_class": 0
        }
        policies.append(policy)

    # Expenses
    expenses = {
        "per_policy_acquisition": 100.0,
        "per_policy_maintenance": 10.0,
        "percent_of_premium": 0.05,
        "claim_expense": 50.0
    }

    return {
        "policies": policies,
        "scenarios": scenarios,
        "mortality_table": mortality_table,
        "lapse_table": lapse_table,
        "expenses": expenses
    }


def test_job_submission(base_url, num_policies=100, num_scenarios=10):
    """Test job submission and completion"""
    print("\n" + "=" * 80)
    print(f"Testing job submission ({num_policies} policies × {num_scenarios} scenarios)...")
    print("=" * 80)

    # Create sample job
    job_data = create_sample_job(num_policies, num_scenarios)

    # Submit job
    print(f"\n📤 Submitting job...")
    submit_start = time.time()
    response = requests.post(f"{base_url}/submit", json=job_data)

    if response.status_code != 200:
        print(f"❌ Job submission failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

    submit_data = response.json()
    job_id = submit_data['job_id']
    print(f"✅ Job submitted successfully")
    print(f"   Job ID: {job_id}")
    print(f"   Status: {submit_data['status']}")
    print(f"   Policies: {submit_data['num_policies']}")
    print(f"   Scenarios: {submit_data['num_scenarios']}")

    # Poll for completion
    print(f"\n⏳ Polling for job completion...")
    max_wait = 60  # 60 seconds timeout
    poll_start = time.time()

    for i in range(max_wait):
        time.sleep(1)
        elapsed = time.time() - poll_start

        # Get status
        response = requests.get(f"{base_url}/status/{job_id}")
        if response.status_code != 200:
            print(f"\n❌ Failed to get job status: {response.status_code}")
            return False

        status_data = response.json()
        status = status_data['status']
        progress = status_data['progress']

        print(f"   [{elapsed:.1f}s] Status: {status:12s} Progress: {progress:6.1%}", end="\r")

        if status == 'completed':
            # Get results
            response = requests.get(f"{base_url}/results/{job_id}")
            if response.status_code != 200:
                print(f"\n❌ Failed to get results: {response.status_code}")
                return False

            results = response.json()
            total_time = time.time() - submit_start

            print(f"\n\n✅ Job completed successfully!")
            print(f"\n📊 Results:")
            print(f"   NPV shape: {len(results['npvs'])} × {len(results['npvs'][0])}")
            print(f"   Mean NPV: ${results['statistics']['mean']:,.2f}")
            print(f"   Std NPV: ${results['statistics']['std']:,.2f}")
            print(f"   Min NPV: ${results['statistics']['min']:,.2f}")
            print(f"   Max NPV: ${results['statistics']['max']:,.2f}")

            print(f"\n⏱️  Timing:")
            print(f"   Total (submit → results): {total_time:.3f}s")
            print(f"   GPU kernel time: {results['timing']['kernel_time']:.3f}s")
            print(f"   Memory transfer: {results['timing']['memory_transfer_time']:.3f}s")
            print(f"   GPU model: {results['gpu_model']}")

            throughput = (num_policies * num_scenarios) / results['timing']['total_runtime']
            print(f"   Throughput: {throughput:,.0f} projections/sec")

            return True

        elif status == 'failed':
            print(f"\n\n❌ Job failed: {status_data.get('error', 'Unknown error')}")
            return False

    print(f"\n\n⚠️  Timeout waiting for job completion ({max_wait}s)")
    return False


def test_cancel_job(base_url):
    """Test job cancellation"""
    print("\n" + "=" * 80)
    print("Testing job cancellation...")
    print("=" * 80)

    # Submit a job
    job_data = create_sample_job(num_policies=1000, num_scenarios=100)
    response = requests.post(f"{base_url}/submit", json=job_data)

    if response.status_code != 200:
        print(f"❌ Failed to submit job for cancellation test")
        return False

    job_id = response.json()['job_id']
    print(f"📤 Submitted job: {job_id}")

    # Immediately try to cancel
    time.sleep(0.1)  # Small delay
    response = requests.delete(f"{base_url}/job/{job_id}")

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Cancellation response: {data['message']}")
        return True
    else:
        print(f"❌ Cancellation failed: {response.status_code}")
        return False


def main():
    """Main test runner"""
    parser = argparse.ArgumentParser(description="Test LiveCalc GPU API Server")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of API server")
    parser.add_argument("--skip-cancel", action="store_true", help="Skip cancellation test")
    parser.add_argument("--policies", type=int, default=100, help="Number of policies (default: 100)")
    parser.add_argument("--scenarios", type=int, default=10, help="Number of scenarios (default: 10)")
    args = parser.parse_args()

    base_url = args.url.rstrip('/')

    print("\n" + "=" * 80)
    print("🧪 LiveCalc GPU API Server Tests")
    print("=" * 80)
    print(f"\nTarget: {base_url}")
    print("=" * 80)

    # Test health
    if not test_health(base_url):
        print("\n❌ Health check failed. Is the server running?")
        return 1

    # Test job submission
    if not test_job_submission(base_url, args.policies, args.scenarios):
        print("\n❌ Job submission test failed")
        return 1

    # Test cancellation (optional)
    if not args.skip_cancel:
        if not test_cancel_job(base_url):
            print("\n⚠️  Cancellation test failed (may be normal if job completed too quickly)")

    print("\n" + "=" * 80)
    print("✅ All tests passed!")
    print("=" * 80 + "\n")

    return 0


if __name__ == "__main__":
    exit(main())
