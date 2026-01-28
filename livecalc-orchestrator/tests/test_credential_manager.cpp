/**
 * @file test_credential_manager.cpp
 * @brief Unit tests for CredentialManager
 */

#include <catch2/catch_test_macros.hpp>
#include "../src/credential_manager.hpp"
#include <cstdlib>
#include <fstream>

using namespace livecalc;

// Helper to set environment variables
void set_env(const char* name, const char* value) {
#ifdef _WIN32
    _putenv_s(name, value);
#else
    setenv(name, value, 1);
#endif
}

// Helper to unset environment variables
void unset_env(const char* name) {
#ifdef _WIN32
    _putenv_s(name, "");
#else
    unsetenv(name);
#endif
}

TEST_CASE("CredentialManager - Explicit credentials", "[credential_manager]") {
    SECTION("Valid credentials via constructor") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp/cache");
        CredentialManager manager(creds);

        REQUIRE(manager.has_credentials());
        REQUIRE(manager.get_source() == CredentialSource::EXPLICIT);

        auto loaded = manager.get_credentials();
        REQUIRE(loaded.am_url == "https://am.example.com");
        REQUIRE(loaded.am_token == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature");
        REQUIRE(loaded.cache_dir == "/tmp/cache");
    }

    SECTION("Empty credentials") {
        AMCredentials empty;
        CredentialManager manager(empty);

        REQUIRE_FALSE(manager.has_credentials());
        REQUIRE(manager.get_source() == CredentialSource::EXPLICIT);
        REQUIRE_THROWS_AS(manager.get_credentials(), CalcEngineError);
    }
}

TEST_CASE("CredentialManager - Environment variables", "[credential_manager]") {
    // Clean up any existing env vars
    unset_env("LIVECALC_AM_URL");
    unset_env("LIVECALC_AM_TOKEN");
    unset_env("LIVECALC_AM_CACHE_DIR");

    SECTION("Load from environment") {
        set_env("LIVECALC_AM_URL", "https://am.env.com");
        set_env("LIVECALC_AM_TOKEN", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.env.token");
        set_env("LIVECALC_AM_CACHE_DIR", "/tmp/env_cache");

        CredentialManager manager;

        REQUIRE(manager.has_credentials());
        REQUIRE(manager.get_source() == CredentialSource::ENVIRONMENT);

        auto creds = manager.get_credentials();
        REQUIRE(creds.am_url == "https://am.env.com");
        REQUIRE(creds.am_token == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.env.token");
        REQUIRE(creds.cache_dir == "/tmp/env_cache");

        // Cleanup
        unset_env("LIVECALC_AM_URL");
        unset_env("LIVECALC_AM_TOKEN");
        unset_env("LIVECALC_AM_CACHE_DIR");
    }

    SECTION("Environment with default cache dir") {
        set_env("LIVECALC_AM_URL", "https://am.env.com");
        set_env("LIVECALC_AM_TOKEN", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.env.token");

        CredentialManager manager;

        REQUIRE(manager.has_credentials());
        auto creds = manager.get_credentials();
        REQUIRE_FALSE(creds.cache_dir.empty());

        // Cleanup
        unset_env("LIVECALC_AM_URL");
        unset_env("LIVECALC_AM_TOKEN");
    }

    SECTION("Missing environment variables") {
        unset_env("LIVECALC_AM_URL");
        unset_env("LIVECALC_AM_TOKEN");

        CredentialManager manager;

        REQUIRE_FALSE(manager.has_credentials());
        REQUIRE(manager.get_source() == CredentialSource::NONE);
    }
}

TEST_CASE("CredentialManager - Validation", "[credential_manager]") {
    SECTION("Valid JWT format") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        REQUIRE(manager.validate());
    }

    SECTION("Invalid JWT format - no dots") {
        AMCredentials creds("https://am.example.com", "invalid_token_no_dots", "/tmp");
        CredentialManager manager(creds);

        REQUIRE_FALSE(manager.validate());
    }

    SECTION("Invalid JWT format - one dot") {
        AMCredentials creds("https://am.example.com", "header.payload", "/tmp");
        CredentialManager manager(creds);

        REQUIRE_FALSE(manager.validate());
    }

    SECTION("Invalid URL format") {
        AMCredentials creds("not_a_url", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        REQUIRE_FALSE(manager.validate());
    }

    SECTION("Empty credentials") {
        CredentialManager manager;
        REQUIRE_FALSE(manager.validate());
    }
}

TEST_CASE("CredentialManager - Token masking", "[credential_manager]") {
    SECTION("Token masked in to_string") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        std::string str = manager.to_string();
        REQUIRE(str.find("eyJh...ture") != std::string::npos);  // First 4 and last 4 chars
        REQUIRE(str.find("payload") == std::string::npos);       // Middle part not shown
        REQUIRE(str.find("source=EXPLICIT") != std::string::npos);
        REQUIRE(str.find("url=https://am.example.com") != std::string::npos);
    }

    SECTION("Empty token") {
        AMCredentials creds("https://am.example.com", "", "/tmp");
        CredentialManager manager(creds);

        std::string str = manager.to_string();
        REQUIRE(str.find("<empty>") != std::string::npos);
    }

    SECTION("Short token") {
        AMCredentials creds("https://am.example.com", "short", "/tmp");
        CredentialManager manager(creds);

        std::string str = manager.to_string();
        REQUIRE(str.find("****") != std::string::npos);
    }
}

TEST_CASE("CredentialManager - Update and clear", "[credential_manager]") {
    SECTION("Update credentials") {
        AMCredentials initial("https://am1.example.com", "token1.payload.sig1", "/tmp1");
        CredentialManager manager(initial);

        REQUIRE(manager.get_credentials().am_url == "https://am1.example.com");

        AMCredentials updated("https://am2.example.com", "token2.payload.sig2", "/tmp2");
        manager.update_credentials(updated);

        REQUIRE(manager.get_credentials().am_url == "https://am2.example.com");
        REQUIRE(manager.get_credentials().am_token == "token2.payload.sig2");
    }

    SECTION("Clear credentials") {
        AMCredentials creds("https://am.example.com", "token.payload.sig", "/tmp");
        CredentialManager manager(creds);

        REQUIRE(manager.has_credentials());

        manager.clear();

        REQUIRE_FALSE(manager.has_credentials());
        REQUIRE(manager.get_source() == CredentialSource::NONE);
        REQUIRE_THROWS_AS(manager.get_credentials(), CalcEngineError);
    }
}

TEST_CASE("CredentialManager - Token info", "[credential_manager]") {
    SECTION("Token info available for valid JWT") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        auto token_info = manager.get_token_info();
        REQUIRE(token_info.has_value());
        REQUIRE(token_info->is_valid);
        REQUIRE(token_info->seconds_until_expiry() > 0);
    }

    SECTION("Token needs refresh check") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        auto token_info = manager.get_token_info();
        REQUIRE(token_info.has_value());

        // With default 1-hour expiry and 5-minute threshold, should not need refresh
        REQUIRE_FALSE(token_info->needs_refresh(5));

        // With 61-minute threshold, should need refresh
        REQUIRE(token_info->needs_refresh(61));
    }
}

TEST_CASE("CredentialManager - Refresh logic", "[credential_manager]") {
    SECTION("Refresh when token valid") {
        AMCredentials creds("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature", "/tmp");
        CredentialManager manager(creds);

        // Should succeed if token is still valid
        REQUIRE(manager.refresh_if_needed());
    }

    SECTION("Cannot refresh without credentials") {
        CredentialManager manager;
        REQUIRE_THROWS_AS(manager.refresh_if_needed(), CalcEngineError);
    }
}

TEST_CASE("CredentialManager - Error messages", "[credential_manager]") {
    SECTION("Clear error when no credentials") {
        CredentialManager manager;
        try {
            manager.get_credentials();
            FAIL("Should have thrown CalcEngineError");
        } catch (const CalcEngineError& e) {
            std::string msg = e.what();
            REQUIRE(msg.find("LIVECALC_AM_URL") != std::string::npos);
            REQUIRE(msg.find("LIVECALC_AM_TOKEN") != std::string::npos);
        }
    }
}
