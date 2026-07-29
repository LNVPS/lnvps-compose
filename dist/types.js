/**
 * Types mirroring the Rust structs in `LNVPS/api`'s `lnvps_compose` crate
 * (`lnvps_compose/src/lib.rs`). Field names and shapes match the crate
 * exactly so a value read here means the same thing it means there.
 */
/** Default CPU for an init step that declares no `resources:`. */
export const INIT_DEFAULT_CPU = "50m";
/** Default memory for an init step that declares no `resources:`. */
export const INIT_DEFAULT_MEMORY = "64Mi";
export const DEFAULT_CPU = "250m";
export const DEFAULT_MEMORY = "256Mi";
export const DEFAULT_EXPOSE = "none";
export const DEFAULT_PROTOCOL = "tcp";
/** Longest accepted volume label, in characters (issue LNVPS/api#260). */
export const MAX_VOLUME_LABEL_LEN = 40;
/** Size of a `scratch:` path that does not declare one. */
export const DEFAULT_SCRATCH_SIZE = "256Mi";
/** Largest accepted `scratch:` size in bytes (1 GiB). Node-local disk is
 * shared with every other tenant on the node — anything bigger belongs in a
 * `volume`, where it is sized, billed and backed up. */
export const MAX_SCRATCH_BYTES = 1024 * 1024 * 1024;
/** Declared size, or {@link DEFAULT_SCRATCH_SIZE}. */
export function scratchSizeOrDefault(s) {
    return s.size ?? DEFAULT_SCRATCH_SIZE;
}
/** Default generated-secret length in bytes. Hex-encoded, so 48 characters. */
export const DEFAULT_SECRET_BYTES = 24;
/** Accepted range for an explicitly declared secret length. */
export const MIN_SECRET_BYTES = 16;
export const MAX_SECRET_BYTES = 64;
/** Declared length in bytes, or the default when unset. */
export function secretByteLen(s) {
    return s.bytes ?? DEFAULT_SECRET_BYTES;
}
export const GENERATE_VALUES = ["password", "token"];
export const DEFAULT_GENERATE = "password";
/** Longest accepted `pattern`, in bytes. Long enough for the character-class
 * patterns a catalog field needs (an npub, a domain, a hex key) and short
 * enough that the admin API is not a place to paste a program. */
export const MAX_PATTERN_LEN = 200;
/** The label a customer sees, falling back to the field name. */
export function configFieldDisplayLabel(f) {
    const l = f.label?.trim();
    return l ? f.label : f.name;
}
export const FIELD_TYPE_VALUES = ["string", "int", "bool", "file"];
export const DEFAULT_FIELD_TYPE = "string";
