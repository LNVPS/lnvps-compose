/**
 * Types mirroring the Rust structs in `LNVPS/api`'s `lnvps_compose` crate
 * (`lnvps_compose/src/lib.rs`). Field names and shapes match the crate
 * exactly so a value read here means the same thing it means there.
 */

/** A parsed app compose document. */
export interface Compose {
  /** Named services (containers). Order is not significant. */
  services: Record<string, Service>;
  /** Operator-generated secrets, injected as env wherever referenced. */
  secrets: Array<SecretDecl>;
  /** Customer-provided configuration fields (the deploy form). */
  config: Array<ConfigField>;
}

/** A single service/container within an app. */
export interface Service {
  /** Container image reference. */
  image: string;
  /** Exposed/served ports. */
  ports: Array<Port>;
  /** Environment variables (values may contain `${…}` references). */
  env: Record<string, string>;
  /** Persistent volumes → PVCs. */
  volumes: Array<Volume>;
  /** Writable-but-throwaway paths → `emptyDir`. */
  scratch: Array<Scratch>;
  /** Advisory startup ordering hints. */
  depends_on: Array<string>;
  /** Config files injected read-only into the container. */
  files: Array<File>;
  /** Requested CPU/memory for this service. Defaults apply when omitted. */
  resources: Resources;
  /** Optional backup method for this service's data. */
  backup?: Backup;
  /** Run the container as this user: `"root"`/`"0"`, or a numeric UID. */
  user?: string;
  /** One-shot containers run to completion, in order, before this service's
   * own container starts. */
  init: Array<InitContainer>;
}

/** A setup step that must succeed before its service's container starts. */
export interface InitContainer {
  /** Step name; becomes the init container name. */
  name: string;
  /** Container image reference. */
  image: string;
  /** Entrypoint override. `${…}` is not substituted here. */
  command?: Array<string>;
  /** Arguments to the entrypoint. Same no-`${…}` rule as `command`. */
  args?: Array<string>;
  /** Environment variables (values may contain `${…}` references). */
  env: Record<string, string>;
  /** Requested CPU/memory. Defaults to a small footprint when omitted. */
  resources?: Resources;
  /** Run this step as a specific user, same grammar as a service's `user`. */
  user?: string;
}

/** Default CPU for an init step that declares no `resources:`. */
export const INIT_DEFAULT_CPU = "50m";
/** Default memory for an init step that declares no `resources:`. */
export const INIT_DEFAULT_MEMORY = "64Mi";

/**
 * A service's requested CPU and memory. Kubernetes-style quantities: CPU as
 * cores or millicores (`"1"`, `"500m"`), memory with binary/SI suffixes
 * (`"512Mi"`, `"2Gi"`, `"1G"`).
 */
export interface Resources {
  cpu: string;
  memory: string;
}

export const DEFAULT_CPU = "250m";
export const DEFAULT_MEMORY = "256Mi";

/** An app's total resource footprint, summed across its services and volumes. */
export interface Footprint {
  /** CPU in millicores (e.g. `1500` = 1.5 cores). */
  cpu_milli: number;
  /** Memory in bytes. */
  memory_bytes: number;
  /** Persistent storage in bytes (sum of `volumes[].size`). */
  storage_bytes: number;
}

/** One service's resource contribution to the {@link Footprint}. */
export interface ServiceFootprint {
  /** Compose service name. */
  name: string;
  cpu_milli: number;
  memory_bytes: number;
  storage_bytes: number;
}

/**
 * A config file injected into a container and mounted read-only. Exactly one
 * content source is used: an inline templated `content`, or `content_from` a
 * `config` field whose value the customer supplies verbatim.
 */
export interface File {
  /** Absolute in-container mount path. */
  path: string;
  /** Inline templated file content. */
  content?: string;
  /** Name of a `config` field whose value is used as the file content. */
  content_from?: string;
  /** Render into a Secret instead of a ConfigMap. */
  sensitive: boolean;
}

/** How a port is exposed. */
export type Expose = "none" | "ingress" | "tcp" | "udp";
export const DEFAULT_EXPOSE: Expose = "none";

/** Wire protocol of a port. */
export type Protocol = "http" | "tcp" | "udp";
export const DEFAULT_PROTOCOL: Protocol = "tcp";

/** A service port. */
export interface Port {
  /** Port name (used for the k8s Service port and ingress backend). */
  name: string;
  /** Container port number. */
  container: number;
  protocol: Protocol;
  expose: Expose;
  /** Ingress path (defaults to `/`), only meaningful for `expose: ingress`. */
  path?: string;
}

/** A persistent volume mounted into a service → one PVC. */
export interface Volume {
  /** Volume name (becomes the PVC name suffix; must be a slug). */
  name: string;
  /** Absolute mount path inside the container. */
  path: string;
  /** Requested size, e.g. `5Gi`. */
  size: string;
  /** What a buyer gets from this volume, in their words: `events`, `media`,
   * `database` (issue LNVPS/api#260). */
  label?: string;
}

/** Longest accepted volume label. */
export const MAX_VOLUME_LABEL_LEN = 40;

/** A writable throwaway path inside a service's container → one `emptyDir`. */
export interface Scratch {
  /** Absolute mount path inside the container. */
  path: string;
  /** Upper bound on what the app may write there, e.g. `256Mi`. Defaults to
   * {@link DEFAULT_SCRATCH_SIZE}. */
  size?: string;
}

/** Size of a `scratch:` path that does not declare one. */
export const DEFAULT_SCRATCH_SIZE = "256Mi";
/** Largest accepted `scratch:` size (1 GiB). */
export const MAX_SCRATCH_BYTES = 1024 * 1024 * 1024;

/** Declared size, or {@link DEFAULT_SCRATCH_SIZE}. */
export function scratchSizeOrDefault(s: Scratch): string {
  return s.size ?? DEFAULT_SCRATCH_SIZE;
}

/** Default generated-secret length in bytes. Hex-encoded, so 48 characters. */
export const DEFAULT_SECRET_BYTES = 24;
export const MIN_SECRET_BYTES = 16;
export const MAX_SECRET_BYTES = 64;

/** An operator-generated secret. */
export interface SecretDecl {
  /** Env var name the generated value is bound to (referenced as `${name}`). */
  name: string;
  generate: Generate;
  /** Length of the generated value in bytes, hex-encoded into twice as many
   * characters. Defaults to {@link DEFAULT_SECRET_BYTES}. */
  bytes?: number;
}

/** Declared length in bytes, or the default when unset. */
export function secretByteLen(s: SecretDecl): number {
  return s.bytes ?? DEFAULT_SECRET_BYTES;
}

/** Secret generation strategy. */
export type Generate = "password" | "token";
export const DEFAULT_GENERATE: Generate = "password";

/** A customer-provided config field (rendered as a form input). */
export interface ConfigField {
  /** Env var name (referenced as `${name}`). */
  name: string;
  /** Human-readable form label. */
  label?: string;
  type: FieldType;
  /** Default value when the customer leaves it blank. */
  default?: string;
  /** Whether the field must be supplied. */
  required: boolean;
  /** Regex the submitted value must match in full (issue LNVPS/api#271). */
  pattern?: string;
}

/** Longest accepted `pattern`. */
export const MAX_PATTERN_LEN = 200;

/** The label a customer sees, falling back to the field name. */
export function configFieldDisplayLabel(f: ConfigField): string {
  const l = f.label?.trim();
  return l ? f.label! : f.name;
}

/** Config field input type. */
export type FieldType = "string" | "int" | "bool" | "file";
export const DEFAULT_FIELD_TYPE: FieldType = "string";

/** A service's backup method. */
export interface Backup {
  /** App-consistent dump command; stdout is captured as the artifact. */
  command?: Array<string>;
  /** Alternatively, raw tar of this named volume (append-only data only). */
  volume?: string;
  /** Suggested artifact filename. */
  artifact?: string;
}
