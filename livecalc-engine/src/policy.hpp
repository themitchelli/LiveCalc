#ifndef LIVECALC_POLICY_HPP
#define LIVECALC_POLICY_HPP

#include <cstdint>
#include <string>
#include <vector>
#include <map>
#include <istream>
#include <ostream>

namespace livecalc {

enum class Gender : uint8_t {
    Male = 0,
    Female = 1
};

enum class ProductType : uint8_t {
    Term = 0,
    WholeLife = 1,
    Endowment = 2
};

enum class UnderwritingClass : uint8_t {
    Standard = 0,
    Smoker = 1,
    NonSmoker = 2,
    Preferred = 3,
    Substandard = 4
};

struct Policy {
    uint64_t policy_id;  // Changed from uint32_t to support larger datasets
    uint8_t age;
    Gender gender;
    double sum_assured;
    double premium;
    uint8_t term;
    ProductType product_type;
    UnderwritingClass underwriting_class;
    std::map<std::string, std::string> attributes;  // Flexible attributes for extensibility

    bool operator==(const Policy& other) const;

    void serialize(std::ostream& os) const;
    static Policy deserialize(std::istream& is);

    // Note: serialized_size() is no longer constexpr due to variable-size attributes map
    // Use sizeof(Policy) for memory estimation (approximately 64 bytes with typical attributes)
    static size_t base_serialized_size() {
        return sizeof(uint64_t) +  // policy_id
               sizeof(uint8_t) +   // age
               sizeof(uint8_t) +   // gender
               sizeof(double) +    // sum_assured
               sizeof(double) +    // premium
               sizeof(uint8_t) +   // term
               sizeof(uint8_t) +   // product_type
               sizeof(uint8_t);    // underwriting_class
    }
};

class PolicySet {
public:
    void add(const Policy& policy);
    void add(Policy&& policy);

    const Policy& get(size_t index) const;
    size_t size() const;
    bool empty() const;

    const std::vector<Policy>& policies() const { return policies_; }
    std::vector<Policy>& policies() { return policies_; }

    void reserve(size_t count);
    void clear();

    static PolicySet load_from_csv(const std::string& filepath);
    static PolicySet load_from_csv(std::istream& is);

    static PolicySet load_from_parquet(const std::string& filepath);

    void serialize(std::ostream& os) const;
    static PolicySet deserialize(std::istream& is);

    static constexpr size_t bytes_per_policy() {
        return sizeof(Policy);
    }

    size_t memory_footprint() const {
        return sizeof(PolicySet) + policies_.capacity() * sizeof(Policy);
    }

private:
    std::vector<Policy> policies_;
};

} // namespace livecalc

#endif // LIVECALC_POLICY_HPP
