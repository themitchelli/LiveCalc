#include "csv_reader.hpp"
#include <sstream>
#include <algorithm>

namespace livecalc {

CsvReader::CsvReader(std::istream& is, char delimiter)
    : is_(is), delimiter_(delimiter) {}

std::vector<std::string> CsvReader::read_row() {
    std::vector<std::string> row;
    std::string line;

    if (!std::getline(is_, line)) {
        return row;
    }

    std::stringstream ss(line);
    std::string cell;

    while (std::getline(ss, cell, delimiter_)) {
        row.push_back(trim(cell));
    }

    return row;
}

bool CsvReader::has_more() const {
    return is_.good() && is_.peek() != EOF;
}

std::string CsvReader::trim(const std::string& s) {
    auto start = std::find_if_not(s.begin(), s.end(), [](unsigned char c) {
        return std::isspace(c);
    });
    auto end = std::find_if_not(s.rbegin(), s.rend(), [](unsigned char c) {
        return std::isspace(c);
    }).base();

    return (start < end) ? std::string(start, end) : std::string();
}

} // namespace livecalc
