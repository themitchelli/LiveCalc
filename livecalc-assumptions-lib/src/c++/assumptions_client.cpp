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

double AssumptionsClient::resolve_scalar(
    const std::string& name,
    const std::string& version,
    const PolicyAttrs& policy_attrs)
{
    // Fetch full table
    std::vector<double> table = resolve(name, version);

    // For now, implement a simple lookup strategy
    // In a real implementation, this would:
    // 1. Fetch table schema to know column structure
    // 2. Match policy_attrs to table columns
    // 3. Perform binary search or hash lookup

    // Simplified implementation: assume mortality table with age-based lookup
    // and table structure: [age][gender_M][gender_F]

    if (policy_attrs.find("age") == policy_attrs.end()) {
        throw AssumptionsError("Missing required attribute: age");
    }

    int age = std::get<int>(policy_attrs.at("age"));

    // Bounds checking
    if (age < 0 || age > 120) {
        throw AssumptionsError("Age out of bounds: " + std::to_string(age));
    }

    // Simple lookup: assume table is indexed by age (0-120)
    // For mortality: qx for male at index age, qx for female at index (121 + age)
    size_t index = static_cast<size_t>(age);

    // Check for gender
    if (policy_attrs.find("gender") != policy_attrs.end()) {
        std::string gender = std::get<std::string>(policy_attrs.at("gender"));
        if (gender == "F" || gender == "Female" || gender == "2") {
            index += 121; // Offset for female rates
        }
    }

    if (index >= table.size()) {
        throw AssumptionsError("Table index out of bounds");
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
