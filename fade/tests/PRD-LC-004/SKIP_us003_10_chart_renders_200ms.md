# SKIP: Chart renders in <200ms for 10K scenarios
## AC: Chart renders in <200ms for 10K scenarios

### Reason for Skip
This acceptance criterion requires runtime performance testing with actual data, which cannot be verified through static code analysis or shell scripts. It requires:
1. A running VS Code instance with the extension loaded
2. Loading 10,000 actual scenario NPV values
3. Measuring render time in milliseconds
4. The Chart.js library executing in the webview context

### What Can Be Verified
The code does use `animation: false` to disable Chart.js animations, which helps render performance. This can be verified statically, but the actual 200ms requirement requires integration testing.

### Recommendation
Create an integration test in the VS Code extension test suite that:
1. Mocks or loads 10K scenario values
2. Calls updateChart()
3. Measures render time
4. Asserts < 200ms
