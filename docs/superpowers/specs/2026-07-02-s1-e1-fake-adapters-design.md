# S1 E1 Fake Adapters Design

## Goal

Provide deterministic in-memory adapters for every external port so localhost,
unit tests, and contract suites run without network access or credentials.

## Rules

- Validate inputs and outputs with the same public Zod contracts as real adapters.
- Use deterministic counters, never random or wall-clock identifiers.
- Expose recorded calls as read-only data for assertions.
- Support configured LLM structured output and fail on schema mismatch.
- Fake payments resolve as paid, matching the project port specification.
- No sleeps, retries, environment reads, or vendor types.
