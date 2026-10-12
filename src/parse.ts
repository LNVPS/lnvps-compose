import { parse as parseYaml } from "yaml";
import type {
  Backup,
  Compose,
  ConfigField,
  Expose,
  FieldType,
  FileFormat,
  File,
  Generate,
  InitContainer,
  Port,
  Protocol,
  Resources,
  Scratch,
  SecretDecl,
  Service,
  Volume,
} from "./types.js";
import { validateCompose } from "./validate.js";
import {
  DEFAULT_CPU,
  DEFAULT_EXPOSE,
  DEFAULT_FIELD_TYPE,
  DEFAULT_GENERATE,
  DEFAULT_MEMORY,
  DEFAULT_PROTOCOL,
  FIELD_TYPE_VALUES,
  FILE_FORMAT_VALUES,
  GENERATE_VALUES,
} from "./types.js";

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
 * Throws with a message naming the offending path on any shape mismatch, and
 * then runs {@link validateCompose} — the business rules the structural pass
 * above does not check (expose/protocol combinations, path bounds/overlap,
 * `depends_on` references, secret byte ranges, config pattern compilation,
 * and so on).
 */
export function parseCompose(yaml: string): Compose {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (err) {
    throw new Error(`invalid compose YAML: ${(err as Error).message}`);
  }
  const compose = readCompose(doc, "compose");
  validateCompose(compose);
  return compose;
}

function fail(ctx: string, message: string): never {
  throw new Error(`${ctx}: ${message}`);
}

function asObject(value: unknown, ctx: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(ctx, "must be a mapping");
  }
  return value as Record<string, unknown>;
}

function reqString(obj: Record<string, unknown>, key: string, ctx: string): string {
  const v = obj[key];
  if (typeof v !== "string") fail(`${ctx}.${key}`, "is required and must be a string");
  return v;
}

function optString(obj: Record<string, unknown>, key: string, ctx: string): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") fail(`${ctx}.${key}`, "must be a string");
  return v;
}

function optBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") fail(key, "must be a boolean");
  return v;
}

function optNumber(obj: Record<string, unknown>, key: string, ctx: string): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${ctx}.${key}`, "must be a number");
  return v;
}

function reqInt(obj: Record<string, unknown>, key: string, ctx: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isInteger(v)) {
    fail(`${ctx}.${key}`, "is required and must be a whole number");
  }
  return v;
}

function optArray(obj: Record<string, unknown>, key: string, ctx: string): Array<unknown> {
  const v = obj[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${ctx}.${key}`, "must be a list");
  return v;
}

function optStringArray(obj: Record<string, unknown>, key: string, ctx: string): Array<string> {
  return optArray(obj, key, ctx).map((v, i) => {
    if (typeof v !== "string") fail(`${ctx}.${key}[${i}]`, "must be a string");
    return v;
  });
}

function optStringRecord(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
): Record<string, string> {
  const v = obj[key];
  if (v === undefined || v === null) return {};
  const rec = asObject(v, `${ctx}.${key}`);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(rec)) {
    if (typeof val !== "string") fail(`${ctx}.${key}.${k}`, "must be a string");
    out[k] = val;
  }
  return out;
}

function enumValue<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: ReadonlyArray<T>,
  fallback: T,
  ctx: string,
): T {
  const v = obj[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" || !(allowed as ReadonlyArray<string>).includes(v)) {
    fail(`${ctx}.${key}`, `must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function readCompose(doc: unknown, ctx: string): Compose {
  const obj = asObject(doc, ctx);
  const rawServices = asObject(obj.services ?? fail(`${ctx}.services`, "is required"), `${ctx}.services`);
  const services: Record<string, Service> = {};
  for (const [name, raw] of Object.entries(rawServices)) {
    services[name] = readService(raw, `${ctx}.services.${name}`);
  }
  return {
    services,
    secrets: optArray(obj, "secrets", ctx).map((v, i) => readSecretDecl(v, `${ctx}.secrets[${i}]`)),
    config: optArray(obj, "config", ctx).map((v, i) => readConfigField(v, `${ctx}.config[${i}]`)),
  };
}

function readService(raw: unknown, ctx: string): Service {
  const obj = asObject(raw, ctx);
  return {
    image: reqString(obj, "image", ctx),
    ports: optArray(obj, "ports", ctx).map((v, i) => readPort(v, `${ctx}.ports[${i}]`)),
    env: optStringRecord(obj, "env", ctx),
    volumes: optArray(obj, "volumes", ctx).map((v, i) => readVolume(v, `${ctx}.volumes[${i}]`)),
    scratch: optArray(obj, "scratch", ctx).map((v, i) => readScratch(v, `${ctx}.scratch[${i}]`)),
    depends_on: optStringArray(obj, "depends_on", ctx),
    files: optArray(obj, "files", ctx).map((v, i) => readFile(v, `${ctx}.files[${i}]`)),
    resources: readResources(obj.resources, `${ctx}.resources`),
    backup: obj.backup == null ? undefined : readBackup(obj.backup, `${ctx}.backup`),
    user: optString(obj, "user", ctx),
    init: optArray(obj, "init", ctx).map((v, i) => readInitContainer(v, `${ctx}.init[${i}]`)),
    env_from: optString(obj, "env_from", ctx),
  };
}

function readInitContainer(raw: unknown, ctx: string): InitContainer {
  const obj = asObject(raw, ctx);
  return {
    name: reqString(obj, "name", ctx),
    image: reqString(obj, "image", ctx),
    command: obj.command == null ? undefined : optStringArray(obj, "command", ctx),
    args: obj.args == null ? undefined : optStringArray(obj, "args", ctx),
    env: optStringRecord(obj, "env", ctx),
    resources: obj.resources == null ? undefined : readResources(obj.resources, `${ctx}.resources`),
    user: optString(obj, "user", ctx),
  };
}

function readResources(raw: unknown, ctx: string): Resources {
  if (raw === undefined || raw === null) {
    return { cpu: DEFAULT_CPU, memory: DEFAULT_MEMORY };
  }
  const obj = asObject(raw, ctx);
  return {
    cpu: optString(obj, "cpu", ctx) ?? DEFAULT_CPU,
    memory: optString(obj, "memory", ctx) ?? DEFAULT_MEMORY,
  };
}

function readFile(raw: unknown, ctx: string): File {
  const obj = asObject(raw, ctx);
  return {
    path: reqString(obj, "path", ctx),
    content: optString(obj, "content", ctx),
    content_from: optString(obj, "content_from", ctx),
    merge_from: optString(obj, "merge_from", ctx),
    format:
      obj.format == null
        ? undefined
        : enumValue<FileFormat>(obj, "format", FILE_FORMAT_VALUES, "yaml", ctx),
    sensitive: optBool(obj, "sensitive", false),
  };
}

const EXPOSE_VALUES = ["none", "ingress", "tcp", "udp"] as const;
const PROTOCOL_VALUES = ["http", "tcp", "udp"] as const;

function readPort(raw: unknown, ctx: string): Port {
  const obj = asObject(raw, ctx);
  return {
    name: reqString(obj, "name", ctx),
    container: reqInt(obj, "container", ctx),
    protocol: enumValue<Protocol>(obj, "protocol", PROTOCOL_VALUES, DEFAULT_PROTOCOL, ctx),
    expose: enumValue<Expose>(obj, "expose", EXPOSE_VALUES, DEFAULT_EXPOSE, ctx),
    path: optString(obj, "path", ctx),
  };
}

function readVolume(raw: unknown, ctx: string): Volume {
  const obj = asObject(raw, ctx);
  return {
    name: reqString(obj, "name", ctx),
    path: reqString(obj, "path", ctx),
    size: reqString(obj, "size", ctx),
    label: optString(obj, "label", ctx),
  };
}

function readScratch(raw: unknown, ctx: string): Scratch {
  const obj = asObject(raw, ctx);
  return {
    path: reqString(obj, "path", ctx),
    size: optString(obj, "size", ctx),
  };
}

function readSecretDecl(raw: unknown, ctx: string): SecretDecl {
  const obj = asObject(raw, ctx);
  return {
    name: reqString(obj, "name", ctx),
    generate: enumValue<Generate>(obj, "generate", GENERATE_VALUES, DEFAULT_GENERATE, ctx),
    bytes: optNumber(obj, "bytes", ctx),
  };
}

function readConfigField(raw: unknown, ctx: string): ConfigField {
  const obj = asObject(raw, ctx);
  return {
    name: reqString(obj, "name", ctx),
    label: optString(obj, "label", ctx),
    type: enumValue<FieldType>(obj, "type", FIELD_TYPE_VALUES, DEFAULT_FIELD_TYPE, ctx),
    default: optString(obj, "default", ctx),
    required: optBool(obj, "required", false),
    pattern: optString(obj, "pattern", ctx),
    group: optString(obj, "group", ctx),
  };
}

function readBackup(raw: unknown, ctx: string): Backup {
  const obj = asObject(raw, ctx);
  return {
    command: obj.command == null ? undefined : optStringArray(obj, "command", ctx),
    volume: optString(obj, "volume", ctx),
    artifact: optString(obj, "artifact", ctx),
  };
}
