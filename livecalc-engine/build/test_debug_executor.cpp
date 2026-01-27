#include "../src/policy.hpp"
#include "../src/udf/udf_executor.hpp"
#include "../src/udf/udf_context.hpp"
#include <iostream>

using namespace livecalc;

int main() {
    // Create standard policy
    Policy p_std;
    p_std.policy_id = 1;
    p_std.age = 30;
    p_std.gender = Gender::Male;
    p_std.sum_assured = 100000;
    p_std.premium = 1000;
    p_std.term = 10;
    p_std.product_type = ProductType::Term;
    p_std.underwriting_class = UnderwritingClass::Standard;
    
    // Create smoker policy
    Policy p_smk = p_std;
    p_smk.underwriting_class = UnderwritingClass::Smoker;
    
    UDFExecutor exec("test_projection_smoker.py");
    UDFState state(1, 1.0, 0.05);
    
    double result_std = exec.call_udf("adjust_mortality", p_std, state, 1000);
    double result_smk = exec.call_udf("adjust_mortality", p_smk, state, 1000);
    
    std::cout << "Standard policy result: " << result_std << std::endl;
    std::cout << "Smoker policy result: " << result_smk << std::endl;
    std::cout << "Underwriting classes: std=" << static_cast<int>(p_std.underwriting_class) 
              << ", smk=" << static_cast<int>(p_smk.underwriting_class) << std::endl;
    
    return 0;
}
