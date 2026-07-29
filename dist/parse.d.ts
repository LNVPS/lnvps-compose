import type { Compose } from "./types.js";
/**
 * Parse an app compose document from YAML into its typed shape.
 *
 * This is the **structural** parse: it matches what `serde_yaml` checks when
 * deserializing into the Rust `Compose` struct — every field present with the
 * right shape, every enum a value the grammar defines, every default applied
 * the same way. It does **not** run the Rust source's `validate()` (the
 * business rules: port `expose`/`protocol` combinations, volume/scratch path
 * overlap, `depends_on` references, secret byte ranges, config pattern
 * compilation, and so on) — that is tracked separately
 * (see `work/lnvps-compose-v1.md`). A document this function accepts can
 * still be rejected by the real API.
 *
 * Throws with a message naming the offending path on any shape mismatch.
 */
export declare function parseCompose(yaml: string): Compose;
