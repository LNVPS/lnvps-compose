# AGENTS.md - Coding Agent Guidelines for lnvps-compose

This file is an index. Load only the specific doc(s) relevant to your task to minimize context usage.

**Always load [agents/common.md](agents/common.md) first** — it contains essential guidelines for task sizing, git commits, and git push that apply to all tasks.

| File | Description |
|---|---|
| [work/lnvps-compose-v1.md](work/lnvps-compose-v1.md) | v1 build-out: this repo, then web and admin integration. In progress — see the file for what's done. |

## Generic Docs

These docs apply to all projects using this agent structure:

| Doc | When to load |
|---|---|
| [agents/bug-fixes.md](agents/bug-fixes.md) | Resolving bugs (includes regression test requirement) |
| [agents/coverage.md](agents/coverage.md) | Any edit that adds or modifies functions (100% function coverage required) |
| [agents/incremental-work.md](agents/incremental-work.md) | Managing a work file for a multi-increment task |
| [agents/typescript/coverage.md](agents/typescript/coverage.md) | Coverage tooling: `bun test --coverage` |

## Project-Specific Docs

This package has no project-specific docs beyond the README yet — it is
small and single-purpose. `README.md` covers the API surface and how a
consumer installs it; `work/lnvps-compose-v1.md` covers what's built and
what remains against the Rust source of truth.

## Source of truth

The Rust source this package mirrors is `lnvps_compose/src/lib.rs` in
[`LNVPS/api`](https://github.com/LNVPS/api). Any behavioural question
("what does the real parser do here?") is answered by reading that file, not
by guessing from this one.
