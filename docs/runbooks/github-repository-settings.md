# GitHub Repository Settings Runbook

Use this runbook for manual GitHub administration of `turni-dev/platform`.

## Current Decision

- Prefer manual GitHub UI changes over API mutation scripts.
- Keep deploy secrets disabled until the VPS, restricted deploy user, known host, and `turni-deploy` command exist.
- If the repository is private, GitHub may require a paid plan for branch protection and environment reviewers.

## Branch Protection

Open GitHub:

1. Go to `turni-dev/platform`.
2. Open `Settings` -> `Branches`.
3. Add or edit a branch protection rule for `main`.
4. Enable `Require status checks to pass before merging`.
5. Enable `Require branches to be up to date before merging`.
6. Add required status check: `verify`.
7. Enable `Require conversation resolution before merging`.
8. Enable `Require linear history`.
9. Enable `Do not allow bypassing the above settings` if available for administrators.
10. Ensure force pushes are disabled.
11. Ensure deletions are disabled.

Expected result:

- `main` cannot be merged unless `verify` is green.
- Force push and branch deletion are blocked.

## Actions Permissions

Open:

1. `Settings` -> `Actions` -> `General`.
2. Under `Actions permissions`, select `Allow enterprise, and select non-enterprise, actions and reusable workflows`.
3. Allow GitHub-created actions.
4. Allow verified creators.
5. Do not add broad wildcard allow patterns.
6. Under `Workflow permissions`, select `Read repository contents permission`.
7. Disable `Allow GitHub Actions to create and approve pull requests`.

Expected result:

- `GITHUB_TOKEN` is read-only by default.
- Workflows cannot approve PRs.
- Third-party actions stay constrained to GitHub-owned or verified actions.

## Environments

Open:

1. `Settings` -> `Environments`.
2. Create or edit `staging`.
3. Set deployment branches to `Protected branches only`.
4. Create or edit `production`.
5. Set deployment branches to `Protected branches only`.
6. Add required reviewer `RudinMaxim` for `production` if the current GitHub plan supports it.

Expected result:

- Only protected branches can deploy to `staging` or `production`.
- Production deployment needs manual approval when supported by the plan.

## Do Not Configure Yet

Do not add staging deploy secrets until the VPS work is done:

- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_PRIVATE_KEY`
- `STAGING_SSH_KNOWN_HOSTS`
- repository variable `STAGING_DEPLOY_ENABLED=true`

Leave `STAGING_DEPLOY_ENABLED` unset or false until the restricted deploy path exists.

## Manual Verification

After changing settings:

1. Open `Settings` -> `Branches` and confirm `main` shows `verify` as required.
2. Open `Settings` -> `Actions` -> `General` and confirm workflow permissions are read-only.
3. Open `Settings` -> `Environments` and confirm `staging` and `production` use protected branches only.
4. Confirm production has `RudinMaxim` as required reviewer if available.
