#include <catch2/catch_test_macros.hpp>
#include "../src/dag_config.hpp"
#include "../src/config_parser.hpp"
#include <fstream>
#include <cstdlib>

using namespace livecalc::orchestrator;

TEST_CASE("DAGConfig validation", "[dag_config]") {
    SECTION("Empty DAG should fail") {
        DAGConfig config;
        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("DAG with one engine should pass") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[0].inputs = {"policies"};
        config.engines[0].outputs = {"results"};
        config.data_sources["policies"] = DataSource("policies", "parquet", "data/policies.parquet");
        config.output = OutputConfig("parquet", "output/results.parquet");

        REQUIRE_NOTHROW(validate_dag_config(config));
    }

    SECTION("Duplicate engine IDs should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.data_sources["policies"] = DataSource("policies", "parquet", "data/policies.parquet");
        config.output = OutputConfig("parquet", "output/results.parquet");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("Missing data source should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[0].inputs = {"unknown_data"};
        config.engines[0].outputs = {"results"};
        config.output = OutputConfig("parquet", "output/results.parquet");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("Missing engine output should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("esg", "python_esg"));
        config.engines[0].inputs = {};
        config.engines[0].outputs = {"scenarios"};

        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[1].inputs = {"esg.unknown_output"};
        config.engines[1].outputs = {"results"};

        config.output = OutputConfig("parquet", "output/results.parquet");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("Empty engine type should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", ""));
        config.output = OutputConfig("parquet", "output/results.parquet");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("Empty output type should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[0].inputs = {"policies"};
        config.engines[0].outputs = {"results"};
        config.data_sources["policies"] = DataSource("policies", "parquet", "data/policies.parquet");
        config.output = OutputConfig("", "output/results.parquet");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }

    SECTION("Empty output path should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[0].inputs = {"policies"};
        config.engines[0].outputs = {"results"};
        config.data_sources["policies"] = DataSource("policies", "parquet", "data/policies.parquet");
        config.output = OutputConfig("parquet", "");

        REQUIRE_THROWS_AS(validate_dag_config(config), DAGConfigError);
    }
}

TEST_CASE("Topological execution order", "[dag_config]") {
    SECTION("Single engine") {
        DAGConfig config;
        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[0].inputs = {"policies"};
        config.engines[0].outputs = {"results"};
        config.data_sources["policies"] = DataSource("policies", "parquet", "data/policies.parquet");

        auto order = compute_execution_order(config);
        REQUIRE(order.size() == 1);
        REQUIRE(order[0] == "projection");
    }

    SECTION("Linear chain: esg → projection") {
        DAGConfig config;
        config.engines.push_back(EngineNode("esg", "python_esg"));
        config.engines[0].inputs = {};
        config.engines[0].outputs = {"scenarios"};

        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[1].inputs = {"esg.scenarios"};
        config.engines[1].outputs = {"results"};

        auto order = compute_execution_order(config);
        REQUIRE(order.size() == 2);
        REQUIRE(order[0] == "esg");
        REQUIRE(order[1] == "projection");
    }

    SECTION("Full pipeline: esg → projection → solver") {
        DAGConfig config;
        config.engines.push_back(EngineNode("esg", "python_esg"));
        config.engines[0].inputs = {};
        config.engines[0].outputs = {"scenarios"};

        config.engines.push_back(EngineNode("projection", "cpp_projection"));
        config.engines[1].inputs = {"esg.scenarios"};
        config.engines[1].outputs = {"projection_results"};

        config.engines.push_back(EngineNode("solver", "python_solver"));
        config.engines[2].inputs = {"projection.projection_results"};
        config.engines[2].outputs = {"optimized_parameters"};

        auto order = compute_execution_order(config);
        REQUIRE(order.size() == 3);
        REQUIRE(order[0] == "esg");
        REQUIRE(order[1] == "projection");
        REQUIRE(order[2] == "solver");
    }

    SECTION("Circular dependency should fail") {
        DAGConfig config;
        config.engines.push_back(EngineNode("a", "type_a"));
        config.engines[0].inputs = {"b.output"};
        config.engines[0].outputs = {"output"};

        config.engines.push_back(EngineNode("b", "type_b"));
        config.engines[1].inputs = {"a.output"};
        config.engines[1].outputs = {"output"};

        REQUIRE_THROWS_AS(compute_execution_order(config), DAGConfigError);
    }

    SECTION("Parallel execution with diamond dependency") {
        DAGConfig config;
        // a → b, a → c, b → d, c → d (diamond)
        config.engines.push_back(EngineNode("a", "type_a"));
        config.engines[0].inputs = {};
        config.engines[0].outputs = {"out_a"};

        config.engines.push_back(EngineNode("b", "type_b"));
        config.engines[1].inputs = {"a.out_a"};
        config.engines[1].outputs = {"out_b"};

        config.engines.push_back(EngineNode("c", "type_c"));
        config.engines[2].inputs = {"a.out_a"};
        config.engines[2].outputs = {"out_c"};

        config.engines.push_back(EngineNode("d", "type_d"));
        config.engines[3].inputs = {"b.out_b", "c.out_c"};
        config.engines[3].outputs = {"out_d"};

        auto order = compute_execution_order(config);
        REQUIRE(order.size() == 4);
        REQUIRE(order[0] == "a");
        // b and c can be in any order
        REQUIRE((order[1] == "b" || order[1] == "c"));
        REQUIRE((order[2] == "b" || order[2] == "c"));
        REQUIRE(order[1] != order[2]);
        REQUIRE(order[3] == "d");
    }
}

TEST_CASE("Input reference resolution", "[dag_config]") {
    SECTION("Data source reference") {
        auto [type, id] = resolve_input_reference("policies");
        REQUIRE(type == "data");
        REQUIRE(id == "policies");
    }

    SECTION("Engine output reference") {
        auto [type, id] = resolve_input_reference("esg.scenarios");
        REQUIRE(type == "engine");
        REQUIRE(id == "esg.scenarios");
    }

    SECTION("Empty reference should fail") {
        REQUIRE_THROWS_AS(resolve_input_reference(""), DAGConfigError);
    }
}

TEST_CASE("Environment variable expansion", "[config_parser]") {
    SECTION("Expand ${VAR}") {
        setenv("TEST_VAR", "test_value", 1);
        auto result = expand_environment_variables("prefix_${TEST_VAR}_suffix");
        REQUIRE(result == "prefix_test_value_suffix");
        unsetenv("TEST_VAR");
    }

    SECTION("Expand $VAR") {
        setenv("TEST_VAR", "test_value", 1);
        auto result = expand_environment_variables("prefix_$TEST_VAR");
        REQUIRE(result == "prefix_test_value");
        unsetenv("TEST_VAR");
    }

    SECTION("Undefined variable expands to empty string") {
        auto result = expand_environment_variables("${UNDEFINED_VAR}");
        REQUIRE(result == "");
    }

    SECTION("No variables returns original string") {
        auto result = expand_environment_variables("no_variables_here");
        REQUIRE(result == "no_variables_here");
    }
}

TEST_CASE("JSON config parsing", "[config_parser]") {
    SECTION("Parse minimal config") {
        std::string json = R"({
            "engines": [
                {
                    "id": "projection",
                    "type": "cpp_projection",
                    "inputs": ["policies"],
                    "outputs": ["results"]
                }
            ],
            "data_sources": {
                "policies": {"type": "parquet", "path": "data/policies.parquet"}
            },
            "output": {"type": "parquet", "path": "output/results.parquet"}
        })";

        auto config = parse_dag_config_from_string(json);
        REQUIRE(config.engines.size() == 1);
        REQUIRE(config.engines[0].id == "projection");
        REQUIRE(config.engines[0].type == "cpp_projection");
        REQUIRE(config.engines[0].inputs.size() == 1);
        REQUIRE(config.engines[0].outputs.size() == 1);
        REQUIRE(config.data_sources.size() == 1);
    }

    SECTION("Parse full pipeline config") {
        std::string json = R"({
            "description": "Full pipeline: ESG → Projection → Solver",
            "engines": [
                {
                    "id": "esg",
                    "type": "python_esg",
                    "config": {"esg_model": "vasicek", "outer_paths": "10"},
                    "inputs": [],
                    "outputs": ["scenarios"]
                },
                {
                    "id": "projection",
                    "type": "cpp_projection",
                    "inputs": ["esg.scenarios"],
                    "outputs": ["projection_results"]
                }
            ],
            "data_sources": {},
            "output": {"type": "parquet", "path": "output/results.parquet"}
        })";

        auto config = parse_dag_config_from_string(json);
        REQUIRE(config.description == "Full pipeline: ESG → Projection → Solver");
        REQUIRE(config.engines.size() == 2);
        REQUIRE(config.engines[0].config["esg_model"] == "vasicek");
        REQUIRE(config.engines[1].inputs[0] == "esg.scenarios");
    }

    SECTION("Missing engines field should fail") {
        std::string json = R"({
            "description": "Invalid config"
        })";

        REQUIRE_THROWS_AS(parse_dag_config_from_string(json), ConfigParseError);
    }

    SECTION("Invalid JSON should fail") {
        std::string json = "not valid json";
        REQUIRE_THROWS_AS(parse_dag_config_from_string(json), ConfigParseError);
    }
}

TEST_CASE("AMCredentials validation", "[dag_config]") {
    SECTION("Valid credentials") {
        AMCredentialsConfig creds("https://am.example.com", "token123", "/cache");
        REQUIRE(creds.is_valid() == true);
    }

    SECTION("Missing URL") {
        AMCredentialsConfig creds("", "token123", "/cache");
        REQUIRE(creds.is_valid() == false);
    }

    SECTION("Missing token") {
        AMCredentialsConfig creds("https://am.example.com", "", "/cache");
        REQUIRE(creds.is_valid() == false);
    }
}
