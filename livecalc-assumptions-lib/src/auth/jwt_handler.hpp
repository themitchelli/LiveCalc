#pragma once

#include <string>
#include <memory>
#include <chrono>
#include <stdexcept>

namespace livecalc {
namespace assumptions {

/**
 * JWT handler error
 */
class JWTError : public std::runtime_error {
public:
    explicit JWTError(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * JWT token handler with automatic refresh
 *
 * Features:
 * - Manages token lifecycle
 * - Auto-refreshes token before expiry (5 minute threshold)
 * - Tokens never logged or exposed in debug output
 * - Thread-safe
 */
class JWTHandler {
public:
    /**
     * Constructor with username/password (will fetch token)
     * @param am_url Assumptions Manager URL
     * @param username Username
     * @param password Password
     */
    JWTHandler(const std::string& am_url,
               const std::string& username,
               const std::string& password);

    /**
     * Constructor with existing token
     * @param am_url Assumptions Manager URL
     * @param token JWT token
     */
    JWTHandler(const std::string& am_url, const std::string& token);

    /**
     * Destructor
     */
    ~JWTHandler();

    /**
     * Get current token (auto-refreshes if expiring soon)
     * @return JWT token string
     * @throws JWTError if refresh fails
     */
    std::string get_token();

    /**
     * Get time until token expires
     * @return Seconds until expiry (negative if expired)
     */
    int token_expires_in() const;

    /**
     * Force token refresh
     * @throws JWTError if refresh fails
     */
    void refresh_token();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;

    std::string am_url_;
    std::string token_;
    std::chrono::system_clock::time_point expiry_time_;

    // Credentials for refresh
    std::string username_;
    std::string password_;
    bool has_credentials_;

    // Refresh threshold: 5 minutes
    static constexpr int REFRESH_THRESHOLD_SECONDS = 5 * 60;

    void fetch_token();
    void parse_token_expiry();
};

} // namespace assumptions
} // namespace livecalc
