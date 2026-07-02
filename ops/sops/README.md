# SOPS And Age Secrets

Only SOPS-encrypted `*.enc.json` files belong in Git. Private age identities and
decrypted files must stay outside the repository.

## Initial Setup

1. Install `age`, `age-keygen`, and `sops` from their official distributions.
2. Generate the age identity on an offline/admin machine, outside this repo:
   `age-keygen -o turni-production.agekey`.
3. Record the public `age1...` recipient printed by `age-keygen`.
4. Run `npm run secrets:init -- <age-recipient>` once.
5. Review and commit only `ops/sops/secrets.enc.json`.

The bootstrap creates independent 256-bit values for `KEY_PHONE_V1`,
`KEY_CREDENTIALS_V1`, and `PEPPER_V1`. It refuses to overwrite an existing
encrypted file.

## Offline Backup

- Keep two encrypted/offline copies of the private age identity with separate
  custodians. Never upload it to GitHub, CI artifacts, chat, or a password field
  that is exported with application data.
- Record who holds each copy and the key fingerprint in the private operations
  register.
- Quarterly, restore one copy on an isolated machine and verify that
  `sops --decrypt ops/sops/secrets.enc.json` succeeds without exposing output in
  logs or shell history.
- Rotation creates `*_V2`; background re-encryption completes before `*_V1` is
  retired.
