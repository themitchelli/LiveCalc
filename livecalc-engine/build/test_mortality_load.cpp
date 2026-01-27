#include "../src/assumptions.hpp"
#include <iostream>

using namespace livecalc;

int main() {
    MortalityTable mt;
    mt.load_from_csv("../data/sample_mortality.csv");
    
    for (int age = 28; age <= 32; age++) {
        double qx_male = mt.get_qx(age, Gender::Male);
        double qx_female = mt.get_qx(age, Gender::Female);
        std::cout << "Age " << age << ": Male=" << qx_male << ", Female=" << qx_female << std::endl;
    }
    
    return 0;
}
