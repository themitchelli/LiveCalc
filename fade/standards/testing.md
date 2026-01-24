# Testing Standard

Guidelines for writing effective tests. Apply these when creating or reviewing test code.

---

## Test Philosophy

Tests exist to catch bugs and enable confident refactoring. Write tests that:
- Catch real bugs, not implementation details
- Survive refactoring without changes
- Run fast enough to run often
- Fail with clear, actionable messages

---

## Test Pyramid

Maintain a healthy distribution of test types:

| Level | Proportion | Speed | What it Tests |
|-------|------------|-------|---------------|
| Unit | 70% | Fast (ms) | Single functions, pure logic |
| Integration | 20% | Medium (s) | Component interactions, DB, APIs |
| E2E | 10% | Slow (min) | Full user flows, critical paths |

**Apply:**
- Most tests should be unit tests (fast, focused)
- Integration tests for boundaries (DB, external APIs)
- E2E tests only for critical user journeys
- When a bug escapes to E2E, push the test down

---

## What to Test

### Test These
- Business logic and calculations
- Edge cases and boundary conditions
- Error handling and failure modes
- Public API contracts
- Complex conditionals

### Skip These
- Framework code (trust your tools)
- Simple getters/setters
- Type system guarantees
- Third-party library internals
- Implementation details (private methods)

```javascript
// Good - tests business rule
test('applies 10% discount for orders over $100', () => {
  const order = createOrder({ subtotal: 150 });
  expect(calculateDiscount(order)).toBe(15);
});

// Bad - tests implementation detail
test('calls discountService.calculate', () => {
  calculateDiscount(order);
  expect(discountService.calculate).toHaveBeenCalled();
});
```

---

## AAA Pattern

Structure every test with Arrange-Act-Assert:

```python
def test_user_can_update_own_profile():
    # Arrange - set up test data
    user = create_user(name="Alice")

    # Act - perform the action
    result = update_profile(user.id, {"name": "Alicia"})

    # Assert - verify the outcome
    assert result.name == "Alicia"
    assert User.find(user.id).name == "Alicia"
```

**Rules:**
- One Act per test (one action being tested)
- Keep Arrange minimal (use factories/fixtures)
- Assert behaviour, not implementation

---

## Test Naming

Names should describe the scenario and expected outcome:

```
// Pattern: [unit]_[scenario]_[expectedResult]
// or: "should [expected behaviour] when [condition]"

// Good
test('calculateTotal returns zero for empty cart')
test('should reject expired tokens')
test('user_login_fails_with_wrong_password')

// Bad
test('calculateTotal')
test('test1')
test('it works')
```

**Apply:**
- Read the name aloud—does it explain what's being tested?
- Include the condition that triggers the behaviour
- Be specific about the expected outcome

---

## Mocking Guidelines

Mock at boundaries, not internals.

### Mock These
- External HTTP calls
- Database (for unit tests)
- Time/dates
- Random number generators
- File system (when necessary)

### Don't Mock These
- The code under test
- Simple utility functions
- Data transformations

```typescript
// Good - mocks external boundary
const fetchUser = jest.spyOn(api, 'fetchUser').mockResolvedValue(mockUser);
const result = await userService.getProfile(userId);
expect(result.name).toBe(mockUser.name);

// Bad - mocks internal implementation
const validate = jest.spyOn(userService, 'validateId');
userService.getProfile(userId);
expect(validate).toHaveBeenCalled();  // Brittle
```

**Principle:** If you're mocking something you own, consider restructuring instead.

---

## Test Independence

Each test must run in isolation.

**Apply:**
- Tests can run in any order
- No shared mutable state between tests
- Each test sets up its own data
- Clean up after tests that use shared resources

```python
# Bad - depends on previous test
def test_create_user():
    global user_id
    user_id = create_user().id

def test_get_user():
    user = get_user(user_id)  # Depends on test_create_user

# Good - independent
def test_get_user():
    user = create_user()  # Creates own data
    result = get_user(user.id)
    assert result.id == user.id
```

---

## Coverage Requirements

Coverage is a tool, not a goal.

| Type | Minimum | Target |
|------|---------|--------|
| Unit | 70% | 80% |
| Integration | Key paths | Critical flows |
| E2E | Happy paths | Core journeys |

**Apply:**
- Cover all branches of business logic
- Don't chase 100%—diminishing returns
- Missing coverage should be intentional

**Red flags:**
- 100% coverage but bugs still ship (testing wrong things)
- Coverage exemptions everywhere
- Tests that only run code without asserting

---

## Quick Reference

| Principle | Guideline |
|-----------|-----------|
| Pyramid | 70% unit, 20% integration, 10% E2E |
| Structure | AAA: Arrange, Act, Assert |
| Naming | Describe scenario and expected outcome |
| Mocking | Mock boundaries, not internals |
| Independence | Each test runs in isolation |
| Coverage | 70-80% unit, focus on business logic |

---

## When to Read This Standard

Read this document when:
- Writing new tests
- Reviewing test code
- Debugging flaky tests
- Deciding what to test or skip
- Setting up test infrastructure
