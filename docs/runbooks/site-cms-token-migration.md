# Site CMS Token Migration Runbook

Covers replacing the site's single full-access CMS token with two narrow
ones, and moving `CMS_WRITE_TOKEN`, `CMS_ENCRYPTION_KEY` and the corp-mail
SMTP password from a plaintext `site.env` into sops/age.

Source: `docs/context/task-board.md`, card "Секреты сайта в sops и узкие
API-токены CMS" (mini-spec `site-secrets`). Related: `apps/cms/README.md`
(exact Strapi permissions for each token), `ops/sops/README.md` (sops/age
setup), `apps/core-site/src/config/cms-env.ts` (Zod env boundary),
`apps/core-site/src/anti-abuse/idempotency.ts` (why the write token needs no
read permission).

## Why

The site previously reached the CMS with either one full-access token, or a
read token and a write token that was still broader than it needed to be
(the write path issued a `GET /api/leads?filters[idempotencyKey]=...` to
check for duplicates, which requires `find` on `lead`). A leaked write token
must not let anyone read another visitor's submission. This migration:

1. Splits the token into `CMS_READ_TOKEN` (pages/settings/nav/catalog/slot
   availability only) and `CMS_WRITE_TOKEN` (create-only on lead/feedback,
   plus slot reservation).
2. Removes the CMS read from the write path — duplicate-submission
   pre-checking now runs against a process-local key store
   (`InMemoryIdempotencyKeyStore`); the CMS's own unique-index violation on
   `idempotencyKey` remains the actual race-safety net.
3. Moves `CMS_WRITE_TOKEN`, `CMS_ENCRYPTION_KEY` and the SMTP password into
   sops/age instead of a plaintext `site.env` on the host.

## 1. Create the two narrow tokens in Strapi admin

Strapi API tokens are admin-database records with no declarative/code-level
definition available in this Strapi version — this step is manual, done once
per environment. In `https://cms.<env>/admin` → **Settings → API Tokens**:

- Create `site-read` — type **Custom**, permissions per
  `apps/cms/README.md` (`page`/`site-setting`/navigation/`integration`
  find+findOne, `booking-slot.available`). No write permissions anywhere.
- Create `site-lead-write` — type **Custom**, permissions per
  `apps/cms/README.md` (`lead.create`, `feedback.create` once it exists,
  `booking-slot.reserve`). No `find`/`findOne` on `lead`/`feedback`, no
  `booking-slot.available`/`release`.

Copy each token value immediately — Strapi shows it once.

Verify the write token cannot read (see `apps/cms/README.md` for the exact
`curl` check); a `200` there means the admin permissions were set wrong and
must be fixed before continuing.

## 2. Put the new secrets into sops

On the machine holding the age identity (see `ops/sops/README.md`):

```bash
sops --decrypt ops/sops/secrets.enc.json > /tmp/secrets.json   # inspect only, never commit plaintext
# add/update the site keys in the decrypted document, e.g.:
#   "SITE_CMS_READ_TOKEN": "<site-read token>",
#   "SITE_CMS_WRITE_TOKEN": "<site-lead-write token>",
#   "SITE_CMS_ENCRYPTION_KEY": "<32-byte base64 key, same as deployed>",
#   "SITE_SMTP_PASSWORD": "<rotated reg.ru mail password — see step 4>"
sops --encrypt --age <recipient> --input-type json --output-type json /tmp/secrets.json > ops/sops/secrets.enc.json
shred -u /tmp/secrets.json   # or securely delete on non-Linux
git add ops/sops/secrets.enc.json
git commit -m "chore(secrets): rotate site CMS tokens and SMTP password"
```

`ops/sops/secrets.enc.json` currently only holds the backend's
`tools/bootstrap/secret-bootstrap.mjs` keys (`KEY_PHONE_V1`,
`KEY_CREDENTIALS_V1`, `PEPPER_V1`, `WEBHOOK_ROUTING_SECRET`). Adding the site
keys to the same file keeps one custody chain instead of two; a
`SITE_`-prefixed name avoids colliding with any backend key of a similar
shape. Only the encrypted file is committed — never the decrypted JSON.

## 3. Deploy: decrypt into the site's environment

On the deploy host, the secret manager (or a deploy-time step) decrypts
`ops/sops/secrets.enc.json` and exports the values as the plain env vars
`compose.site.yml` expects — `CMS_READ_TOKEN`, `CMS_WRITE_TOKEN`,
`CMS_ENCRYPTION_KEY`, `SITE_SMTP_PASSWORD` — into `/srv/turni/config/site.env`
(mode `0600`, outside git, per `docs/runbooks/dev-vps-operations.md`). Do not
hand-edit the plaintext value into `site.env` from a chat message or ticket —
it must come from `sops --decrypt` only.

```bash
cd /srv/turni/platform
docker compose --project-name turni-site \
  --env-file ../config/site.env \
  -f compose.site.yml \
  -f ops/compose/dev-vps/site.yml \
  up -d --force-recreate cms core-site
```

## 4. Retire the old full-access token, and the exposed mail password

- In Strapi admin, delete the old full-access token once `CMS_READ_TOKEN`
  and `CMS_WRITE_TOKEN` are confirmed working (check `docker compose logs
  core-site` for CMS `401`s, and submit one test lead through the form).
- **TODO (owner action, not automatable from here):** the reg.ru corp-mail
  password (`hello@turni.ru` / `SITE_SMTP_PASSWORD`) was pasted into chat
  and must be treated as compromised. The repository owner must rotate it
  directly in the reg.ru mail control panel, then re-run step 2 to put the
  new value into sops. Do not attempt to rotate it from this runbook or any
  automated agent — it requires the reg.ru account holder's credentials,
  which this repository does not have.

## Traps

- Never commit `site.env` or any decrypted secrets file — only
  `ops/sops/secrets.enc.json` belongs in git.
- The write token must have zero read permission on `lead`/`feedback`, not
  "read only its own rows" — Strapi's permission model is collection-wide,
  it cannot scope `find` to "rows this token created".
- Because the write path no longer pre-checks the CMS for duplicates, a
  resubmission that lands on a different site instance than the original
  attempt is caught only by the CMS unique-index violation, not by the local
  store. This is intentional (see `apps/core-site/src/anti-abuse/idempotency.ts`)
  and matches the existing multi-instance caveat already documented for
  `InMemoryRateLimiter`.
