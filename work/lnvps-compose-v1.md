# lnvps-compose v1

**Status:** in-progress
**Started:** 2026-07-29
**Last updated:** 2026-07-29

## Goal

One shared TypeScript package for the compose grammar, replacing web's
`src/utils/app-compose.ts` and admin's `src/lib/composeSchema.ts`, so the
public deploy form, the admin catalog editor's pricing preview, and the
operator's own rendering produce the same number for the same compose.
(`LNVPS/web#83`.)

## Findings

- Rust source of truth: `lnvps_compose/src/lib.rs` in `LNVPS/api`, ~2665
  lines. Its `Compose::parse` = `serde_yaml::from_str` (structural) +
  `.validate()` (business rules, ~260 lines: port `expose`/`protocol`
  combinations, volume label length, scratch path bounds/overlap,
  `depends_on` references, file content-source/overlap, backup
  command|volume, init container name/image/injection/user, secret byte
  range, config pattern compilation). These are two genuinely separate
  passes in the Rust code, not one — `validate()` is not called anywhere
  inside `parse()`'s own call graph beyond what `parse()` itself invokes.
- `resolve_env`, `resolve_files`, `resolve_init`, `validate_declarations`,
  `validate_volume_changes`, `addresses_host` are explicitly out of scope for
  this package per the issue — operator/admission-time logic, not rendering.
- `VolumeInfo`/`Compose::volumes()` (per-volume label breakdown) is also out
  of scope: that's server-computed and already served by the API
  (`LNVPS/api#260`), not something a frontend should re-derive from compose —
  consistent with the standing rule against reconstructing catalog/product
  data client-side.
- Both existing parsers (web's `app-compose.ts`, admin's `composeSchema.ts`)
  are lenient — never throw, degrade to empty/zero on anything unparseable.
  That's right for a live pricing/form preview while a compose is still being
  edited, and wrong for gatekeeping what an admin actually saves. v1 keeps
  both postures, on two different functions, rather than picking one:
  `parseCompose` is strict (throws, matches Rust's deserialize step exactly,
  used for authoring); `parseComposeSchema`/`parseComposeFootprint` stay
  lenient (used for rendering/preview).
- No existing private npm registry or npm-workspace linking `web`/`admin`/
  `api` — this package installs as a git dependency
  (`"lnvps-compose": "github:LNVPS/lnvps-compose#<tag>"`), no publish
  credentials needed. Its own `prepare` script builds `dist/` on install.
- This is XL by `agents/common.md`'s own sizing rule (types + strict parse +
  full `validate()` + two repo integrations is well over 750 lines), hence
  this file.

## Tasks

- [x] Repo scaffolded: package.json, tsconfig, CI (typecheck/test/build),
      `agents` submodule, this work file.
- [x] Types ported: `Compose`, `Service`, `Port`, `Volume`, `Scratch`,
      `File`, `InitContainer`, `Backup`, `Resources`, `SecretDecl`,
      `ConfigField`, `Footprint`, `ServiceFootprint`, and their enums
      (`src/types.ts`).
- [x] `parseCpuMilli`, `parseQuantityBytes` — strict, Rust-parity quantity
      parsing (`src/quantities.ts`).
- [x] `parseCompose` — structural parse (required fields, types, enum
      validity, defaults), **not yet `validate()`** (`src/parse.ts`).
- [x] `parseComposeSchema` (`src/schema.ts`) and `parseComposeFootprint`
      (`src/footprint.ts`) — lenient, replacing both existing parsers'
      current behaviour.
- [x] Tests: route96 fixture (`test/fixtures.ts`, byte-for-byte from
      `LNVPS/api`'s `docs/managed-app-examples.md`) parsed and its footprint
      asserted; quantity edge cases; structural-parse error cases; 100%
      function coverage (`bun test --coverage`).
- [ ] Tag `v0.1.0` once this PR is reviewed.
- [ ] Port `Compose::validate()` (the business rules listed above) as
      `parseCompose`'s second pass, or a separate `validateCompose` — decide
      which when picking this up. Own PR; this is the largest remaining
      increment.
- [ ] `LNVPS/web`: replace `src/utils/app-compose.ts` (`parseAppConfig`,
      `defaultConfigValues`) with `lnvps-compose`'s `parseComposeSchema` +
      `configFieldDisplayLabel`. Own PR.
- [ ] `LNVPS/admin`: replace `src/lib/composeSchema.ts` with `lnvps-compose`.
      Note for whoever picks this up: admin's current `ComposeConfigField`
      resolves `label` to a non-optional string at parse time; this
      package's `ConfigField.label` is optional, matching Rust — call
      `configFieldDisplayLabel(field)` at render sites instead of reading
      `.label` directly. Own PR.

## Notes

- Package name `lnvps-compose` (not `@lnvps/compose`) — no registry scope to
  reserve since nothing is published to one.
- Not creating a shared npm/workspace monorepo across `web`/`admin`/`api` —
  out of scope for this issue and a bigger call than one PR should make.
