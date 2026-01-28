# CMake generated Testfile for 
# Source directory: /Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator
# Build directory: /Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test([=[OrchestratorTests]=] "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/orchestrator_tests")
set_tests_properties([=[OrchestratorTests]=] PROPERTIES  _BACKTRACE_TRIPLES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/CMakeLists.txt;134;add_test;/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/CMakeLists.txt;0;")
subdirs("livecalc-engine")
