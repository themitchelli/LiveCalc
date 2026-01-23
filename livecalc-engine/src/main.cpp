#include <iostream>
#include "policy.hpp"

int main() {
    std::cout << "LiveCalc Engine v1.0.0" << std::endl;
    std::cout << "Policy size: " << sizeof(livecalc::Policy) << " bytes" << std::endl;
    std::cout << "Serialized size: " << livecalc::Policy::serialized_size() << " bytes" << std::endl;
    return 0;
}
