# S1 E1 Demo Seed Design

## Goal

Create a deterministic, idempotent demo dataset for isolated local and staging
databases without credentials, real PII, or production identifiers.

## Dataset

- One `Turni Demo` tenant, location, owner, dining agent, and widget connection.
- One synthetic guest and one two-message conversation.
- Versioned `venue.md` and `owner.md` knowledge files.
- The agent example explicitly discloses that it is an AI assistant.

## Rules

- Fixed UUIDv7 identifiers make repeated runs stable.
- Every insert uses `ON CONFLICT` and never overwrites user-edited demo content.
- Seed execution requires `DATABASE_URL` and an explicit `local` or `staging` target.
- No encrypted credentials, phone/email belonging to a person, or embeddings.
