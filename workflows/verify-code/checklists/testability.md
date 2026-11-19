# Testability Assessment

[Back to main workflow](../WORKFLOW.md)

Evaluate whether the implementation is structured so its `feature.gherkin` scenarios can test it. The scenarios are the single acceptance layer, so testability means scenario steps can drive and observe the behavior through injectable seams, not that a second layer of tests exists.

---

## Seam Readiness

These checks apply to step definitions and the production seams they drive.

- [ ] Production seams take their dependencies by injection (constructor injection, DI container, provider overrides), so step definitions can substitute fakes
- [ ] Pure functions for business logic (deterministic, no side effects)
- [ ] No hidden side effects (global state, singletons without reset)
- [ ] Async operations awaitable from step definitions
- [ ] Time-dependent logic uses an injectable clock/time source that step definitions control

### Mock Patterns

Step definitions should be able to substitute dependencies:

```
// Pseudocode — dependency injection enables mocking

// Production
service = new UserService(realDatabase, realEmailClient)

// Step definition
service = new UserService(fakeDatabase, fakeEmailClient)
```

## Environment Readiness

- [ ] Database/storage can be reset between scenarios
- [ ] External services mockable (HTTP interceptors, fake servers)
- [ ] Test fixtures available for common data
- [ ] Environment isolation (test config separate from production)

## Scenario Readiness

- [ ] Feature files exist with valid Gherkin syntax
- [ ] Step definitions implemented for all scenarios
- [ ] Scenarios are independent (no shared mutable state)
- [ ] Test data setup is declarative and repeatable

## Test Organization

- [ ] Tests colocated with source OR in dedicated test directory
- [ ] Clear test naming (describe what, not how)
- [ ] AAA pattern (Arrange-Act-Assert) or Given-When-Then
- [ ] Setup/teardown properly managed (no leaked state)
- [ ] Test utilities shared and maintainable

## Anti-Patterns

- [ ] No hard-coded dates/times in production seams (use injectable clock)
- [ ] No scenarios that depend on execution order
- [ ] No scenario steps that require uncontrolled network access
- [ ] No scenario steps with excessive mocking (testing implementation, not behavior)
- [ ] No flaky scenarios (random failures, timing dependencies)
- [ ] No tests that restate a scenario's acceptance criterion

---

## Scoring Guide

| Score | Description |
|-------|-------------|
| 1 | Hard-coded dependencies, no tests possible |
| 2 | Some scenarios implemented, seams difficult to substitute |
| 3 | Testable design, some ACs lack implemented scenarios |
| 4 | Injectable seams, every AC's scenario implemented |
| 5 | Injectable seams and clock, every AC's scenario implemented and passing, no duplicate tests |
