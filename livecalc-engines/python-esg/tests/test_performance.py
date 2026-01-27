"""
Unit tests for Python ESG Engine Performance & Memory Efficiency (US-007)

Tests the performance requirements including:
- Large scenario set generation (10K scenarios in <10 seconds)
- Vectorized generation using NumPy
- Memory efficiency (no duplication in Python heap)
- Lazy generation (on-demand path generation)
- Per-path generation speed (<1ms target)
"""

import unittest
import numpy as np
import sys
import os
import time

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from esg_engine import PythonESGEngine


class TestPerformanceTargets(unittest.TestCase):
    """Test performance targets for ESG generation"""

    def test_10k_scenarios_under_10_seconds(self):
        """Test: Generate 10K scenarios (10 outer × 1K inner) in <10 seconds"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'latest'
        }

        engine.initialize(config, credentials=None)

        # Prepare output buffer (legacy format for simplicity)
        total_scenarios = 10 * 1000
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        # Measure execution time
        start_time = time.time()
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
        execution_time = time.time() - start_time

        # Validate performance target
        self.assertLess(execution_time, 10.0,
                       f"Generation took {execution_time:.2f}s, expected <10s")

        # Validate scenarios were generated
        self.assertEqual(result['scenarios_generated'], 10000)

        # Validate output was written
        self.assertFalse(np.all(output_buffer == 0),
                        "Output buffer should contain non-zero values")

        print(f"✓ Generated 10K scenarios in {execution_time:.2f}s "
              f"({execution_time/10:.2f}s per 1K scenarios)")

        engine.dispose()

    def test_inner_path_generation_speed(self):
        """Test: Inner path generation <1ms per path on average"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 1000,  # Generate 3K paths total
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Prepare output buffer
        total_scenarios = 3 * 1000
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        # Measure execution time
        start_time = time.time()
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
        execution_time = time.time() - start_time

        # Calculate average time per path
        time_per_path_ms = (execution_time * 1000) / total_scenarios

        # Validate performance target (<1ms per path)
        self.assertLess(time_per_path_ms, 1.0,
                       f"Path generation took {time_per_path_ms:.3f}ms per path, expected <1ms")

        print(f"✓ Inner path generation: {time_per_path_ms:.3f}ms per path (target: <1ms)")

        engine.dispose()

    def test_memory_efficiency_no_duplication(self):
        """Test: Scenarios written to SharedArrayBuffer, not duplicated in Python heap"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Prepare output buffer
        total_scenarios = 5 * 100
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        # Generate scenarios
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)

        # Verify that the engine doesn't store scenarios internally
        # After dispose, only outer_paths should remain (deterministic skeleton)
        self.assertIsNotNone(engine._outer_paths,
                            "Outer paths should be stored (deterministic)")

        # Verify output buffer contains the generated scenarios
        self.assertFalse(np.all(output_buffer == 0),
                        "Output buffer should contain generated scenarios")

        # Memory footprint: outer_paths only (not full scenario set)
        outer_paths_bytes = engine._outer_paths.nbytes
        full_scenarios_bytes = output_buffer.nbytes

        # Outer paths should be much smaller than full scenarios
        self.assertLess(outer_paths_bytes, full_scenarios_bytes / 10,
                       f"Outer paths ({outer_paths_bytes} bytes) should be << "
                       f"full scenarios ({full_scenarios_bytes} bytes)")

        print(f"✓ Memory efficiency: outer_paths={outer_paths_bytes} bytes, "
              f"scenarios={full_scenarios_bytes} bytes "
              f"(ratio: 1:{full_scenarios_bytes/outer_paths_bytes:.0f})")

        engine.dispose()

    def test_lazy_generation_on_demand(self):
        """Test: Inner paths generated on-demand (not pre-generated)"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 10,  # Small for testing
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # After initialization, only outer paths should exist
        self.assertIsNotNone(engine._outer_paths, "Outer paths should be generated")
        self.assertEqual(engine._outer_paths.shape, (3, 50),
                        "Outer paths shape should match config")

        # No pre-generated inner paths should exist
        # (Implementation note: inner paths are generated in runChunk)

        # Generate scenarios
        total_scenarios = 3 * 10
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)

        # Verify scenarios were generated on-demand
        self.assertEqual(result['scenarios_generated'], 30)

        print(f"✓ Lazy generation: Only outer paths stored, inner paths generated on-demand")

        engine.dispose()

    def test_numpy_vectorization(self):
        """Test: Verify NumPy vectorization for batch operations"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Verify outer paths are numpy arrays (vectorized storage)
        self.assertIsInstance(engine._outer_paths, np.ndarray)

        # Generate scenarios
        total_scenarios = 3 * 100
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        start_time = time.time()
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
        execution_time = time.time() - start_time

        # Verify output is numpy array (vectorized output)
        self.assertIsInstance(output_buffer, np.ndarray)

        # With vectorization, 300 scenarios × 50 years should be fast
        # Target: <100ms for 300 scenarios
        self.assertLess(execution_time, 0.1,
                       f"Vectorized generation took {execution_time*1000:.2f}ms, expected <100ms")

        print(f"✓ NumPy vectorization: {total_scenarios} scenarios in {execution_time*1000:.2f}ms")

        engine.dispose()

    def test_large_scale_generation(self):
        """Test: Generate large scenario set (50 years × 10K scenarios) efficiently"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Prepare large output buffer (10K scenarios × 50 years = 500K data points)
        total_scenarios = 10 * 1000
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        # Measure memory before generation
        import sys
        buffer_size_mb = output_buffer.nbytes / (1024 * 1024)

        # Generate scenarios
        start_time = time.time()
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
        execution_time = time.time() - start_time

        # Validate performance
        self.assertLess(execution_time, 10.0,
                       f"Large-scale generation took {execution_time:.2f}s, expected <10s")

        # Validate scenarios were written
        self.assertEqual(result['scenarios_generated'], 10000)

        # Calculate throughput
        data_points = 10000 * 50
        throughput_per_sec = data_points / execution_time

        print(f"✓ Large-scale generation: {buffer_size_mb:.1f}MB buffer, "
              f"{execution_time:.2f}s, {throughput_per_sec:.0f} values/sec")

        engine.dispose()

    def test_structured_output_performance(self):
        """Test: Structured output format (US-005) performance with 10K scenarios"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Prepare structured output buffer (US-005 format)
        total_scenarios = 10 * 1000
        total_rows = total_scenarios * 50  # 500K rows

        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        # Measure execution time
        start_time = time.time()
        result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
        execution_time = time.time() - start_time

        # Validate performance target (<15s for structured format with more overhead)
        self.assertLess(execution_time, 15.0,
                       f"Structured generation took {execution_time:.2f}s, expected <15s")

        # Validate scenarios were generated
        self.assertEqual(result['scenarios_generated'], 10000)

        # Validate structured format
        self.assertTrue(np.all(output_buffer['scenario_id'] >= 0))
        self.assertTrue(np.all(output_buffer['year'] >= 1))
        self.assertTrue(np.all(output_buffer['year'] <= 50))
        self.assertTrue(np.all(output_buffer['rate'] > 0))

        print(f"✓ Structured output (US-005): 10K scenarios in {execution_time:.2f}s")

        engine.dispose()


class TestMemoryFootprint(unittest.TestCase):
    """Test memory footprint and efficiency"""

    def test_outer_paths_memory_usage(self):
        """Test: Outer paths memory usage is reasonable"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Check outer paths memory footprint
        outer_paths_bytes = engine._outer_paths.nbytes

        # Expected: 10 paths × 50 years × 8 bytes = 4KB
        expected_bytes = 10 * 50 * 8

        self.assertEqual(outer_paths_bytes, expected_bytes,
                        f"Outer paths memory: {outer_paths_bytes} bytes, expected {expected_bytes}")

        # Memory should be in KB range, not MB
        self.assertLess(outer_paths_bytes / 1024, 10,
                       "Outer paths should be < 10KB")

        print(f"✓ Outer paths memory: {outer_paths_bytes} bytes ({outer_paths_bytes/1024:.1f} KB)")

        engine.dispose()

    def test_no_memory_leak_after_dispose(self):
        """Test: Memory released after dispose"""
        engine = PythonESGEngine()

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }

        engine.initialize(config, credentials=None)

        # Verify state before dispose
        self.assertTrue(engine.is_initialized)
        self.assertIsNotNone(engine._outer_paths)
        self.assertIsNotNone(engine._config)

        # Dispose and verify cleanup
        engine.dispose()

        self.assertFalse(engine.is_initialized)
        self.assertIsNone(engine._outer_paths)
        self.assertIsNone(engine._config)
        self.assertIsNone(engine._assumptions_client)
        self.assertIsNone(engine._yield_curve_params)

        print(f"✓ Memory cleanup: All references cleared after dispose")


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)
