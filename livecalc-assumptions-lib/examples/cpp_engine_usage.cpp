/**
 * Example C++ Projection Engine using LiveCalc Assumptions Library
 *
 * This demonstrates how to integrate the assumptions library into a
 * C++ projection engine for actuarial valuations.
 *
 * Build:
 *   g++ -std=c++17 -I../src cpp_engine_usage.cpp \
 *       -L../build -lassumptions_lib -lcurl \
 *       -o engine_example
 *
 * Run:
 *   export LIVECALC_AM_URL="https://assumptionsmanager.ddns.net"
 *   export LIVECALC_AM_TOKEN="your-jwt-token"
 *   ./engine_example
 */

#include "c++/assumptions_client.hpp"
#include <iostream>
#include <vector>
#include <cstdlib>
#include <cmath>
#include <stdexcept>

using namespace livecalc::assumptions;

// Policy structure
struct Policy {
    uint64_t id;
    int age;
    std::string gender;
    bool smoker;
    double sum_assured;
    double premium;
    int term;
};

// Engine assumptions structure (resolved at startup)
struct EngineAssumptions {
    std::vector<double> mortality_table;
    std::vector<double> lapse_table;
    std::vector<double> expenses_table;
};

// Initialize assumptions from AM
EngineAssumptions initialize_assumptions(AssumptionsClient& am) {
    std::cout << "Initializing assumptions from Assumptions Manager...\n";

    EngineAssumptions assumptions;

    try {
        // Resolve full tables at engine startup
        assumptions.mortality_table = am.resolve("mortality-standard", "v2.1");
        assumptions.lapse_table = am.resolve("lapse-standard", "v1.0");
        assumptions.expenses_table = am.resolve("expenses-default", "v1.2");

        std::cout << "✓ Resolved mortality table ("
                  << assumptions.mortality_table.size() << " entries)\n";
        std::cout << "✓ Resolved lapse table ("
                  << assumptions.lapse_table.size() << " entries)\n";
        std::cout << "✓ Resolved expenses ("
                  << assumptions.expenses_table.size() << " entries)\n";

        // Print cache statistics
        auto stats = am.get_cache_stats();
        std::cout << "Cache stats: " << stats.hits << " hits, "
                  << stats.misses << " misses, "
                  << stats.entries_count << " entries ("
                  << stats.bytes_stored / 1024 << " KB)\n";

    } catch (const AssumptionsError& e) {
        std::cerr << "✗ Failed to initialize assumptions: " << e.what() << "\n";
        throw;
    }

    return assumptions;
}

// Project a single policy under deterministic scenario
double project_policy(
    const Policy& policy,
    AssumptionsClient& am,
    const EngineAssumptions& assumptions
) {
    double npv = 0.0;
    double lives = 1.0;  // Start with 1 life
    const double discount_rate = 0.05;  // Fixed 5% for simplicity

    for (int year = 0; year < policy.term && lives > 0.001; ++year) {
        int current_age = policy.age + year;

        // Resolve mortality rate using policy attributes
        PolicyAttrs attrs = {
            {"age", current_age},
            {"gender", policy.gender},
            {"smoker", policy.smoker ? 1 : 0}
        };

        double qx = 0.0;
        try {
            qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
        } catch (const AssumptionsError& e) {
            std::cerr << "Warning: Failed to resolve mortality for policy "
                      << policy.id << ", age " << current_age
                      << ": " << e.what() << "\n";
            qx = 0.01;  // Fallback mortality rate
        }

        // Apply lapse rate (simplified: assume constant 5%)
        const double lapse_rate = 0.05;

        // Calculate cash flows
        double premium_income = policy.premium * lives;
        double deaths = qx * lives;
        double lapses = lapse_rate * (lives - deaths);
        double death_benefits = deaths * policy.sum_assured;

        // Net cash flow = premiums - death benefits
        double cashflow = premium_income - death_benefits;

        // Discount to present value
        double discount_factor = std::pow(1.0 / (1.0 + discount_rate), year + 1);
        npv += cashflow * discount_factor;

        // Update lives for next year
        lives -= (deaths + lapses);
    }

    return npv;
}

// Run valuation for a portfolio of policies
void run_valuation(
    const std::vector<Policy>& policies,
    AssumptionsClient& am,
    const EngineAssumptions& assumptions
) {
    std::cout << "\nRunning valuation for " << policies.size() << " policies...\n";

    double total_npv = 0.0;

    for (const auto& policy : policies) {
        double npv = project_policy(policy, am, assumptions);
        total_npv += npv;

        std::cout << "Policy " << policy.id
                  << " (age " << policy.age
                  << ", " << policy.gender
                  << ", " << (policy.smoker ? "smoker" : "non-smoker")
                  << "): NPV = $" << static_cast<int>(npv) << "\n";
    }

    std::cout << "\n=== Valuation Results ===\n";
    std::cout << "Total NPV: $" << static_cast<int>(total_npv) << "\n";
    std::cout << "Average NPV per policy: $"
              << static_cast<int>(total_npv / policies.size()) << "\n";
}

int main() {
    try {
        // 1. Get credentials from environment variables
        const char* am_url_env = std::getenv("LIVECALC_AM_URL");
        const char* jwt_token_env = std::getenv("LIVECALC_AM_TOKEN");
        const char* cache_dir_env = std::getenv("LIVECALC_AM_CACHE_DIR");

        if (!am_url_env || !jwt_token_env) {
            std::cerr << "Error: LIVECALC_AM_URL and LIVECALC_AM_TOKEN must be set\n";
            std::cerr << "\nUsage:\n";
            std::cerr << "  export LIVECALC_AM_URL=\"https://assumptionsmanager.ddns.net\"\n";
            std::cerr << "  export LIVECALC_AM_TOKEN=\"your-jwt-token\"\n";
            std::cerr << "  ./engine_example\n";
            return 1;
        }

        std::string am_url(am_url_env);
        std::string jwt_token(jwt_token_env);
        std::string cache_dir = cache_dir_env ? std::string(cache_dir_env) : "";

        std::cout << "=== LiveCalc Example Engine ===\n";
        std::cout << "AM URL: " << am_url << "\n";
        std::cout << "Cache dir: " << (cache_dir.empty() ? "<OS-standard>" : cache_dir) << "\n\n";

        // 2. Initialize Assumptions Client
        AssumptionsClient am(am_url, jwt_token, cache_dir);

        // 3. Initialize assumptions at engine startup
        auto assumptions = initialize_assumptions(am);

        // 4. Create sample policies
        std::vector<Policy> policies = {
            {1, 30, "M", false, 100000.0, 500.0, 20},   // Young male non-smoker
            {2, 45, "F", true, 150000.0, 1200.0, 15},   // Middle-aged female smoker
            {3, 25, "M", false, 200000.0, 600.0, 30},   // Young male non-smoker, large SA
            {4, 55, "F", false, 100000.0, 800.0, 10},   // Older female non-smoker
            {5, 40, "M", true, 250000.0, 2000.0, 20},   // Middle-aged male smoker
        };

        // 5. Run projection for all policies
        run_valuation(policies, am, assumptions);

        // 6. Print final cache statistics
        auto final_stats = am.get_cache_stats();
        std::cout << "\n=== Final Cache Statistics ===\n";
        std::cout << "Total hits: " << final_stats.hits << "\n";
        std::cout << "Total misses: " << final_stats.misses << "\n";
        std::cout << "Hit rate: "
                  << (100.0 * final_stats.hits / (final_stats.hits + final_stats.misses))
                  << "%\n";
        std::cout << "Cache size: " << (final_stats.bytes_stored / 1024) << " KB\n";
        std::cout << "Cache entries: " << final_stats.entries_count << "\n";

        return 0;

    } catch (const std::exception& e) {
        std::cerr << "\n✗ Fatal error: " << e.what() << "\n";
        return 1;
    }
}
