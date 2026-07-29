import { type Footprint, type ServiceFootprint } from "./types.js";
export interface ComposeFootprintResult {
    total: Footprint;
    services: Array<ServiceFootprint>;
}
/**
 * Compute an app's resource footprint from its compose YAML, mirroring the
 * Rust source's `Compose::footprint`/`service_footprints`: CPU/memory summed
 * across services (defaults applied when `resources` is omitted, an `init:`
 * step counted only when it asks for more than its service's own container)
 * plus the sizes of every declared volume.
 *
 * Deliberately lenient, the same way as {@link parseComposeSchema}: used to
 * price a catalog app while its compose is still being edited, so an
 * unparseable document or an unparseable quantity contributes zero rather
 * than throwing.
 */
export declare function parseComposeFootprint(yaml: string): ComposeFootprintResult;
