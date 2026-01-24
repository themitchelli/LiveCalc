# Coding Standard

Guidelines for writing clean, maintainable code. Apply these across all languages.

---

## Naming Conventions

Names should reveal intent. A reader should understand what something does from its name alone.

### Variables and Functions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase (JS/TS), snake_case (Python) | `userCount`, `user_count` |
| Functions | camelCase (JS/TS), snake_case (Python) | `calculateTotal()`, `calculate_total()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_TIMEOUT` |
| Classes | PascalCase | `UserService`, `OrderProcessor` |
| Booleans | Prefix with is/has/can/should | `isActive`, `hasPermission` |

### Naming Rules

**Do:**
- Use full words, not abbreviations (`customer` not `cust`)
- Name functions as verbs: `getUser()`, `validateInput()`, `sendEmail()`
- Name booleans as questions: `isValid`, `hasAccess`, `canEdit`
- Be consistent with project conventions

**Don't:**
- Use single letters except loop counters (`i`, `j`)
- Use Hungarian notation (`strName`, `intCount`)
- Use generic names (`data`, `info`, `temp`, `stuff`)

```javascript
// Bad
const d = getD();
const temp = process(d);

// Good
const orderDetails = getOrderDetails();
const formattedOrder = formatForDisplay(orderDetails);
```

---

## Function Guidelines

### Keep Functions Small

- **Target:** 20-30 lines maximum
- **One job:** Each function does one thing
- **One level of abstraction:** Don't mix high-level and low-level operations

```python
# Bad - does too much
def process_order(order):
    validate(order)
    tax = order.subtotal * 0.1
    total = order.subtotal + tax
    send_email(order.user.email, f"Total: {total}")
    db.save(order)
    log(f"Order processed: {order.id}")

# Good - separated concerns
def process_order(order):
    validate_order(order)
    order.total = calculate_total(order)
    save_order(order)
    notify_customer(order)
```

### Function Parameters

- **Maximum:** 3 parameters preferred, 4 acceptable
- **Too many?** Use an options object or refactor
- **Order:** Required first, optional last

```typescript
// Bad - too many params
function createUser(name, email, age, role, department, manager) {}

// Good - options object
function createUser(name: string, email: string, options?: UserOptions) {}
```

---

## File Organization

### File Length

- **Target:** 200-300 lines maximum
- **Too long?** Split into focused modules
- **Exception:** Test files can be longer

### File Structure

1. Imports (external, then internal)
2. Constants/types
3. Main exports
4. Helper functions (private)

```typescript
// 1. External imports
import { z } from 'zod';

// 2. Internal imports
import { db } from '../db';

// 3. Constants/types
const MAX_RETRIES = 3;
type UserRole = 'admin' | 'user';

// 4. Main exports
export function getUser(id: string) { ... }

// 5. Helpers (not exported)
function validateId(id: string) { ... }
```

---

## Error Handling

### Use Explicit Error Handling

- Check for errors at boundaries (API, DB, external services)
- Let errors propagate where appropriate
- Don't swallow errors silently

```python
# Bad - silent failure
def get_user(id):
    try:
        return db.find(id)
    except:
        return None  # Hides real errors

# Good - explicit handling
def get_user(id):
    try:
        return db.find(id)
    except DatabaseError as e:
        logger.error(f"DB error fetching user {id}: {e}")
        raise ServiceError("Unable to fetch user")
```

### Error Messages

- Include context: what failed, why, what to do
- Never expose internal details to users
- Log details server-side, return safe messages to clients

---

## Comments

### When to Comment

**Do comment:**
- Why, not what (the code shows what)
- Complex algorithms or business rules
- Workarounds with links to issues
- Public API documentation

**Don't comment:**
- Obvious code (`i++; // increment i`)
- Commented-out code (delete it)
- TODOs without context or owners

```javascript
// Bad - states the obvious
// Get the user by ID
const user = getUser(id);

// Good - explains why
// Use legacy endpoint until v2 migration complete (PROJ-123)
const user = legacyGetUser(id);
```

### Self-Documenting Code

Prefer clear code over comments:

```python
# Bad - needs comment to explain
# Check if user can access resource
if user.role == 'admin' or (user.role == 'member' and resource.owner == user.id):

# Good - self-documenting
if user.can_access(resource):
```

---

## Language-Specific Rules

### JavaScript/TypeScript
- Use `const` by default, `let` when reassignment needed
- Prefer arrow functions for callbacks
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Python
- Follow PEP 8
- Use type hints for function signatures
- Prefer list/dict comprehensions for simple transformations

### General
- Follow the language's official style guide
- Use the project's linter configuration
- Match existing code style in the file

---

## Quick Reference

| Principle | Guideline |
|-----------|-----------|
| Naming | Reveal intent, be consistent |
| Functions | Small (20-30 lines), one job each |
| Files | 200-300 lines max, focused modules |
| Parameters | 3 preferred, use options object if more |
| Errors | Explicit handling, meaningful messages |
| Comments | Explain why, not what |

---

## When to Read This Standard

Read this document when:
- Writing new code
- Reviewing code for style and maintainability
- Refactoring existing code
- Onboarding to a new codebase
