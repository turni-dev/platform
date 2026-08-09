# Policy Rule Format Implementation Plan

Goal: make level-0 policy rules validated data rather than only hardcoded guards.

Scope:
- [x] Define a strict compiled rule schema and parser in the policy domain.
- [x] Create immutable locked seed rules for injection, allergy-health, money, and complaint-refund.
- [x] Adapt PolicyEngine to evaluate parsed seed rules while preserving default deny and rule precedence.
- [ ] Keep custom rules and database persistence out of this slice; no contracts or migrations change.
- [x] Cover malformed rules, locked precedence, and existing risk matrix behavior with tests in __tests__.
