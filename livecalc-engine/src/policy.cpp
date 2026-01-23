#include "policy.hpp"
#include "io/csv_reader.hpp"
#include <fstream>
#include <stdexcept>

namespace livecalc {

bool Policy::operator==(const Policy& other) const {
    return policy_id == other.policy_id &&
           age == other.age &&
           gender == other.gender &&
           sum_assured == other.sum_assured &&
           premium == other.premium &&
           term == other.term &&
           product_type == other.product_type;
}

void Policy::serialize(std::ostream& os) const {
    os.write(reinterpret_cast<const char*>(&policy_id), sizeof(policy_id));
    os.write(reinterpret_cast<const char*>(&age), sizeof(age));
    uint8_t gender_val = static_cast<uint8_t>(gender);
    os.write(reinterpret_cast<const char*>(&gender_val), sizeof(gender_val));
    os.write(reinterpret_cast<const char*>(&sum_assured), sizeof(sum_assured));
    os.write(reinterpret_cast<const char*>(&premium), sizeof(premium));
    os.write(reinterpret_cast<const char*>(&term), sizeof(term));
    uint8_t product_val = static_cast<uint8_t>(product_type);
    os.write(reinterpret_cast<const char*>(&product_val), sizeof(product_val));
}

Policy Policy::deserialize(std::istream& is) {
    Policy p;
    is.read(reinterpret_cast<char*>(&p.policy_id), sizeof(p.policy_id));
    is.read(reinterpret_cast<char*>(&p.age), sizeof(p.age));
    uint8_t gender_val;
    is.read(reinterpret_cast<char*>(&gender_val), sizeof(gender_val));
    p.gender = static_cast<Gender>(gender_val);
    is.read(reinterpret_cast<char*>(&p.sum_assured), sizeof(p.sum_assured));
    is.read(reinterpret_cast<char*>(&p.premium), sizeof(p.premium));
    is.read(reinterpret_cast<char*>(&p.term), sizeof(p.term));
    uint8_t product_val;
    is.read(reinterpret_cast<char*>(&product_val), sizeof(product_val));
    p.product_type = static_cast<ProductType>(product_val);

    if (!is) {
        throw std::runtime_error("Failed to deserialize Policy");
    }
    return p;
}

void PolicySet::add(const Policy& policy) {
    policies_.push_back(policy);
}

void PolicySet::add(Policy&& policy) {
    policies_.push_back(std::move(policy));
}

const Policy& PolicySet::get(size_t index) const {
    if (index >= policies_.size()) {
        throw std::out_of_range("Policy index out of range");
    }
    return policies_[index];
}

size_t PolicySet::size() const {
    return policies_.size();
}

bool PolicySet::empty() const {
    return policies_.empty();
}

void PolicySet::reserve(size_t count) {
    policies_.reserve(count);
}

void PolicySet::clear() {
    policies_.clear();
}

PolicySet PolicySet::load_from_csv(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file) {
        throw std::runtime_error("Cannot open file: " + filepath);
    }
    return load_from_csv(file);
}

PolicySet PolicySet::load_from_csv(std::istream& is) {
    PolicySet ps;
    CsvReader reader(is);

    auto header = reader.read_row();
    if (header.empty()) {
        return ps;
    }

    while (reader.has_more()) {
        auto row = reader.read_row();
        if (row.size() < 7) {
            continue;
        }

        Policy p;
        p.policy_id = static_cast<uint32_t>(std::stoul(row[0]));
        p.age = static_cast<uint8_t>(std::stoi(row[1]));

        std::string gender_str = row[2];
        if (gender_str == "M" || gender_str == "Male" || gender_str == "0") {
            p.gender = Gender::Male;
        } else {
            p.gender = Gender::Female;
        }

        p.sum_assured = std::stod(row[3]);
        p.premium = std::stod(row[4]);
        p.term = static_cast<uint8_t>(std::stoi(row[5]));

        std::string product_str = row[6];
        if (product_str == "Term" || product_str == "0") {
            p.product_type = ProductType::Term;
        } else if (product_str == "WholeLife" || product_str == "1") {
            p.product_type = ProductType::WholeLife;
        } else {
            p.product_type = ProductType::Endowment;
        }

        ps.add(std::move(p));
    }

    return ps;
}

void PolicySet::serialize(std::ostream& os) const {
    uint32_t count = static_cast<uint32_t>(policies_.size());
    os.write(reinterpret_cast<const char*>(&count), sizeof(count));
    for (const auto& p : policies_) {
        p.serialize(os);
    }
}

PolicySet PolicySet::deserialize(std::istream& is) {
    PolicySet ps;
    uint32_t count;
    is.read(reinterpret_cast<char*>(&count), sizeof(count));
    if (!is) {
        throw std::runtime_error("Failed to read PolicySet count");
    }
    ps.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
        ps.add(Policy::deserialize(is));
    }
    return ps;
}

} // namespace livecalc
