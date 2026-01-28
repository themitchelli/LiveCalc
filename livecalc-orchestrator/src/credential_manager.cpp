/**
 * @file credential_manager.cpp
 * @brief Implementation of CredentialManager for AM authentication
 */

#include "credential_manager.hpp"
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <ctime>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#define MKDIR(dir) _mkdir(dir)
#else
#include <unistd.h>
#define MKDIR(dir) mkdir(dir, 0755)
#endif

namespace livecalc {

// TokenInfo implementation
bool TokenInfo::needs_refresh(int threshold_minutes) const {
    if (!is_valid) return true;

    auto now = std::chrono::system_clock::now();
    auto threshold = std::chrono::minutes(threshold_minutes);
    return (expires_at - now) <= threshold;
}

int TokenInfo::seconds_until_expiry() const {
    if (!is_valid) return 0;

    auto now = std::chrono::system_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::seconds>(expires_at - now);
    return static_cast<int>(duration.count());
}

// CredentialManager implementation
CredentialManager::CredentialManager(const AMCredentials& credentials)
    : credentials_(credentials), source_(CredentialSource::EXPLICIT) {
    if (credentials_.is_valid()) {
        token_info_ = parse_jwt(credentials_.am_token);
    }
}

CredentialManager::CredentialManager()
    : source_(CredentialSource::NONE) {
    // Try loading credentials in priority order
    if (load_from_environment()) {
        source_ = CredentialSource::ENVIRONMENT;
    } else if (load_from_file()) {
        source_ = CredentialSource::CONFIG_FILE;
    }

    if (credentials_.is_valid()) {
        token_info_ = parse_jwt(credentials_.am_token);
    }
}

CredentialManager::~CredentialManager() {
    // Ensure credentials are cleared from memory
    credentials_.am_token.clear();
}

AMCredentials CredentialManager::get_credentials() const {
    if (!credentials_.is_valid()) {
        throw CalcEngineError("No valid Assumptions Manager credentials available. "
                             "Set LIVECALC_AM_URL and LIVECALC_AM_TOKEN environment variables, "
                             "or provide credentials in config file.");
    }
    return credentials_;
}

bool CredentialManager::has_credentials() const {
    return credentials_.is_valid();
}

bool CredentialManager::validate(bool check_connectivity) {
    if (!credentials_.is_valid()) {
        return false;
    }

    // Basic validation: check URL format
    if (credentials_.am_url.find("http") != 0) {
        return false;
    }

    // Token should be non-empty and have JWT format (3 base64 parts separated by dots)
    size_t dot_count = 0;
    for (char c : credentials_.am_token) {
        if (c == '.') dot_count++;
    }
    if (dot_count != 2) {
        return false;
    }

    // Check if token is expired
    if (token_info_ && token_info_->is_valid) {
        if (token_info_->needs_refresh(0)) {  // Already expired
            return false;
        }
    }

    // Connectivity check not implemented in this version
    // Would require HTTP client library
    if (check_connectivity) {
        // Placeholder: in production, would make HEAD request to am_url/health
    }

    return true;
}

bool CredentialManager::refresh_if_needed() {
    if (!has_credentials()) {
        throw CalcEngineError("Cannot refresh: no credentials available");
    }

    // Check if refresh is needed
    if (token_info_ && token_info_->is_valid) {
        if (!token_info_->needs_refresh()) {
            return true;  // Token is still valid
        }

        // Token needs refresh
        // In production, this would call AM refresh endpoint
        // For now, we throw an error indicating manual refresh needed
        throw CalcEngineError(
            "Token expires in " + std::to_string(token_info_->seconds_until_expiry()) +
            " seconds. Please obtain a new token manually. "
            "Automatic token refresh not yet implemented."
        );
    }

    // No token info available, assume token is valid
    return true;
}

std::optional<TokenInfo> CredentialManager::get_token_info() const {
    return token_info_;
}

void CredentialManager::clear() {
    credentials_.am_url.clear();
    credentials_.am_token.clear();
    credentials_.cache_dir.clear();
    token_info_ = std::nullopt;
    source_ = CredentialSource::NONE;
}

void CredentialManager::update_credentials(const AMCredentials& new_credentials) {
    credentials_ = new_credentials;
    if (credentials_.is_valid()) {
        token_info_ = parse_jwt(credentials_.am_token);
        // Keep existing source if updating
    }
}

std::string CredentialManager::to_string() const {
    std::ostringstream oss;
    oss << "CredentialManager{";
    oss << "source=";
    switch (source_) {
        case CredentialSource::EXPLICIT: oss << "EXPLICIT"; break;
        case CredentialSource::ENVIRONMENT: oss << "ENVIRONMENT"; break;
        case CredentialSource::CONFIG_FILE: oss << "CONFIG_FILE"; break;
        case CredentialSource::NONE: oss << "NONE"; break;
    }
    oss << ", url=" << credentials_.am_url;
    oss << ", token=" << mask_token(credentials_.am_token);
    oss << ", cache_dir=" << credentials_.cache_dir;
    if (token_info_ && token_info_->is_valid) {
        oss << ", expires_in=" << token_info_->seconds_until_expiry() << "s";
    }
    oss << "}";
    return oss.str();
}

// Private methods
bool CredentialManager::load_from_environment() {
    const char* am_url = std::getenv("LIVECALC_AM_URL");
    const char* am_token = std::getenv("LIVECALC_AM_TOKEN");
    const char* cache_dir = std::getenv("LIVECALC_AM_CACHE_DIR");

    if (!am_url || !am_token) {
        return false;
    }

    credentials_.am_url = am_url;
    credentials_.am_token = am_token;
    credentials_.cache_dir = cache_dir ? cache_dir : get_default_cache_dir();

    return true;
}

bool CredentialManager::load_from_file() {
    // Look for ~/.livecalc/credentials.json
    const char* home = std::getenv("HOME");
    if (!home) {
        home = std::getenv("USERPROFILE");  // Windows
    }
    if (!home) {
        return false;
    }

    std::string config_path = std::string(home) + "/.livecalc/credentials.json";
    std::ifstream file(config_path);
    if (!file.is_open()) {
        return false;
    }

    // Simple JSON parsing (production would use nlohmann/json)
    std::string line;
    std::string url, token, cache;
    while (std::getline(file, line)) {
        // Strip whitespace
        line.erase(0, line.find_first_not_of(" \t\n\r"));

        if (line.find("\"am_url\"") != std::string::npos) {
            size_t start = line.find(":") + 1;
            size_t quote1 = line.find("\"", start);
            size_t quote2 = line.find("\"", quote1 + 1);
            if (quote1 != std::string::npos && quote2 != std::string::npos) {
                url = line.substr(quote1 + 1, quote2 - quote1 - 1);
            }
        } else if (line.find("\"am_token\"") != std::string::npos) {
            size_t start = line.find(":") + 1;
            size_t quote1 = line.find("\"", start);
            size_t quote2 = line.find("\"", quote1 + 1);
            if (quote1 != std::string::npos && quote2 != std::string::npos) {
                token = line.substr(quote1 + 1, quote2 - quote1 - 1);
            }
        } else if (line.find("\"cache_dir\"") != std::string::npos) {
            size_t start = line.find(":") + 1;
            size_t quote1 = line.find("\"", start);
            size_t quote2 = line.find("\"", quote1 + 1);
            if (quote1 != std::string::npos && quote2 != std::string::npos) {
                cache = line.substr(quote1 + 1, quote2 - quote1 - 1);
            }
        }
    }

    if (url.empty() || token.empty()) {
        return false;
    }

    credentials_.am_url = url;
    credentials_.am_token = token;
    credentials_.cache_dir = cache.empty() ? get_default_cache_dir() : cache;

    return true;
}

std::optional<TokenInfo> CredentialManager::parse_jwt(const std::string& token) {
    // Basic JWT parsing (header.payload.signature)
    // Production implementation would use a JWT library

    if (token.empty()) {
        return std::nullopt;
    }

    // Find the dots separating JWT parts
    size_t dot1 = token.find('.');
    size_t dot2 = token.find('.', dot1 + 1);
    if (dot1 == std::string::npos || dot2 == std::string::npos) {
        return std::nullopt;
    }

    // For now, create a TokenInfo with basic validation
    TokenInfo info;
    info.token = token;
    info.issued_at = std::chrono::system_clock::now();
    info.expires_at = info.issued_at + std::chrono::hours(1);  // Assume 1 hour validity
    info.is_valid = true;

    // In production, would decode base64 payload and extract:
    // - "iat" (issued at) claim
    // - "exp" (expiry) claim
    // - "iss" (issuer) claim for validation

    return info;
}

std::string CredentialManager::get_default_cache_dir() {
    const char* home = std::getenv("HOME");
    if (!home) {
        home = std::getenv("USERPROFILE");  // Windows
    }
    if (!home) {
        return ".livecalc_cache";
    }

    std::string cache_dir = std::string(home) + "/.livecalc/cache";

    // Create directory if it doesn't exist
    struct stat st;
    if (stat(cache_dir.c_str(), &st) != 0) {
        std::string livecalc_dir = std::string(home) + "/.livecalc";
        MKDIR(livecalc_dir.c_str());
        MKDIR(cache_dir.c_str());
    }

    return cache_dir;
}

std::string CredentialManager::mask_token(const std::string& token) {
    if (token.empty()) {
        return "<empty>";
    }
    if (token.length() <= 8) {
        return "****";
    }
    return token.substr(0, 4) + "..." + token.substr(token.length() - 4);
}

} // namespace livecalc
