#include "api/http_client.hpp"
#include <curl/curl.h>
#include <thread>
#include <iostream>
#include <sstream>
#include <regex>

namespace livecalc {
namespace assumptions {

// Static initialization
constexpr int HttpClient::RETRY_DELAYS_MS[];

// CURL write callback
static size_t write_callback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t total_size = size * nmemb;
    std::string* str = static_cast<std::string*>(userp);
    str->append(static_cast<char*>(contents), total_size);
    return total_size;
}

// CURL header callback
static size_t header_callback(char* buffer, size_t size, size_t nitems, void* userdata) {
    size_t total_size = size * nitems;
    std::string header(buffer, total_size);

    auto* headers = static_cast<std::map<std::string, std::string>*>(userdata);

    // Parse header line: "Name: Value\r\n"
    size_t colon_pos = header.find(':');
    if (colon_pos != std::string::npos) {
        std::string name = header.substr(0, colon_pos);
        std::string value = header.substr(colon_pos + 1);

        // Trim whitespace
        value.erase(0, value.find_first_not_of(" \t\r\n"));
        value.erase(value.find_last_not_of(" \t\r\n") + 1);

        headers->insert({name, value});
    }

    return total_size;
}

struct HttpClient::Impl {
    CURL* curl;

    Impl() {
        curl_global_init(CURL_GLOBAL_DEFAULT);
        curl = curl_easy_init();
        if (!curl) {
            throw HttpClientError("Failed to initialize CURL");
        }
    }

    ~Impl() {
        if (curl) {
            curl_easy_cleanup(curl);
        }
        curl_global_cleanup();
    }
};

HttpClient::HttpClient(const std::string& base_url, int timeout_ms)
    : impl_(std::make_unique<Impl>())
    , base_url_(base_url)
    , timeout_ms_(timeout_ms)
    , debug_(false)
{
    // Remove trailing slash from base_url
    if (!base_url_.empty() && base_url_.back() == '/') {
        base_url_.pop_back();
    }
}

HttpClient::~HttpClient() = default;

bool HttpClient::should_retry(int status_code) const {
    // Retry on: timeout (408), rate limit (429), server errors (500-599)
    // Don't retry on: auth (401), forbidden (403), not found (404)
    if (status_code == 408 || status_code == 429) {
        return true;
    }
    if (status_code >= 500 && status_code < 600) {
        return true;
    }
    return false;
}

HttpResponse HttpClient::execute_with_retry(
    const std::string& method,
    const std::string& path,
    const std::string& body,
    const std::map<std::string, std::string>& headers)
{
    int attempt = 0;
    HttpClientError last_error("Unknown error");

    while (attempt < MAX_RETRIES) {
        try {
            auto start = std::chrono::steady_clock::now();

            // Build full URL
            std::string url = base_url_ + path;

            // Reset CURL handle
            curl_easy_reset(impl_->curl);
            curl_easy_setopt(impl_->curl, CURLOPT_URL, url.c_str());
            curl_easy_setopt(impl_->curl, CURLOPT_TIMEOUT_MS, timeout_ms_);

            // Set method
            if (method == "POST") {
                curl_easy_setopt(impl_->curl, CURLOPT_POST, 1L);
                curl_easy_setopt(impl_->curl, CURLOPT_POSTFIELDS, body.c_str());
            }

            // Set headers
            struct curl_slist* curl_headers = nullptr;
            curl_headers = curl_slist_append(curl_headers, "Content-Type: application/json");

            for (const auto& [key, value] : headers) {
                // Redact token in debug logs
                if (debug_) {
                    if (key == "Authorization") {
                        std::cout << "[HttpClient] Header: " << key << ": [REDACTED]" << std::endl;
                    } else {
                        std::cout << "[HttpClient] Header: " << key << ": " << value << std::endl;
                    }
                }

                std::string header_line = key + ": " + value;
                curl_headers = curl_slist_append(curl_headers, header_line.c_str());
            }

            if (curl_headers) {
                curl_easy_setopt(impl_->curl, CURLOPT_HTTPHEADER, curl_headers);
            }

            // Set callbacks
            std::string response_body;
            std::map<std::string, std::string> response_headers;

            curl_easy_setopt(impl_->curl, CURLOPT_WRITEFUNCTION, write_callback);
            curl_easy_setopt(impl_->curl, CURLOPT_WRITEDATA, &response_body);
            curl_easy_setopt(impl_->curl, CURLOPT_HEADERFUNCTION, header_callback);
            curl_easy_setopt(impl_->curl, CURLOPT_HEADERDATA, &response_headers);

            // Debug logging
            if (debug_) {
                std::cout << "[HttpClient] " << method << " " << url << std::endl;
                if (!body.empty()) {
                    std::cout << "[HttpClient] Body: " << body << std::endl;
                }
            }

            // Execute request
            CURLcode res = curl_easy_perform(impl_->curl);

            // Free headers
            if (curl_headers) {
                curl_slist_free_all(curl_headers);
            }

            auto end = std::chrono::steady_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

            // Check for CURL errors
            if (res != CURLE_OK) {
                std::string error_msg = "CURL error: ";
                error_msg += curl_easy_strerror(res);
                throw HttpClientError(error_msg);
            }

            // Get status code
            long status_code;
            curl_easy_getinfo(impl_->curl, CURLINFO_RESPONSE_CODE, &status_code);

            if (debug_) {
                std::cout << "[HttpClient] Status: " << status_code
                          << " (" << duration.count() << "ms)" << std::endl;
            }

            // Check if we should retry
            if (should_retry(static_cast<int>(status_code))) {
                std::ostringstream oss;
                oss << "HTTP " << status_code << ": " << response_body;
                last_error = HttpClientError(oss.str(), static_cast<int>(status_code));

                // Wait before retry
                if (attempt < MAX_RETRIES - 1) {
                    if (debug_) {
                        std::cout << "[HttpClient] Retrying in "
                                  << RETRY_DELAYS_MS[attempt] << "ms..." << std::endl;
                    }
                    std::this_thread::sleep_for(
                        std::chrono::milliseconds(RETRY_DELAYS_MS[attempt])
                    );
                    attempt++;
                    continue;
                }
            }

            // Build response
            HttpResponse response;
            response.status_code = static_cast<int>(status_code);
            response.body = response_body;
            response.headers = response_headers;
            response.duration = duration;

            // Check for error status codes
            if (status_code >= 400) {
                std::ostringstream oss;
                if (status_code == 401) {
                    oss << "Authentication failed - please login again";
                } else if (status_code == 403) {
                    oss << "Access denied - you don't have permission to access this resource";
                } else if (status_code == 404) {
                    oss << "Resource not found";
                } else if (status_code >= 500) {
                    oss << "Assumptions Manager server error - please try again later";
                } else {
                    oss << "HTTP " << status_code << ": " << response_body;
                }
                throw HttpClientError(oss.str(), static_cast<int>(status_code));
            }

            return response;

        } catch (const HttpClientError& e) {
            last_error = e;

            // If not retryable, throw immediately
            if (!should_retry(e.status_code())) {
                throw;
            }

            // Retry
            if (attempt < MAX_RETRIES - 1) {
                if (debug_) {
                    std::cout << "[HttpClient] Error: " << e.what()
                              << " - retrying in " << RETRY_DELAYS_MS[attempt] << "ms..." << std::endl;
                }
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(RETRY_DELAYS_MS[attempt])
                );
                attempt++;
            } else {
                throw;
            }
        }
    }

    // All retries exhausted
    throw last_error;
}

HttpResponse HttpClient::get(
    const std::string& path,
    const std::map<std::string, std::string>& headers)
{
    return execute_with_retry("GET", path, "", headers);
}

HttpResponse HttpClient::post(
    const std::string& path,
    const std::string& body,
    const std::map<std::string, std::string>& headers)
{
    return execute_with_retry("POST", path, body, headers);
}

} // namespace assumptions
} // namespace livecalc
