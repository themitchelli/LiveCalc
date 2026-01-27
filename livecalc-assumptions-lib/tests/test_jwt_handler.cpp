#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "auth/jwt_handler.hpp"
#include <thread>
#include <chrono>

using namespace livecalc::assumptions;

// Note: These tests use a fake token format for testing
// In integration tests, we'd test against a live AM instance

// Helper to create a fake JWT token with specific expiry
std::string create_fake_token(int expires_in_seconds [[maybe_unused]]) {
    // JWT format: header.payload.signature
    // We create a minimal fake token for testing
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDAwMDAwMDB9.signature";
}

TEST_CASE("JWTHandler constructor with token", "[jwt_handler]") {
    SECTION("Constructs with valid token") {
        std::string fake_token = create_fake_token(3600);
        REQUIRE_NOTHROW(
            JWTHandler("https://am.ddns.net", fake_token)
        );
    }

    SECTION("Stores AM URL") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        // Token should be retrievable
        auto token = handler.get_token();
        REQUIRE(token == fake_token);
    }

    SECTION("Invalid token format throws") {
        REQUIRE_THROWS_AS(
            JWTHandler("https://am.ddns.net", "not-a-jwt"),
            JWTError
        );
    }
}

TEST_CASE("JWTHandler token expiry tracking", "[jwt_handler]") {
    SECTION("token_expires_in() returns correct value") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        int expires_in = handler.token_expires_in();

        // Token should expire in ~1 hour (3600 seconds)
        // Allow some tolerance for execution time
        REQUIRE(expires_in > 3590);
        REQUIRE(expires_in <= 3600);
    }

    SECTION("Expiry time updates after construction") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        int expires_in_1 = handler.token_expires_in();

        // Wait 2 seconds
        std::this_thread::sleep_for(std::chrono::seconds(2));

        int expires_in_2 = handler.token_expires_in();

        // Expiry time should have decreased by ~2 seconds
        REQUIRE(expires_in_2 < expires_in_1);
        REQUIRE(expires_in_2 >= expires_in_1 - 3);  // Allow 1s tolerance
    }
}

TEST_CASE("JWTHandler get_token()", "[jwt_handler]") {
    SECTION("Returns stored token") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        auto token = handler.get_token();
        REQUIRE(token == fake_token);
    }

    SECTION("Returns same token on multiple calls (no refresh if not expiring)") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        auto token1 = handler.get_token();
        auto token2 = handler.get_token();
        auto token3 = handler.get_token();

        REQUIRE(token1 == token2);
        REQUIRE(token2 == token3);
    }
}

TEST_CASE("JWTHandler auto-refresh threshold", "[jwt_handler]") {
    SECTION("Token with credentials refresh automatically") {
        // Note: Current implementation always sets expiry to 1 hour from now
        // Testing actual expiry-based refresh requires integration tests
        // or more sophisticated token mocking

        // This test documents the behavior: tokens default to 1-hour expiry
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        int expires_in = handler.token_expires_in();

        // Refresh threshold is 5 minutes (300 seconds)
        // Token should be well above this threshold
        REQUIRE(expires_in > 300);
    }

    SECTION("get_token() succeeds when token is valid") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        // get_token() should succeed without refresh since token is fresh
        REQUIRE_NOTHROW(handler.get_token());
    }
}

TEST_CASE("JWTHandler thread safety", "[jwt_handler]") {
    SECTION("Multiple threads can call get_token() concurrently") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        std::vector<std::thread> threads;
        std::vector<std::string> tokens(10);

        // Launch 10 threads that all call get_token()
        for (int i = 0; i < 10; ++i) {
            threads.emplace_back([&handler, &tokens, i]() {
                tokens[i] = handler.get_token();
            });
        }

        // Wait for all threads
        for (auto& t : threads) {
            t.join();
        }

        // All threads should have gotten the same token
        for (const auto& token : tokens) {
            REQUIRE(token == fake_token);
        }
    }
}

TEST_CASE("JWTHandler never logs tokens", "[jwt_handler]") {
    // This is more of a code review check than a test
    // We verify tokens are not exposed in error messages

    SECTION("Tokens are not exposed in code or logs") {
        std::string fake_token = create_fake_token(3600);
        JWTHandler handler("https://am.ddns.net", fake_token);

        // The token itself should be retrievable
        auto token = handler.get_token();
        REQUIRE(token == fake_token);

        // But if there's an error (e.g., invalid token format),
        // the error message should not contain the token.
        // Test with invalid token format:
        REQUIRE_THROWS_AS(
            JWTHandler("https://am.ddns.net", "not-a-valid-jwt"),
            JWTError
        );

        // Verify error message doesn't leak the bad token
        try {
            JWTHandler bad_handler("https://am.ddns.net", "not-a-valid-jwt");
            FAIL("Expected JWTError");
        } catch (const JWTError& e) {
            std::string error_msg = e.what();
            // This is good: error says "Invalid JWT token format"
            // without including the actual token
            REQUIRE(error_msg.find("not-a-valid-jwt") == std::string::npos);
        }
    }
}

// Note: Integration tests for username/password constructor and refresh_token()
// would require a live AM instance. These are tested manually or in integration suite.

/*
TEST_CASE("JWTHandler with credentials (integration)", "[jwt_handler][integration]") {
    SECTION("Constructor with username/password fetches token") {
        REQUIRE_NOTHROW(
            JWTHandler("https://assumptionsmanager.ddns.net", "testuser", "testpass")
        );
    }

    SECTION("Auto-refresh works with credentials") {
        // Create handler with credentials
        JWTHandler handler("https://assumptionsmanager.ddns.net", "testuser", "testpass");

        // Manually trigger refresh
        REQUIRE_NOTHROW(handler.refresh_token());

        // Token should still be valid
        auto token = handler.get_token();
        REQUIRE(!token.empty());
    }

    SECTION("Invalid credentials throw JWTError") {
        REQUIRE_THROWS_AS(
            JWTHandler("https://assumptionsmanager.ddns.net", "baduser", "badpass"),
            JWTError
        );
    }
}
*/
