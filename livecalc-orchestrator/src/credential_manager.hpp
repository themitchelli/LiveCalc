/**
 * @file credential_manager.hpp
 * @brief Centralized credential management for Assumptions Manager authentication
 *
 * The CredentialManager handles:
 * - Loading credentials from multiple sources (environment, file, interactive)
 * - Token validation and refresh
 * - Secure credential storage (no logging of tokens)
 * - Integration with engine initialization
 *
 * Credential Sources (in priority order):
 * 1. Explicit credentials passed to constructor
 * 2. Environment variables: LIVECALC_AM_URL, LIVECALC_AM_TOKEN, LIVECALC_AM_CACHE_DIR
 * 3. Configuration file: ~/.livecalc/credentials.json
 * 4. Interactive login (not implemented in this version)
 */

#ifndef LIVECALC_CREDENTIAL_MANAGER_HPP
#define LIVECALC_CREDENTIAL_MANAGER_HPP

#include "engine_interface.hpp"
#include <string>
#include <memory>
#include <chrono>
#include <optional>

namespace livecalc {

/**
 * @brief Source from which credentials were loaded
 */
enum class CredentialSource {
    EXPLICIT,       ///< Passed directly to constructor
    ENVIRONMENT,    ///< Loaded from environment variables
    CONFIG_FILE,    ///< Loaded from ~/.livecalc/credentials.json
    NONE            ///< No credentials available
};

/**
 * @brief Token metadata for refresh management
 */
struct TokenInfo {
    std::string token;
    std::chrono::system_clock::time_point issued_at;
    std::chrono::system_clock::time_point expires_at;
    bool is_valid;

    TokenInfo() : is_valid(false) {}

    /**
     * @brief Check if token is expired or will expire soon
     * @param threshold_minutes Minutes before expiry to consider token stale (default: 5)
     * @return True if token needs refresh
     */
    bool needs_refresh(int threshold_minutes = 5) const;

    /**
     * @brief Get time until expiry in seconds
     */
    int seconds_until_expiry() const;
};

/**
 * @brief Manages Assumptions Manager credentials and token lifecycle
 */
class CredentialManager {
public:
    /**
     * @brief Create credential manager with explicit credentials (highest priority)
     */
    explicit CredentialManager(const AMCredentials& credentials);

    /**
     * @brief Create credential manager that discovers credentials from environment/file
     */
    CredentialManager();

    /**
     * @brief Destructor - ensures no credentials logged
     */
    ~CredentialManager();

    /**
     * @brief Get current credentials
     * @throws CalcEngineError if no valid credentials available
     */
    AMCredentials get_credentials() const;

    /**
     * @brief Check if valid credentials are available
     */
    bool has_credentials() const;

    /**
     * @brief Get source from which credentials were loaded
     */
    CredentialSource get_source() const { return source_; }

    /**
     * @brief Validate credentials (check token format, URL reachability)
     * @param check_connectivity If true, attempts HTTP request to AM URL
     * @return True if credentials appear valid
     */
    bool validate(bool check_connectivity = false);

    /**
     * @brief Refresh token if needed
     * @return True if token was refreshed or is still valid
     * @throws CalcEngineError if refresh fails
     *
     * This is a placeholder for future token refresh logic.
     * Currently returns true if token is valid, throws if invalid.
     */
    bool refresh_if_needed();

    /**
     * @brief Get token metadata (if available)
     */
    std::optional<TokenInfo> get_token_info() const;

    /**
     * @brief Clear stored credentials (for security/logout)
     */
    void clear();

    /**
     * @brief Update credentials (e.g., after manual refresh)
     */
    void update_credentials(const AMCredentials& new_credentials);

    /**
     * @brief Get a sanitized string representation for logging
     * @return String with URL visible but token masked
     */
    std::string to_string() const;

private:
    AMCredentials credentials_;
    CredentialSource source_;
    std::optional<TokenInfo> token_info_;

    /**
     * @brief Load credentials from environment variables
     */
    bool load_from_environment();

    /**
     * @brief Load credentials from config file (~/.livecalc/credentials.json)
     */
    bool load_from_file();

    /**
     * @brief Parse JWT token to extract metadata (issuer, expiry, etc.)
     * @return TokenInfo if parsing succeeds, std::nullopt otherwise
     */
    std::optional<TokenInfo> parse_jwt(const std::string& token);

    /**
     * @brief Get default cache directory based on OS
     */
    static std::string get_default_cache_dir();

    /**
     * @brief Mask token for safe logging (show first/last 4 chars)
     */
    static std::string mask_token(const std::string& token);
};

} // namespace livecalc

#endif // LIVECALC_CREDENTIAL_MANAGER_HPP
