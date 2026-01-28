"""
Result export functionality for optimization results.

Provides JSON and Parquet export for OptimizationResult with iteration history.
"""

import json
from typing import Dict, Any, List, Optional
from pathlib import Path
from dataclasses import asdict
import logging

logger = logging.getLogger(__name__)


class ResultExporter:
    """
    Exports OptimizationResult to JSON and Parquet formats.

    Supports:
    - JSON export with summary and iteration history
    - Parquet export for iteration tracking across runs
    """

    @staticmethod
    def to_json(
        result: Any,  # OptimizationResult
        include_history: bool = False,
        iteration_history: Optional[List[Any]] = None,
        pretty: bool = True
    ) -> str:
        """
        Export OptimizationResult to JSON string.

        Args:
            result: OptimizationResult to export
            include_history: If True, include iteration history
            iteration_history: Optional list of IterationResult objects
            pretty: If True, format with indentation

        Returns:
            JSON string representation
        """
        output = {
            'final_params': result.final_parameters,
            'objective_value': result.objective_value,
            'converged': result.converged,
            'iterations': result.iterations,
            'execution_time_seconds': result.execution_time_seconds,
            'constraint_violations': result.constraint_violations,
            'partial_result': result.partial_result,
            'constraints_satisfied': len(result.constraint_violations) == 0
        }

        # Add iteration history if requested
        if include_history and iteration_history:
            output['iteration_history'] = [
                {
                    'iteration': it.iteration,
                    'parameters': it.parameters,
                    'objective_value': it.objective_value,
                    'constraint_violations': it.constraint_violations
                }
                for it in iteration_history
            ]

        if pretty:
            return json.dumps(output, indent=2)
        else:
            return json.dumps(output)

    @staticmethod
    def to_json_file(
        result: Any,
        file_path: str,
        include_history: bool = False,
        iteration_history: Optional[List[Any]] = None
    ) -> None:
        """
        Export OptimizationResult to JSON file.

        Args:
            result: OptimizationResult to export
            file_path: Output file path
            include_history: If True, include iteration history
            iteration_history: Optional list of IterationResult objects
        """
        json_str = ResultExporter.to_json(
            result,
            include_history=include_history,
            iteration_history=iteration_history,
            pretty=True
        )

        # Create parent directory if needed
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, 'w') as f:
            f.write(json_str)

        logger.info(f"Exported optimization result to: {file_path}")

    @staticmethod
    def to_parquet(
        iteration_history: List[Any],
        file_path: str,
        run_metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Export iteration history to Parquet file for analysis.

        Useful for tracking optimization progress across multiple runs
        and analyzing convergence patterns.

        Args:
            iteration_history: List of IterationResult objects
            file_path: Output parquet file path
            run_metadata: Optional metadata to include (timestamp, config, etc.)

        Raises:
            ImportError: If pyarrow/pandas not available
        """
        try:
            import pandas as pd
        except ImportError:
            raise ImportError(
                "Parquet export requires pandas. Install with: pip install pandas pyarrow"
            )

        if not iteration_history:
            logger.warning("No iteration history to export")
            return

        # Convert iteration history to DataFrame
        records = []
        for it in iteration_history:
            record = {
                'iteration': it.iteration,
                'objective_value': it.objective_value,
            }

            # Add parameters as columns
            for param_name, param_value in it.parameters.items():
                record[f'param_{param_name}'] = param_value

            # Add constraint violations as columns
            for constraint_name, violation in it.constraint_violations.items():
                record[f'constraint_{constraint_name}_violation'] = violation

            # Add total violation count
            record['total_violations'] = len([v for v in it.constraint_violations.values() if v > 0])

            # Add metadata if provided
            if run_metadata:
                for key, value in run_metadata.items():
                    record[f'meta_{key}'] = value

            records.append(record)

        df = pd.DataFrame(records)

        # Create parent directory if needed
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)

        # Write to parquet
        df.to_parquet(file_path, index=False)

        logger.info(f"Exported {len(records)} iterations to Parquet: {file_path}")

    @staticmethod
    def format_result_summary(result: Any, max_params: int = 10) -> str:
        """
        Format OptimizationResult as human-readable summary text.

        Args:
            result: OptimizationResult to format
            max_params: Maximum number of parameters to display

        Returns:
            Formatted summary string
        """
        lines = [
            "=== Optimization Result Summary ===",
            "",
            f"Status: {'Converged' if result.converged else 'Partial' if result.partial_result else 'Not Converged'}",
            f"Iterations: {result.iterations}",
            f"Execution Time: {result.execution_time_seconds:.2f}s",
            f"Objective Value: {result.objective_value:.4f}",
            "",
            "Optimized Parameters:",
        ]

        # Display parameters (limit if too many)
        param_items = list(result.final_parameters.items())
        for i, (name, value) in enumerate(param_items[:max_params]):
            lines.append(f"  {name}: {value:.4f}")

        if len(param_items) > max_params:
            lines.append(f"  ... and {len(param_items) - max_params} more")

        # Display constraint status
        lines.append("")
        if result.constraint_violations:
            lines.append(f"Constraint Violations: {len(result.constraint_violations)}")
            for name, violation in result.constraint_violations.items():
                if violation > 0:
                    lines.append(f"  {name}: violated by {violation:.4f}")
        else:
            lines.append("All Constraints Satisfied: Yes")

        return "\n".join(lines)
