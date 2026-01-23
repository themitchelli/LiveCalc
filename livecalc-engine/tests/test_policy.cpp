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

    REQUIRE(p.policy_id == 12345);
    REQUIRE(p.age == 35);
    REQUIRE(p.gender == Gender::Male);
    REQUIRE(p.sum_assured == 100000.0);
    REQUIRE(p.premium == 500.0);
    REQUIRE(p.term == 20);
    REQUIRE(p.product_type == ProductType::Term);
}

TEST_CASE("Policy equality comparison", "[policy]") {
    Policy p1{1, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment};
    Policy p2{1, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment};
    Policy p3{2, 30, Gender::Female, 50000.0, 250.0, 15, ProductType::Endowment};

    REQUIRE(p1 == p2);
    REQUIRE_FALSE(p1 == p3);
}

TEST_CASE("Policy binary serialization round-trip", "[policy][serialization]") {
    Policy original{
        42,                    // policy_id
        45,                    // age
        Gender::Female,        // gender
        250000.0,             // sum_assured
        1200.50,              // premium
        30,                   // term
        ProductType::WholeLife // product_type
    };

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    Policy loaded = Policy::deserialize(ss);

    REQUIRE(original == loaded);
}

TEST_CASE("Policy serialized size is correct", "[policy][serialization]") {
    Policy p{1, 25, Gender::Male, 100000.0, 500.0, 20, ProductType::Term};

    std::stringstream ss;
    p.serialize(ss);

    REQUIRE(ss.str().size() == Policy::serialized_size());
    REQUIRE(Policy::serialized_size() == 24);  // 4 + 1 + 1 + 8 + 8 + 1 + 1
}

TEST_CASE("PolicySet basic operations", "[policy]") {
    PolicySet ps;
    REQUIRE(ps.empty());
    REQUIRE(ps.size() == 0);

    Policy p1{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term};
    Policy p2{2, 40, Gender::Female, 200000.0, 800.0, 25, ProductType::WholeLife};

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

    ps.add(Policy{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term});
    REQUIRE_THROWS_AS(ps.get(1), std::out_of_range);
}

TEST_CASE("PolicySet supports 100,000+ policies", "[policy][capacity]") {
    PolicySet ps;
    ps.reserve(100000);

    for (uint32_t i = 0; i < 100000; ++i) {
        ps.add(Policy{
            i,
            static_cast<uint8_t>(25 + (i % 50)),
            static_cast<Gender>(i % 2),
            50000.0 + (i % 10) * 50000.0,
            200.0 + (i % 20) * 50.0,
            static_cast<uint8_t>(10 + (i % 21)),
            static_cast<ProductType>(i % 3)
        });
    }

    REQUIRE(ps.size() == 100000);
    REQUIRE(ps.get(99999).policy_id == 99999);
}

TEST_CASE("PolicySet load from CSV", "[policy][csv]") {
    std::stringstream csv;
    csv << "policy_id,age,gender,sum_assured,premium,term,product_type\n";
    csv << "1,30,M,100000,500,20,Term\n";
    csv << "2,45,Female,250000,1200.50,30,WholeLife\n";
    csv << "3,28,F,75000,350,15,Endowment\n";

    PolicySet ps = PolicySet::load_from_csv(csv);

    REQUIRE(ps.size() == 3);

    REQUIRE(ps.get(0).policy_id == 1);
    REQUIRE(ps.get(0).age == 30);
    REQUIRE(ps.get(0).gender == Gender::Male);
    REQUIRE(ps.get(0).sum_assured == 100000.0);
    REQUIRE(ps.get(0).premium == 500.0);
    REQUIRE(ps.get(0).term == 20);
    REQUIRE(ps.get(0).product_type == ProductType::Term);

    REQUIRE(ps.get(1).policy_id == 2);
    REQUIRE(ps.get(1).age == 45);
    REQUIRE(ps.get(1).gender == Gender::Female);
    REQUIRE(ps.get(1).sum_assured == 250000.0);
    REQUIRE(ps.get(1).premium == 1200.50);
    REQUIRE(ps.get(1).term == 30);
    REQUIRE(ps.get(1).product_type == ProductType::WholeLife);

    REQUIRE(ps.get(2).policy_id == 3);
    REQUIRE(ps.get(2).gender == Gender::Female);
    REQUIRE(ps.get(2).product_type == ProductType::Endowment);
}

TEST_CASE("PolicySet binary serialization round-trip", "[policy][serialization]") {
    PolicySet original;
    original.add(Policy{1, 30, Gender::Male, 100000.0, 500.0, 20, ProductType::Term});
    original.add(Policy{2, 45, Gender::Female, 250000.0, 1200.50, 30, ProductType::WholeLife});
    original.add(Policy{3, 28, Gender::Female, 75000.0, 350.0, 15, ProductType::Endowment});

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    PolicySet loaded = PolicySet::deserialize(ss);

    REQUIRE(loaded.size() == original.size());
    for (size_t i = 0; i < original.size(); ++i) {
        REQUIRE(loaded.get(i) == original.get(i));
    }
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
    csv << "policy_id,age,gender,sum_assured,premium,term,product_type\n";
    PolicySet ps = PolicySet::load_from_csv(csv);
    REQUIRE(ps.empty());
}
