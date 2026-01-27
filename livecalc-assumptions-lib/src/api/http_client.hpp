#pragma once

#include <string>
#include <map>
#include <memory>
#include <stdexcept>
#include <chrono>

namespace livecalc {
namespace assumptions {

/**
 * HTTP response structure
 */
struct HttpResponse {
    int status_code;
    std::string body;
    std::map<std::string, std::string> headers;
    std::chrono::milliseconds duration;
};

/**
 * HTTP client error
 */
class HttpClientError : public std::runtime_error {
public:
    HttpClientError(const std::string& message, int status_code = 0)
        : std::runtime_error(message), status_code_(status_code) {}

    int status_code() const { return status_code_; }

private:
    int status_code_;
};

/**
 * HTTP client with retry logic and timeout support
 *
 * Features:
 * - Exponential backoff retry (1s, 2s, 4s max 3 retries)
 * - Configurable timeout (default 30s)
 * - Connection pooling via libcurl
 * - Request/response logging in debug mode
 * - Thread-safe
 */
class HttpClient {
public:
    /**
     * Constructor
     * @param base_url Base URL for all requests (e.g., "https://am.ddns.net")
     * @param timeout_ms Timeout in milliseconds (default: 30000)
     */
    explicit HttpClient(const std::string& base_url, int timeout_ms = 30000);

    /**
     * Destructor
     */
    ~HttpClient();

    /**
     * GET request with automatic retry
     * @param path Path relative to base_url (e.g., "/api/v1/tables")
     * @param headers Additional headers (e.g., {"Authorization": "Bearer TOKEN"})
     * @return HttpResponse
     * @throws HttpClientError on failure after retries
     */
    HttpResponse get(const std::string& path,
                     const std::map<std::string, std::string>& headers = {});

    /**
     * POST request with automatic retry
     * @param path Path relative to base_url
     * @param body Request body (JSON string)
     * @param headers Additional headers
     * @return HttpResponse
     * @throws HttpClientError on failure after retries
     */
    HttpResponse post(const std::string& path,
                      const std::string& body,
                      const std::map<std::string, std::string>& headers = {});

    /**
     * Set debug mode (logs requests/responses, redacts tokens)
     */
    void set_debug(bool debug) { debug_ = debug; }

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;

    std::string base_url_;
    int timeout_ms_;
    bool debug_;

    // Retry logic
    static constexpr int MAX_RETRIES = 3;
    static constexpr int RETRY_DELAYS_MS[MAX_RETRIES] = {1000, 2000, 4000};

    bool should_retry(int status_code) const;
    HttpResponse execute_with_retry(
        const std::string& method,
        const std::string& path,
        const std::string& body,
        const std::map<std::string, std::string>& headers
    );
};

} // namespace assumptions
} // namespace livecalc
