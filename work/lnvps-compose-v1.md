# lnvps-compose v1

**Status:** in-progress
**Started:** 2026-07-29
**Last updated:** 2026-07-29 (validate() ported and shipped as LNVPS/lnvps-compose#2, two review rounds)

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
  credentials needed.
- Git-dependency installs cannot be trusted to run this package's own build
  step, and the failure differs by package manager rather than repeating:
  bun blocks `prepare` for git deps unless the consumer opts in with
  `trustedDependencies` (web#88) — the checkout is otherwise complete, only
  the script is refused. Wiring this into `LNVPS/admin` (Yarn Berry, PnP)
  surfaced a second, worse failure: the fetched package kept only
  `package.json`/`README.md` — `src/` itself never arrived, independent of
  script permissions, so there was nothing to build from either way. `dist/`
  is now committed (`f78e3ba`/`v0.1.1`) so a consumer gets working output
  from the git checkout regardless of what its package manager does with
  lifecycle scripts. `bun run verify-dist` (CI) fails if `src/` and the
  committed `dist/` disagree — rebuild and commit `dist/` with any `src/`
  change.
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
- [x] Tag `v0.1.0` once this PR is reviewed. (Also `v0.1.1`/`v0.1.2` since,
      per the `dist/` commit decision below.)
- [x] Port `Compose::validate()` as a separate `validateCompose` function
      (`src/validate.ts`), called from `parseCompose`'s strict pass only.
      Same rule set as the Rust source (expose/protocol, volume label
      length, scratch bounds/overlap, `depends_on`, file content-source/
      overlap, backup command|volume, init name/image/injection/user, secret
      byte range, config pattern compilation), same error shape/messages
      where practical. `MAX_VOLUME_LABEL_LEN`/`MAX_SCRATCH_BYTES`/
      `MIN_SECRET_BYTES`/`MAX_SECRET_BYTES`/`MAX_PATTERN_LEN` exported from
      `types.ts` (mirrors the Rust consts' `pub` visibility); `MAX_FILE_BYTES`
      and the path/regex/user helpers stay module-private (mirrors the Rust
      side's non-`pub` items). 61 new tests in `test/validate.test.ts`
      (100% function coverage); updated `parse.test.ts`'s "no services" case,
      which the structural-only parser previously accepted. Branch
      `feat/validate-business-rules`, worktree `work/validate-business-rules`.
      Committed `62b8b73`, PR https://github.com/LNVPS/lnvps-compose/pull/2.
      Review (Goran) found two real Rust-parity gaps, fixed in a follow-up
      commit on the same branch: `userUid` had no upper bound (a uid string
      overflowing Rust's i64 parsed to the nearest float and was accepted;
      Rust's `parse::<i64>()` overflow is `Err` → `None` → rejected — now
      gated on `Number.isSafeInteger`), and `compilePattern` accepted
      backreferences/lookaround that compile in JS `RegExp` but not in the
      backtracking-free Rust `regex` crate (rejected by substring/escape-aware
      check before the `RegExp` compile attempt). Second review round
      (verified against the pinned `regex-syntax 0.8.11` source in
      `~/.cargo/registry`, not just the review comment) found the first pass
      of that fix over-rejected: `regex` has supported `(?<name>…)` named
      groups since 1.9 (`ast/parse.rs`'s `parse_group` takes `?P<` and `?<`
      on the same branch) — only `(?<=…)`/`(?<!…)` are lookbehind
      (`is_lookaround_prefix`), so the check now matches those two spellings,
      not the bare `(?<` prefix. The backreference scan also flagged an
      escaped literal backslash (`\\1` — escaped-backslash-then-digit, two
      tokens, not one) as if it were a backreference (`\1`, one token);
      `hasUnescapedBackreference` now walks escape pairs instead of scanning
      for backslash-next-to-digit.
      One porting note: `label.chars().count()` (Rust) became `[...l].length`
      (codepoint count, not UTF-16 length) for the volume label bound;
      `.len()` (byte count) on the pattern/file-content/init-name bounds
      became a hand-rolled `utf8ByteLength` rather than `TextEncoder`, since
      `tsconfig.build.json` compiles with no ambient `types` and doesn't see
      it. `compile_pattern`'s regex-compiles check uses JS `RegExp` rather
      than reproducing the Rust `regex` crate's engine — practical parity
      (catches an author's non-compiling pattern), not a byte-for-byte
      engine match.
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
