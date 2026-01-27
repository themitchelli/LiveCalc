#include "c++/assumptions_client.hpp"
#include <nlohmann/json.hpp>
#include <sstream>

using json = nlohmann::json;

namespace livecalc {
namespace assumptions {

AssumptionsClient::AssumptionsClient(
    const std::string& am_url,
    const std::string& jwt_token,
    const std::string& cache_dir)
    : am_url_(am_url)
{
    // Initialize JWT handler
    jwt_handler_ = std::make_unique<JWTHandler>(am_url, jwt_token);

    // Initialize cache
    cache_ = std::make_unique<LRUCache>(cache_dir);

    // Initialize HTTP client
    http_client_ = std::make_unique<HttpClient>(am_url);
}

AssumptionsClient::~AssumptionsClient() = default;

std::string AssumptionsClient::build_cache_key(
    const std::string& name,
    const std::string& version) const
{
    return name + ":" + version;
}

std::vector<double> AssumptionsClient::fetch_from_api(
    const std::string& name,
    const std::string& version)
{
    try {
        // Get fresh token
        std::string token = jwt_handler_->get_token();

        // Build request path
        std::string path = "/api/v1/tables/" + name + "/versions/" + version + "/data";

        // Make API request
        std::map<std::string, std::string> headers = {
            {"Authorization", "Bearer " + token}
        };

        auto response = http_client_->get(path, headers);

        // Parse response
        auto data_json = json::parse(response.body);

        if (!data_json.contains("data") || !data_json["data"].is_array()) {
            throw AssumptionsError("Invalid API response: missing 'data' array");
        }

        // Convert JSON array to vector<double>
        std::vector<double> data;
        for (const auto& value : data_json["data"]) {
            if (value.is_array()) {
                // Nested array (2D table) - flatten
                for (const auto& inner_value : value) {
                    if (inner_value.is_number()) {
                        data.push_back(inner_value.get<double>());
                    } else {
                        throw AssumptionsError("Table contains non-numeric data");
                    }
                }
            } else if (value.is_number()) {
                data.push_back(value.get<double>());
            } else {
                throw AssumptionsError("Table contains non-numeric data");
            }
        }

        return data;

    } catch (const HttpClientError& e) {
        std::ostringstream oss;
        oss << "Failed to fetch assumption '" << name << ":" << version << "': " << e.what();
        throw AssumptionsError(oss.str());
    } catch (const json::exception& e) {
        std::ostringstream oss;
        oss << "Failed to parse assumption data: " << e.what();
        throw AssumptionsError(oss.str());
    } catch (const JWTError& e) {
        std::ostringstream oss;
        oss << "JWT authentication failed: " << e.what();
        throw AssumptionsError(oss.str());
    }
}

std::vector<double> AssumptionsClient::resolve(
    const std::string& name,
    const std::string& version)
{
    std::string cache_key = build_cache_key(name, version);

    // Try cache first (if cacheable)
    if (LRUCache::is_cacheable(cache_key)) {
        std::vector<double> data;
        if (cache_->get(cache_key, data)) {
            return data;
        }
    }

    // Fetch from API
    std::vector<double> data = fetch_from_api(name, version);

    // Cache if cacheable
    if (LRUCache::is_cacheable(cache_key)) {
        cache_->put(cache_key, version, data);
    }

    return data;
}

TableSchema AssumptionsClient::fetch_schema(
    const std::string& name,
    const std::string& version)
{
    std::string schema_key = name + ":" + version;

    // Check schema cache
    auto it = schema_cache_.find(schema_key);
    if (it != schema_cache_.end()) {
        return it->second;
    }

    try {
        // Get fresh token
        std::string token = jwt_handler_->get_token();

        // Build request path for schema
        std::string path = "/api/v1/tables/" + name + "/versions/" + version + "/schema";

        // Make API request
        std::map<std::string, std::string> headers = {
            {"Authorization", "Bearer " + token}
        };

        auto response = http_client_->get(path, headers);

        // Parse response
        auto schema_json = json::parse(response.body);

        TableSchema schema;
        schema.name = schema_json.value("name", name);
        schema.table_type = schema_json.value("table_type", "unknown");
        schema.row_count = schema_json.value("row_count", 0);
        schema.col_count = schema_json.value("col_count", 0);
        schema.value_column = schema_json.value("value_column", "value");

        // Parse index columns
        if (schema_json.contains("index_columns") && schema_json["index_columns"].is_array()) {
            for (const auto& col : schema_json["index_columns"]) {
                schema.index_columns.push_back(col.get<std::string>());
            }
        }

        // Parse column types
        if (schema_json.contains("columns") && schema_json["columns"].is_object()) {
            for (auto& [col_name, col_info] : schema_json["columns"].items()) {
                if (col_info.is_object() && col_info.contains("type")) {
                    schema.column_types[col_name] = col_info["type"].get<std::string>();
                }
            }
        }

        // Cache schema
        schema_cache_[schema_key] = schema;

        return schema;

    } catch (const HttpClientError& e) {
        std::ostringstream oss;
        oss << "Failed to fetch schema for '" << name << ":" << version << "': " << e.what();
        throw AssumptionsError(oss.str());
    } catch (const json::exception& e) {
        std::ostringstream oss;
        oss << "Failed to parse schema: " << e.what();
        throw AssumptionsError(oss.str());
    }
}

size_t AssumptionsClient::compute_table_index(
    const TableSchema& schema,
    const PolicyAttrs& policy_attrs) const
{
    // Verify required attributes are present
    for (const auto& index_col : schema.index_columns) {
        if (policy_attrs.find(index_col) == policy_attrs.end()) {
            throw AssumptionsError("Missing required attribute: " + index_col);
        }
    }

    // For mortality tables: age (0-120) × gender (M/F) = 242 values
    // Index = age + (gender == "F" ? 121 : 0)
    if (schema.table_type == "mortality") {
        int age = std::get<int>(policy_attrs.at("age"));

        // Bounds checking
        if (age < 0 || age > 120) {
            throw AssumptionsError("Age out of bounds: " + std::to_string(age));
        }

        size_t index = static_cast<size_t>(age);

        // Check for gender if it's an index column
        if (std::find(schema.index_columns.begin(), schema.index_columns.end(), "gender") != schema.index_columns.end()) {
            auto gender_it = policy_attrs.find("gender");
            if (gender_it != policy_attrs.end()) {
                std::string gender = std::get<std::string>(gender_it->second);
                if (gender == "F" || gender == "Female" || gender == "2") {
                    index += 121;
                }
            }
        }

        return index;
    }

    // For lapse tables: policy_year (1-50)
    // Index = policy_year - 1
    if (schema.table_type == "lapse") {
        int policy_year = std::get<int>(policy_attrs.at("policy_year"));

        // Bounds checking
        if (policy_year < 1 || policy_year > 50) {
            throw AssumptionsError("Policy year out of bounds: " + std::to_string(policy_year));
        }

        return static_cast<size_t>(policy_year - 1);
    }

    // For expense tables: typically single row or indexed by product type
    if (schema.table_type == "expense") {
        // Check if indexed by product_type
        if (std::find(schema.index_columns.begin(), schema.index_columns.end(), "product_type") != schema.index_columns.end()) {
            auto product_it = policy_attrs.find("product_type");
            if (product_it != policy_attrs.end()) {
                std::string product = std::get<std::string>(product_it->second);
                // Simple hash-based lookup (could be improved with schema metadata)
                // For now, assume product types map to indices 0-9
                if (product == "term") return 0;
                if (product == "whole_life") return 1;
                if (product == "endowment") return 2;
                return 0;  // Default to first product type
            }
        }
        return 0;  // Default to first row
    }

    // Generic fallback: compute index from index columns
    // This is a simple implementation that assumes row-major ordering
    size_t index = 0;
    size_t stride = 1;

    for (auto it = schema.index_columns.rbegin(); it != schema.index_columns.rend(); ++it) {
        const std::string& col_name = *it;
        auto attr_it = policy_attrs.find(col_name);
        if (attr_it == policy_attrs.end()) {
            continue;
        }

        // Get value based on type
        size_t value = 0;
        if (std::holds_alternative<int>(attr_it->second)) {
            value = static_cast<size_t>(std::get<int>(attr_it->second));
        } else if (std::holds_alternative<double>(attr_it->second)) {
            value = static_cast<size_t>(std::get<double>(attr_it->second));
        }

        index += value * stride;
        stride *= 121;  // Assume max 121 values per dimension (rough estimate)
    }

    return index;
}

double AssumptionsClient::resolve_scalar(
    const std::string& name,
    const std::string& version,
    const PolicyAttrs& policy_attrs)
{
    // Fetch table schema
    TableSchema schema = fetch_schema(name, version);

    // Fetch full table data
    std::vector<double> table = resolve(name, version);

    // Compute index based on schema and policy attributes
    size_t index = compute_table_index(schema, policy_attrs);

    // Bounds check
    if (index >= table.size()) {
        std::ostringstream oss;
        oss << "Table index out of bounds: " << index << " >= " << table.size();
        throw AssumptionsError(oss.str());
    }

    return table[index];
}

std::vector<std::string> AssumptionsClient::list_versions(const std::string& name)
{
    try {
        // Get fresh token
        std::string token = jwt_handler_->get_token();

        // Build request path
        std::string path = "/api/v1/tables/" + name + "/versions";

        // Make API request
        std::map<std::string, std::string> headers = {
            {"Authorization", "Bearer " + token}
        };

        auto response = http_client_->get(path, headers);

        // Parse response
        auto versions_json = json::parse(response.body);

        if (!versions_json.contains("versions") || !versions_json["versions"].is_array()) {
            throw AssumptionsError("Invalid API response: missing 'versions' array");
        }

        std::vector<std::string> versions;
        for (const auto& version : versions_json["versions"]) {
            if (version.is_string()) {
                versions.push_back(version.get<std::string>());
            } else if (version.is_object() && version.contains("version")) {
                versions.push_back(version["version"].get<std::string>());
            }
        }

        return versions;

    } catch (const HttpClientError& e) {
        std::ostringstream oss;
        oss << "Failed to list versions for '" << name << "': " << e.what();
        throw AssumptionsError(oss.str());
    } catch (const json::exception& e) {
        std::ostringstream oss;
        oss << "Failed to parse versions response: " << e.what();
        throw AssumptionsError(oss.str());
    } catch (const JWTError& e) {
        std::ostringstream oss;
        oss << "JWT authentication failed: " << e.what();
        throw AssumptionsError(oss.str());
    }
}

CacheStats AssumptionsClient::get_cache_stats() const
{
    return cache_->get_stats();
}

} // namespace assumptions
} // namespace livecalc
