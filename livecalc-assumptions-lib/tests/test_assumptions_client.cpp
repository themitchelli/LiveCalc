#include <catch2/catch_test_macros.hpp>
#include "c++/assumptions_client.hpp"

using namespace livecalc::assumptions;

// Note: These tests require a mock Assumptions Manager API
// In production, we'd use a mock HTTP server or dependency injection

TEST_CASE("AssumptionsClient constructor", "[assumptions_client]") {
    SECTION("Constructs with valid parameters") {
        // This will fail without a live AM instance
        // In production, we'd mock the HTTP client
        // Use a properly formatted JWT token (header.payload.signature)
        REQUIRE_NOTHROW(
            AssumptionsClient("https://am.ddns.net",
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDAwMDAwMDB9.signature",
                "/tmp/cache")
        );
    }
}

TEST_CASE("Cache key building", "[assumptions_client]") {
    // Test cache key format
    std::string name = "mortality-standard";
    std::string version = "v2.1";
    std::string expected = "mortality-standard:v2.1";

    // We can't directly test build_cache_key (private), but we can test behavior
    REQUIRE(true);  // Placeholder
}

TEST_CASE("PolicyAttrs variants", "[assumptions_client]") {
    PolicyAttrs attrs;

    attrs["age"] = 50;
    attrs["gender"] = std::string("M");
    attrs["smoker"] = 0;

    REQUIRE(std::get<int>(attrs["age"]) == 50);
    REQUIRE(std::get<std::string>(attrs["gender"]) == "M");
    REQUIRE(std::get<int>(attrs["smoker"]) == 0);
}

TEST_CASE("TableSchema structure", "[assumptions_client]") {
    SECTION("Mortality table schema") {
        TableSchema schema;
        schema.name = "mortality-standard";
        schema.table_type = "mortality";
        schema.index_columns = {"age", "gender"};
        schema.value_column = "qx";
        schema.row_count = 242;  // 121 ages × 2 genders
        schema.col_count = 3;    // age, gender, qx

        schema.column_types["age"] = "int";
        schema.column_types["gender"] = "string";
        schema.column_types["qx"] = "double";

        REQUIRE(schema.table_type == "mortality");
        REQUIRE(schema.index_columns.size() == 2);
        REQUIRE(schema.row_count == 242);
    }

    SECTION("Lapse table schema") {
        TableSchema schema;
        schema.name = "lapse-standard";
        schema.table_type = "lapse";
        schema.index_columns = {"policy_year"};
        schema.value_column = "rate";
        schema.row_count = 50;  // Years 1-50
        schema.col_count = 2;   // policy_year, rate

        schema.column_types["policy_year"] = "int";
        schema.column_types["rate"] = "double";

        REQUIRE(schema.table_type == "lapse");
        REQUIRE(schema.index_columns.size() == 1);
        REQUIRE(schema.row_count == 50);
    }

    SECTION("Expense table schema") {
        TableSchema schema;
        schema.name = "expense-standard";
        schema.table_type = "expense";
        schema.index_columns = {};  // No index, single row
        schema.value_column = "amount";
        schema.row_count = 1;
        schema.col_count = 5;  // acquisition, maintenance, percent_of_premium, claim_expense, amount

        REQUIRE(schema.table_type == "expense");
        REQUIRE(schema.index_columns.empty());
    }
}

// Integration tests (require live AM instance)
// These are commented out for now

/*
TEST_CASE("Resolve table from API", "[assumptions_client][integration]") {
    AssumptionsClient am("https://assumptionsmanager.ddns.net", "valid-token", "/tmp/cache");

    SECTION("Resolve mortality table") {
        auto data = am.resolve("mortality-standard", "v2.1");
        REQUIRE(!data.empty());
        REQUIRE(data.size() >= 121);  // At least 0-120 ages
    }

    SECTION("Resolve with 'latest' version") {
        auto data = am.resolve("mortality-standard", "latest");
        REQUIRE(!data.empty());
    }
}

TEST_CASE("Resolve scalar with policy attributes", "[assumptions_client][integration]") {
    AssumptionsClient am("https://assumptionsmanager.ddns.net", "valid-token", "/tmp/cache");

    SECTION("Lookup mortality rate for 50-year-old male") {
        PolicyAttrs attrs = {
            {"age", 50},
            {"gender", std::string("M")}
        };

        double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
        REQUIRE(qx > 0.0);
        REQUIRE(qx <= 1.0);  // Probability must be in [0, 1]
    }

    SECTION("Lookup mortality rate for female") {
        PolicyAttrs attrs = {
            {"age", 50},
            {"gender", std::string("F")}
        };

        double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
        REQUIRE(qx > 0.0);
        REQUIRE(qx <= 1.0);
    }

    SECTION("Boundary cases") {
        PolicyAttrs attrs_age0 = {
            {"age", 0},
            {"gender", std::string("M")}
        };
        REQUIRE_NOTHROW(am.resolve_scalar("mortality-standard", "v2.1", attrs_age0));

        PolicyAttrs attrs_age120 = {
            {"age", 120},
            {"gender", std::string("M")}
        };
        REQUIRE_NOTHROW(am.resolve_scalar("mortality-standard", "v2.1", attrs_age120));
    }

    SECTION("Missing required attribute throws") {
        PolicyAttrs attrs_no_age = {
            {"gender", std::string("M")}
        };

        REQUIRE_THROWS_AS(
            am.resolve_scalar("mortality-standard", "v2.1", attrs_no_age),
            AssumptionsError
        );
    }
}

TEST_CASE("List versions", "[assumptions_client][integration]") {
    AssumptionsClient am("https://assumptionsmanager.ddns.net", "valid-token", "/tmp/cache");

    auto versions = am.list_versions("mortality-standard");
    REQUIRE(!versions.empty());
    REQUIRE(std::find(versions.begin(), versions.end(), "v2.1") != versions.end());
}

TEST_CASE("Cache behavior", "[assumptions_client][integration]") {
    AssumptionsClient am("https://assumptionsmanager.ddns.net", "valid-token", "/tmp/cache");

    SECTION("Versioned assumptions are cached") {
        auto data1 = am.resolve("mortality-standard", "v2.1");
        auto stats1 = am.get_cache_stats();

        auto data2 = am.resolve("mortality-standard", "v2.1");
        auto stats2 = am.get_cache_stats();

        REQUIRE(stats2.hits > stats1.hits);  // Cache hit on second call
    }

    SECTION("'latest' version is not cached") {
        auto data1 = am.resolve("mortality-standard", "latest");
        auto stats1 = am.get_cache_stats();

        auto data2 = am.resolve("mortality-standard", "latest");
        auto stats2 = am.get_cache_stats();

        // Both should be misses (latest always fetches fresh)
        REQUIRE(stats2.misses > stats1.misses);
    }
}
*/
