#ifndef LIVECALC_CSV_READER_HPP
#define LIVECALC_CSV_READER_HPP

#include <string>
#include <vector>
#include <istream>

namespace livecalc {

class CsvReader {
public:
    explicit CsvReader(std::istream& is, char delimiter = ',');

    std::vector<std::string> read_row();
    bool has_more() const;

private:
    std::istream& is_;
    char delimiter_;

    static std::string trim(const std::string& s);
};

} // namespace livecalc

#endif // LIVECALC_CSV_READER_HPP
