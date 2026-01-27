#include <catch2/catch_test_macros.hpp>
#include <sstream>
#include "policy.hpp"

using namespace livecalc;

TEST_CASE("Policy struct contains required fields", "[policy]") {
    Policy p;
    p.policy_id = 12345;
    p.age = 35;
    p.gender = Gender::Male;
    p.sum_assured = 100000.0;
    p.premium = 500.0;
    p.term = 20;
    p.product_type = ProductType::Term;
    p.underwriting_class = UnderwritingClass::Smoker;
    p.attributes["health_rating"] = "A1";
    p.attributes["occupation"] = "engineer";

    REQUIRE(p.policy_id == 12345);
    REQUIRE(p.age == 35);
    REQUIRE(p.gender == Gender::Male);
    REQUIRE(p.sum_assured == 100000.0);
    REQUIRE(p.premium == 500.0);
    REQUIRE(p.term == 20);
    REQUIRE(p.product_type == ProductType::Term);
    REQUIRE(p.underwriting_class == UnderwritingClass::Smoker);
    REQUIRE(p.attributes.at("health_rating") == "A1");
    REQUIRE(p.attributes.at("occupation") == "engineer");
}

TEST_CASE("Policy equality comparison", "[policy]") {
    Policy p1{1, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment, UnderwritingClass::Standard, {}};
    Policy p2{1, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment, UnderwritingClass::Standard, {}};
    Policy p3{2, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment, UnderwritingClass::Standard, {}};

    p1.attributes["test"] = "value";
    p2.attributes["test"] = "value";

    REQUIRE(p1 == p2);
    REQUIRE_FALSE(p1 == p3);
}

TEST_CASE("Policy binary serialization round-trip", "[policy][serialization]") {
    Policy original{
        42,                      // policy_id
        45,                      // age
        Gender::Female,          // gender
        250000.0,                // sum_assured
        1200.50,                 // premium
        30,                      // term
        ProductType::WholeLife,  // product_type
        UnderwritingClass::NonSmoker,  // underwriting_class
        {}                       // attributes (added later)
    };
    original.attributes["health"] = "excellent";
    original.attributes["occupation_risk"] = "low";

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    Policy loaded = Policy::deserialize(ss);

    REQUIRE(original == loaded);
    REQUIRE(loaded.attributes.size() == 2);
    REQUIRE(loaded.attributes.at("health") == "excellent");
    REQUIRE(loaded.attributes.at("occupation_risk") == "low");
}

TEST_CASE("Policy base serialized size is correct", "[policy][serialization]") {
    Policy p{1, 25, Gender::Male, 100000.0, 500.0, 20, ProductType::Term, UnderwritingClass::Standard, {}};

    std::stringstream ss;
    p.serialize(ss);

    // Base size: 8 (policy_id) + 1 (age) + 1 (gender) + 8 (sum_assured) + 8 (premium) + 1 (term) + 1 (product_type) + 1 (underwriting_class) + 4 (attr_count)
    size_t expected_base_size = Policy::base_serialized_size() + sizeof(uint32_t);  // +4 for attribute count
    REQUIRE(ss.str().size() == expected_base_size);
    REQUIRE(Policy::base_serialized_size() == 29);  // 8 + 1 + 1 + 8 + 8 + 1 + 1 + 1
}

TEST_CASE("Policy with attributes serialization", "[policy][serialization]") {
    Policy p{100, 30, Gender::Female, 150000.0, 650.0, 25, ProductType::Endowment, UnderwritingClass::Preferred, {}};
    p.attributes["health_score"] = "95";
    p.attributes["occupation"] = "actuary";

    std::stringstream ss;
    p.serialize(ss);

    ss.seekg(0);
    Policy loaded = Policy::deserialize(ss);

    REQUIRE(loaded == p);
    REQUIRE(loaded.attributes.size() == 2);
    REQUIRE(loaded.attributes.at("health_score") == "95");
    REQUIRE(loaded.attributes.at("occupation") == "actuary");
}

TEST_CASE("PolicySet basic operations", "[policy]") {
    PolicySet ps;
    REQUIRE(ps.empty());
    REQUIRE(ps.size() == 0);

    Policy p1{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term, UnderwritingClass::Standard, {}};
    Policy p2{2, 40, Gender::Female, 200000.0, 800.0, 25, ProductType::WholeLife, UnderwritingClass::Smoker, {}};

    ps.add(p1);
    REQUIRE(ps.size() == 1);
    REQUIRE_FALSE(ps.empty());

    ps.add(p2);
    REQUIRE(ps.size() == 2);

    REQUIRE(ps.get(0) == p1);
    REQUIRE(ps.get(1) == p2);
}

TEST_CASE("PolicySet throws on invalid index", "[policy]") {
    PolicySet ps;
    REQUIRE_THROWS_AS(ps.get(0), std::out_of_range);

    ps.add(Policy{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term, UnderwritingClass::Standard, {}});
    REQUIRE_THROWS_AS(ps.get(1), std::out_of_range);
}

TEST_CASE("PolicySet supports 100,000+ policies", "[policy][capacity]") {
    PolicySet ps;
    ps.reserve(100000);

    for (uint64_t i = 0; i < 100000; ++i) {
        ps.add(Policy{
            i,
            static_cast<uint8_t>(25 + (i % 50)),
            static_cast<Gender>(i % 2),
            50000.0 + (i % 10) * 50000.0,
            200.0 + (i % 20) * 50.0,
            static_cast<uint8_t>(10 + (i % 21)),
            static_cast<ProductType>(i % 3),
            static_cast<UnderwritingClass>(i % 5), {}
        });
    }

    REQUIRE(ps.size() == 100000);
    REQUIRE(ps.get(99999).policy_id == 99999);
}

TEST_CASE("PolicySet load from CSV", "[policy][csv]") {
    std::stringstream csv;
    csv << "policy_id,age,gender,sum_assured,premium,term,product_type,underwriting_class,health_rating\n";
    csv << "1,30,M,100000,500,20,Term,Standard,A\n";
    csv << "2,45,Female,250000,1200.50,30,WholeLife,Smoker,B\n";
    csv << "3,28,F,75000,350,15,Endowment,NonSmoker,A+\n";

    PolicySet ps = PolicySet::load_from_csv(csv);

    REQUIRE(ps.size() == 3);

    REQUIRE(ps.get(0).policy_id == 1);
    REQUIRE(ps.get(0).age == 30);
    REQUIRE(ps.get(0).gender == Gender::Male);
    REQUIRE(ps.get(0).sum_assured == 100000.0);
    REQUIRE(ps.get(0).premium == 500.0);
    REQUIRE(ps.get(0).term == 20);
    REQUIRE(ps.get(0).product_type == ProductType::Term);
    REQUIRE(ps.get(0).underwriting_class == UnderwritingClass::Standard);
    REQUIRE(ps.get(0).attributes.at("health_rating") == "A");

    REQUIRE(ps.get(1).policy_id == 2);
    REQUIRE(ps.get(1).age == 45);
    REQUIRE(ps.get(1).gender == Gender::Female);
    REQUIRE(ps.get(1).sum_assured == 250000.0);
    REQUIRE(ps.get(1).premium == 1200.50);
    REQUIRE(ps.get(1).term == 30);
    REQUIRE(ps.get(1).product_type == ProductType::WholeLife);
    REQUIRE(ps.get(1).underwriting_class == UnderwritingClass::Smoker);
    REQUIRE(ps.get(1).attributes.at("health_rating") == "B");

    REQUIRE(ps.get(2).policy_id == 3);
    REQUIRE(ps.get(2).gender == Gender::Female);
    REQUIRE(ps.get(2).product_type == ProductType::Endowment);
    REQUIRE(ps.get(2).underwriting_class == UnderwritingClass::NonSmoker);
    REQUIRE(ps.get(2).attributes.at("health_rating") == "A+");
}

TEST_CASE("PolicySet binary serialization round-trip", "[policy][serialization]") {
    PolicySet original;
    original.add(Policy{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term, UnderwritingClass::Standard, {}});
    original.add(Policy{2, 45, Gender::Female, 250000.0, 1200.50, 30, ProductType::WholeLife, UnderwritingClass::Smoker, {}});
    original.add(Policy{3, 28, Gender::Female, 75000.0, 350.0, 15, ProductType::Endowment, UnderwritingClass::NonSmoker, {}});

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    PolicySet loaded = PolicySet::deserialize(ss);

    REQUIRE(loaded.size() == original.size());
    for (size_t i = 0; i < original.size(); ++i) {
        REQUIRE(loaded.get(i) == original.get(i));
    }
}

TEST_CASE("PolicySet supports 1,000,000 policies", "[policy][capacity][1M]") {
    PolicySet ps;
    ps.reserve(1000000);

    // Add 1M policies - this validates memory capacity requirement
    for (uint64_t i = 0; i < 1000000; ++i) {
        ps.add(Policy{
            i,
            static_cast<uint8_t>(25 + (i % 50)),
            static_cast<Gender>(i % 2),
            50000.0 + (i % 10) * 50000.0,
            200.0 + (i % 20) * 50.0,
            static_cast<uint8_t>(10 + (i % 21)),
            static_cast<ProductType>(i % 3),
            static_cast<UnderwritingClass>(i % 5), {}
        });
    }

    REQUIRE(ps.size() == 1000000);
    REQUIRE(ps.get(0).policy_id == 0);
    REQUIRE(ps.get(999999).policy_id == 999999);

    // Memory footprint check - should be approximately 64 bytes per policy
    size_t footprint = ps.memory_footprint();
    size_t bytes_per_policy = footprint / ps.size();
    REQUIRE(bytes_per_policy >= 32);  // At least 32 bytes (base struct size)
    REQUIRE(bytes_per_policy <= 128); // At most 128 bytes (with padding and overhead)
}

TEST_CASE("PolicySet memory footprint calculation", "[policy][memory]") {
    PolicySet ps;

    size_t base_footprint = ps.memory_footprint();
    REQUIRE(base_footprint >= sizeof(PolicySet));

    ps.reserve(1000);
    size_t reserved_footprint = ps.memory_footprint();
    REQUIRE(reserved_footprint >= base_footprint + 1000 * sizeof(Policy));

    REQUIRE(PolicySet::bytes_per_policy() == sizeof(Policy));
}

TEST_CASE("Empty CSV returns empty PolicySet", "[policy][csv]") {
    std::stringstream csv;
    PolicySet ps = PolicySet::load_from_csv(csv);
    REQUIRE(ps.empty());
}

TEST_CASE("CSV with only header returns empty PolicySet", "[policy][csv]") {
    std::stringstream csv;
    csv << "policy_id,age,gender,sum_assured,premium,term,product_type,underwriting_class\n";
    PolicySet ps = PolicySet::load_from_csv(csv);
    REQUIRE(ps.empty());
}
