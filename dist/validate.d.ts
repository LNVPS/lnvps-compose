import { type Compose } from "./types.js";
/**
 * Validate a parsed {@link Compose} against the business rules `parseCompose`'s
 * structural pass does not check. Throws on the first violation found,
 * rather than collecting every one — same as the Rust source, which returns
 * on its first `bail!`.
 */
export declare function validateCompose(compose: Compose): void;
