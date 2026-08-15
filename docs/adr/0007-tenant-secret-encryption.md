# ADR 0007 — Tenant secret encryption

**Status:** accepted (2026-08-15)
**Context cards:** С2a [M1 Core] Шифрование tenant-секретов; consumed by the
Telegram BotFather and Google Calendar/Sheets cards.

## Context

Channel tokens and OAuth refresh credentials are tenant-scoped secrets that must
survive in Postgres without being readable from a database dump, a backup or a
replica. `channel_connections.credentials_enc` has existed since
`0003_channels.sql` but nothing ever wrote to it: there was no `createCipheriv`
in the repository at all. Both the Telegram and the Google card require encrypted
credentials, so the primitive is built once, before either.

Two things were already decided in the notes and are not revisited here: the
storage format `v1:iv:ct:tag` (`Схема БД — детально`) and AES-GCM with
per-purpose keys (`Безопасность и доверие`, A04). `KEY_CREDENTIALS_V1` is already
generated into `ops/sops/secrets.enc.json` by `tools/bootstrap/secret-bootstrap.mjs`.

## Decision

Application-level AES-256-GCM in `apps/backend/src/platform/crypto`, next to
`platform/database` and `platform/cache`. It crosses no external boundary, so it
is not a port in `packages/contracts` and needs no Fake adapter.

- **Per-purpose key rings.** `KEY_CREDENTIALS_V*` and `KEY_PHONE_V*` are separate
  rings; compromising one never reads the other. The version lives in the
  variable name, the newest key encrypts and every configured key still
  decrypts, so rotation is: add `KEY_CREDENTIALS_V2` to sops, deploy, re-encrypt
  at leisure, drop V1. No code change and no downtime.
- **The tenant and the purpose are authenticated data.** A ciphertext carries
  `{purpose}:{tenantId}` as GCM AAD, so a value moved into another tenant's row
  fails to decrypt rather than quietly working. FORCE RLS already prevents this
  in normal operation; AAD covers the paths that run outside it — a restore, a
  repair script, a future admin tool.
- **One refusal for every failure.** Wrong key, wrong tenant, unknown version,
  tampered segment and malformed input all raise the same
  `SecretDecryptionError` with no plaintext, no key material and no segment
  detail, so the error is safe to log and tells a prober nothing.
- **Keys fail on boot.** A missing or malformed key throws while the ring is
  built, not at the first secret, matching how `platform/env.ts` treats the rest
  of the configuration. The ring's `toJSON` hides its contents so key material
  cannot reach a log line through a serialized error.

## Consequences

- A tenant merge would require re-encryption, because AAD binds a value to its
  tenant. There is no tenant merge in MVP-1.
- Postgres never holds the key, so a stolen dump is useless; equally, losing the
  age identity loses every stored credential. The offline custody of the age key
  (card «SOPS custody», done) is therefore load-bearing for channels too.
- Encryption is application-level, so the database cannot index or search
  credentials. Nothing needs to.

## Alternatives rejected

- **`pgcrypto` in the database.** The key would live in the database or travel
  in every query, which defeats the point of protecting a dump.
- **A single key for all purposes.** Simpler, but one compromise would read both
  channel tokens and guest phone numbers; the security note asks for per-purpose
  keys explicitly.
- **Deriving a per-tenant key (HKDF over tenant id).** Stronger isolation, but
  rotation then multiplies by the number of tenants, and AAD already gives the
  cross-tenant guarantee we actually wanted.
