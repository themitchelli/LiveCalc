#pragma once

#include "auth/jwt_handler.hpp"
#include "cache/lru_cache.hpp"
#include "api/http_client.hpp"
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <variant>
#include <stdexcept>

namespace livecalc {
namespace assumptions {

/**
 * Policy attribute value (int, double, or string)
 */
using PolicyAttrValue = std::variant<int, double, std::string>;

/**
 * Policy attributes map
 */
using PolicyAttrs = std::map<std::string, PolicyAttrValue>;

/**
 * Table schema information
 */
struct TableSchema {
    std::string name;
    std::string table_type;  // "mortality", "lapse", "expense"
    std::vector<std::string> index_columns;  // Columns used for lookup (e.g., ["age", "gender"])
    std::string value_column;  // Column containing the value (e.g., "qx", "rate", "amount")
    std::map<std::string, std::string> column_types;  // Column name -> type ("int", "string", "double")
    size_t row_count;
    size_t col_count;
};

/**
 * Assumptions client error
 */
class AssumptionsError : public std::runtime_error {
public:
    explicit AssumptionsError(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * Assumptions client for fetching and caching assumptions from Assumptions Manager
 *
 * Features:
 * - Resolves assumptions by name and version
 * - Version-immutable caching ('latest' always fetches fresh)
 * - JWT authentication with auto-refresh
 * - Thread-safe for multi-threaded projection engines
 * - Lookups by policy attributes (age, gender, smoker, etc.)
 *
 * Example usage:
 *   AssumptionsClient am("https://am.ddns.net", token, "/cache");
 *   auto qx = am.resolve_scalar("mortality-standard", "v2.1", {{"age", 50}, {"gender", "M"}});
 */
class AssumptionsClient {
public:
    /**
     * Constructor
     * @param am_url Assumptions Manager URL
     * @param jwt_token JWT token for authentication
     * @param cache_dir Cache directory (default: OS-standard)
     */
    AssumptionsClient(const std::string& am_url,
                      const std::string& jwt_token,
                      const std::string& cache_dir = "");

    /**
     * Destructor
     */
    ~AssumptionsClient();

    /**
     * Resolve assumption table (full table as vector)
     * @param name Table name (e.g., "mortality-standard")
     * @param version Version (e.g., "v2.1", "latest", "draft")
     * @return Table data as flat vector (row-major order)
     * @throws AssumptionsError on failure
     */
    std::vector<double> resolve(const std::string& name, const std::string& version);

    /**
     * Resolve scalar value from assumption table with policy attributes
     * @param name Table name
     * @param version Version
     * @param policy_attrs Policy attributes for lookup (e.g., {{"age", 50}, {"gender", "M"}})
     * @return Scalar value (qx, lapse rate, expense)
     * @throws AssumptionsError on failure or missing attributes
     */
    double resolve_scalar(const std::string& name,
                          const std::string& version,
                          const PolicyAttrs& policy_attrs);

    /**
     * List available versions for a table
     * @param name Table name
     * @return Vector of version strings
     * @throws AssumptionsError on failure
     */
    std::vector<std::string> list_versions(const std::string& name);

    /**
     * Get cache statistics
     */
    CacheStats get_cache_stats() const;

private:
    std::string am_url_;
    std::unique_ptr<JWTHandler> jwt_handler_;
    std::unique_ptr<LRUCache> cache_;
    std::unique_ptr<HttpClient> http_client_;
    std::map<std::string, TableSchema> schema_cache_;  // Cache for table schemas

    std::string build_cache_key(const std::string& name, const std::string& version) const;
    std::vector<double> fetch_from_api(const std::string& name, const std::string& version);
    TableSchema fetch_schema(const std::string& name, const std::string& version);
    size_t compute_table_index(const TableSchema& schema, const PolicyAttrs& policy_attrs) const;
};

} // namespace assumptions
} // namespace livecalc
