# lnvps-compose

TypeScript types and a parser for the LNVPS managed-app **compose** YAML —
the grammar the catalog stores each app as (`services:`, `secrets:`,
`config:`). Shared by [`LNVPS/web`](https://github.com/LNVPS/web) (the public
deploy form and deployment pages) and
[`LNVPS/admin`](https://github.com/LNVPS/admin) (the catalog editor and its
pricing preview), so both render the same numbers for the same compose
instead of maintaining two drifting parsers.

The Rust source of truth is the `lnvps_compose` crate in
[`LNVPS/api`](https://github.com/LNVPS/api/tree/main/lnvps_compose). This
package mirrors its types and the parts of its behaviour described below —
see [`work/lnvps-compose-v1.md`](work/lnvps-compose-v1.md) for what is not
yet ported and why.

## Install

No package registry — installed as a git dependency:

```json
{
  "dependencies": {
    "lnvps-compose": "github:LNVPS/lnvps-compose#v0.1.0"
  }
}
```

`dist/` is committed, built from `src/` — git-dependency installs are
inconsistent about running a package's own build script (bun blocks the
`prepare` script for git deps unless the consumer opts in with
`trustedDependencies`; Yarn Berry's git fetch has been observed keeping only
`package.json`/`README.md` of the checkout, `src/` included, independent of
whether scripts run at all). Shipping the built output directly needs no
cooperation from either. `bun run verify-dist` in CI fails the build if
`dist/` doesn't match `src/`, so this can't drift silently.

## API

```ts
import {
  parseCompose,
  parseComposeSchema,
  parseComposeFootprint,
  parseCpuMilli,
  parseQuantityBytes,
} from "lnvps-compose";
```

- **`parseCompose(yaml: string): Compose`** — the full typed document.
  Throws on any shape the Rust source's `serde_yaml` deserialization would
  also reject: a missing required field, a value of the wrong type, an enum
  value the grammar doesn't define. **Does not yet run the Rust source's
  `validate()`** (the business rules — port `expose`/`protocol` combinations,
  volume/scratch path overlap, `depends_on` references, secret byte ranges,
  config pattern compilation, and so on) — a document this function accepts
  can still be rejected by the real API. Use this where getting it wrong
  matters most: an admin authoring or editing a catalog app.

- **`parseComposeSchema(yaml: string): { config, secrets }`** — the deploy
  form's field list. Deliberately lenient: an unparseable document, or one
  missing either key, returns empty lists rather than throwing. Replaces
  web's `parseAppConfig` and admin's `parseComposeSchema`.

- **`parseComposeFootprint(yaml: string): { total, services }`** — resource
  footprint, matching `Compose::footprint`/`service_footprints`: CPU/memory
  summed across services (an `init:` step counted only when it asks for more
  than its service's own container) plus the sizes of every declared volume.
  Also lenient — an unparseable quantity contributes zero rather than failing
  the whole computation. Used to price an app while its compose is still
  being edited, before the server has computed the real number.

- **`parseCpuMilli`, `parseQuantityBytes`** — the Kubernetes-style quantity
  parsers both of the above are built on (`"500m"` → 500, `"5Gi"` → bytes).
  These are strict and throw on a string the Rust source would also reject —
  the lenient functions above catch that themselves; a caller that wants
  Rust-exact parsing reaches for these directly.

All exported types (`Compose`, `Service`, `Port`, `Volume`, `Scratch`,
`File`, `InitContainer`, `Backup`, `Resources`, `SecretDecl`, `ConfigField`,
the `Footprint`/`ServiceFootprint` pair, and their enums) are in
[`src/types.ts`](src/types.ts), field-for-field against the Rust structs.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
```

`dist/` is committed (see Install, above) — run `bun run build` and commit
the result alongside any `src/` change. `bun run verify-dist` (also CI) fails
if they've drifted.
