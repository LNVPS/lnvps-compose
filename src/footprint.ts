import { parse as parseYaml } from "yaml";
import { parseCpuMilli, parseQuantityBytes } from "./quantities.js";
import {
  DEFAULT_CPU,
  DEFAULT_MEMORY,
  INIT_DEFAULT_CPU,
  INIT_DEFAULT_MEMORY,
  type Footprint,
  type ServiceFootprint,
} from "./types.js";

export interface ComposeFootprintResult {
  total: Footprint;
  services: Array<ServiceFootprint>;
}

const EMPTY: ComposeFootprintResult = {
  total: { cpu_milli: 0, memory_bytes: 0, storage_bytes: 0 },
  services: [],
};

/**
 * A YAML scalar as a quantity string. Unquoted quantities like `cpu: 1` or
 * `size: 20` parse as numbers, so they must be coerced before suffix
 * matching. Anything else present but not a usable scalar is `undefined`,
 * so the caller's own default applies rather than silently becoming `"0"`.
 */
function toQuantityString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** `parseCpuMilli`/`parseQuantityBytes`, but 0 rather than thrown on a
 * quantity this preview cannot make sense of yet. */
function cpuOrZero(value: unknown, fallback: string): number {
  try {
    return parseCpuMilli(toQuantityString(value) ?? fallback);
  } catch {
    return 0;
  }
}
function bytesOrZero(value: unknown, fallback: string): number {
  try {
    return parseQuantityBytes(toQuantityString(value) ?? fallback);
  } catch {
    return 0;
  }
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
export function parseComposeFootprint(yaml: string): ComposeFootprintResult {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch {
    return EMPTY;
  }
  const services = (doc as { services?: unknown } | null)?.services;
  if (typeof services !== "object" || services === null) return EMPTY;

  const perService: Array<ServiceFootprint> = Object.entries(
    services as Record<string, unknown>,
  )
    .map(([name, raw]) => {
      const svc = (typeof raw === "object" && raw !== null ? raw : {}) as {
        resources?: { cpu?: unknown; memory?: unknown };
        volumes?: unknown;
        init?: unknown;
      };
      let cpu_milli = cpuOrZero(svc.resources?.cpu, DEFAULT_CPU);
      let memory_bytes = bytesOrZero(svc.resources?.memory, DEFAULT_MEMORY);

      const initSteps = Array.isArray(svc.init) ? svc.init : [];
      for (const raw of initSteps) {
        const init = (typeof raw === "object" && raw !== null ? raw : {}) as {
          resources?: { cpu?: unknown; memory?: unknown } | null;
        };
        // Rust: `init.resources` is `Option<Resources>`. Absent entirely,
        // the whole struct defaults to the init-specific 50m/64Mi; present,
        // a field missing *within* it takes the regular per-field Resources
        // default (250m/256Mi) — the same default a service's own
        // `resources:` gets, not the init default a second time.
        const hasResources = init.resources !== undefined && init.resources !== null;
        const cpuFallback = hasResources ? DEFAULT_CPU : INIT_DEFAULT_CPU;
        const memoryFallback = hasResources ? DEFAULT_MEMORY : INIT_DEFAULT_MEMORY;
        cpu_milli = Math.max(cpu_milli, cpuOrZero(init.resources?.cpu, cpuFallback));
        memory_bytes = Math.max(
          memory_bytes,
          bytesOrZero(init.resources?.memory, memoryFallback),
        );
      }

      const volumes = Array.isArray(svc.volumes) ? svc.volumes : [];
      const storage_bytes = volumes.reduce((sum: number, v: unknown) => {
        const size = (v as { size?: unknown } | null)?.size;
        return sum + bytesOrZero(size, "0");
      }, 0);

      return { name, cpu_milli, memory_bytes, storage_bytes };
    })
    // Rust's `Ord` for `String` is byte order, not locale collation — this
    // must sort the same way `service_footprints` does, uppercase before
    // lowercase, not `localeCompare`'s dictionary order.
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const total = perService.reduce<Footprint>(
    (acc, s) => ({
      cpu_milli: acc.cpu_milli + s.cpu_milli,
      memory_bytes: acc.memory_bytes + s.memory_bytes,
      storage_bytes: acc.storage_bytes + s.storage_bytes,
    }),
    { cpu_milli: 0, memory_bytes: 0, storage_bytes: 0 },
  );

  return { total, services: perService };
}
