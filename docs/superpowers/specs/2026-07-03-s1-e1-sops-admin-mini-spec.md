# S1 E1 SOPS Admin Mini-Spec

- Goal: establish a recoverable age identity and commit only SOPS-encrypted application data keys.
- Input: official `age` and `sops` CLIs plus the existing secret bootstrap script.
- Output: one private identity outside the repository and `ops/sops/secrets.enc.json` encrypted for its public recipient.
- Criteria: encrypted JSON contains no plaintext values, decrypts with the admin identity, and bootstrap tests remain green.
- Traps: never print or commit the private identity or decrypted values; local copies do not count as the two required offline backups.
