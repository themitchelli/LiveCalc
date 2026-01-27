#include "auth/jwt_handler.hpp"
#include "api/http_client.hpp"
#include <nlohmann/json.hpp>
#include <sstream>
#include <cstring>
#include <ctime>
#include <mutex>

using json = nlohmann::json;

namespace livecalc {
namespace assumptions {

// Base64 decode helper
static std::string base64_decode(const std::string& encoded) {
    // Simplified base64 decode for JWT payload
    // Full implementation would use a library
    // For now, we'll parse expiry from the token differently
    return encoded;
}

struct JWTHandler::Impl {
    std::unique_ptr<HttpClient> http_client;
    std::mutex mutex;
};

JWTHandler::JWTHandler(const std::string& am_url,
                       const std::string& username,
                       const std::string& password)
    : impl_(std::make_unique<Impl>())
    , am_url_(am_url)
    , username_(username)
    , password_(password)
    , has_credentials_(true)
{
    impl_->http_client = std::make_unique<HttpClient>(am_url);
    fetch_token();
}

JWTHandler::JWTHandler(const std::string& am_url, const std::string& token)
    : impl_(std::make_unique<Impl>())
    , am_url_(am_url)
    , token_(token)
    , has_credentials_(false)
{
    impl_->http_client = std::make_unique<HttpClient>(am_url);
    parse_token_expiry();
}

JWTHandler::~JWTHandler() = default;

void JWTHandler::fetch_token() {
    std::lock_guard<std::mutex> lock(impl_->mutex);

    // Build login request
    json login_body = {
        {"username", username_},
        {"password", password_}
    };

    try {
        // POST to login endpoint
        auto response = impl_->http_client->post(
            "/api/v1/auth/login",
            login_body.dump(),
            {}
        );

        // Parse response
        auto response_json = json::parse(response.body);

        if (!response_json.contains("token")) {
            throw JWTError("Login response missing token");
        }

        token_ = response_json["token"].get<std::string>();
        parse_token_expiry();

    } catch (const HttpClientError& e) {
        std::ostringstream oss;
        oss << "Failed to fetch JWT token: " << e.what();
        throw JWTError(oss.str());
    } catch (const json::exception& e) {
        std::ostringstream oss;
        oss << "Failed to parse login response: " << e.what();
        throw JWTError(oss.str());
    }
}

void JWTHandler::parse_token_expiry() {
    // JWT format: header.payload.signature
    // Payload is base64-encoded JSON with "exp" field (Unix timestamp)

    size_t first_dot = token_.find('.');
    size_t second_dot = token_.find('.', first_dot + 1);

    if (first_dot == std::string::npos || second_dot == std::string::npos) {
        throw JWTError("Invalid JWT token format");
    }

    std::string payload_encoded = token_.substr(first_dot + 1, second_dot - first_dot - 1);

    // Base64 decode (simplified - in production use a proper library)
    // For now, we'll set a default expiry of 1 hour from now
    // In a real implementation, we'd decode the payload and extract "exp"
    expiry_time_ = std::chrono::system_clock::now() + std::chrono::hours(1);
}

std::string JWTHandler::get_token() {
    std::lock_guard<std::mutex> lock(impl_->mutex);

    // Check if token needs refresh
    int expires_in = token_expires_in();
    if (expires_in < REFRESH_THRESHOLD_SECONDS) {
        if (!has_credentials_) {
            throw JWTError("Token expiring but no credentials available for refresh");
        }
        refresh_token();
    }

    return token_;
}

int JWTHandler::token_expires_in() const {
    auto now = std::chrono::system_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::seconds>(
        expiry_time_ - now
    );
    return static_cast<int>(duration.count());
}

void JWTHandler::refresh_token() {
    // Note: mutex must already be locked by caller

    if (!has_credentials_) {
        throw JWTError("Cannot refresh token without credentials");
    }

    // Re-fetch token using credentials
    json login_body = {
        {"username", username_},
        {"password", password_}
    };

    try {
        auto response = impl_->http_client->post(
            "/api/v1/auth/login",
            login_body.dump(),
            {}
        );

        auto response_json = json::parse(response.body);

        if (!response_json.contains("token")) {
            throw JWTError("Refresh response missing token");
        }

        token_ = response_json["token"].get<std::string>();
        parse_token_expiry();

    } catch (const HttpClientError& e) {
        std::ostringstream oss;
        oss << "Failed to refresh JWT token: " << e.what();
        throw JWTError(oss.str());
    } catch (const json::exception& e) {
        std::ostringstream oss;
        oss << "Failed to parse refresh response: " << e.what();
        throw JWTError(oss.str());
    }
}

} // namespace assumptions
} // namespace livecalc
