# Site API tokens: read vs lead-write

The public site (`apps/core-site`) never uses one full-access CMS token. It
holds two narrow ones, each created by hand in **Settings → API Tokens** in
the Strapi admin (Strapi API tokens are an admin-only, database-backed
resource with no declarative/code-level way to define them as of this
Strapi version — there is nothing to check into git here beyond this
README). Both are provisioned through sops/age, never committed as
plaintext — see `ops/sops/README.md` and
`docs/runbooks/site-cms-token-migration.md` for the rotation procedure.

## `site-read` → env `CMS_READ_TOKEN`

- Token type: **Custom**, duration **Unlimited**.
- Permissions: **read-only** —
  - `page`: `find`, `findOne`
  - `site-setting`: `find`
  - `navigation` (nav plugin, if separately scoped): `find`
  - `booking-slot`: `available` (the custom "which slots are open" action)
  - `integration`: `find`, `findOne`
- Do **not** grant `create`, `update`, `delete`, or any action on `lead` (or
  `feedback`, once that content type exists) to this token. A leaked
  `site-read` token must never let anyone write to the CMS.

## `site-lead-write` → env `CMS_WRITE_TOKEN`

- Token type: **Custom**, duration **Unlimited**.
- Permissions: **write-only, create-only** —
  - `lead`: `create` only
  - `feedback` (once it ships): `create` only
  - `booking-slot`: `reserve` only (the custom atomic-reservation action)
- Do **not** grant `find`/`findOne` on `lead` (or `feedback`) to this token,
  and do not grant `available`/`release` on `booking-slot`. A leaked
  `site-lead-write` token must not be able to read any visitor's submission
  or any other visitor's booking — only create its own. The site's own
  duplicate-submission check does not depend on reading the CMS: it uses a
  process-local key store plus the CMS's own unique-index violation on
  `idempotencyKey` (see `apps/core-site/src/anti-abuse/idempotency.ts`).

## Checking the split

After creating both tokens, verify with `curl` that `site-lead-write` is
refused on a read:

```
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $CMS_WRITE_TOKEN" \
  http://localhost:1337/api/leads
```

A `403` (or `401`) confirms the write token has no read permission. `200`
means the token was over-scoped in the admin and must be fixed before it is
used anywhere.

---

# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
