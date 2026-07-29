import { parse as parseYaml } from "yaml";
import { validateCompose } from "./validate.js";
import { DEFAULT_CPU, DEFAULT_EXPOSE, DEFAULT_FIELD_TYPE, DEFAULT_GENERATE, DEFAULT_MEMORY, DEFAULT_PROTOCOL, FIELD_TYPE_VALUES, GENERATE_VALUES, } from "./types.js";
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
export function parseCompose(yaml) {
    let doc;
    try {
        doc = parseYaml(yaml);
    }
    catch (err) {
        throw new Error(`invalid compose YAML: ${err.message}`);
    }
    const compose = readCompose(doc, "compose");
    validateCompose(compose);
    return compose;
}
function fail(ctx, message) {
    throw new Error(`${ctx}: ${message}`);
}
function asObject(value, ctx) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail(ctx, "must be a mapping");
    }
    return value;
}
function reqString(obj, key, ctx) {
    const v = obj[key];
    if (typeof v !== "string")
        fail(`${ctx}.${key}`, "is required and must be a string");
    return v;
}
function optString(obj, key, ctx) {
    const v = obj[key];
    if (v === undefined || v === null)
        return undefined;
    if (typeof v !== "string")
        fail(`${ctx}.${key}`, "must be a string");
    return v;
}
function optBool(obj, key, fallback) {
    const v = obj[key];
    if (v === undefined || v === null)
        return fallback;
    if (typeof v !== "boolean")
        fail(key, "must be a boolean");
    return v;
}
function optNumber(obj, key, ctx) {
    const v = obj[key];
    if (v === undefined || v === null)
        return undefined;
    if (typeof v !== "number" || !Number.isFinite(v))
        fail(`${ctx}.${key}`, "must be a number");
    return v;
}
function reqInt(obj, key, ctx) {
    const v = obj[key];
    if (typeof v !== "number" || !Number.isInteger(v)) {
        fail(`${ctx}.${key}`, "is required and must be a whole number");
    }
    return v;
}
function optArray(obj, key, ctx) {
    const v = obj[key];
    if (v === undefined || v === null)
        return [];
    if (!Array.isArray(v))
        fail(`${ctx}.${key}`, "must be a list");
    return v;
}
function optStringArray(obj, key, ctx) {
    return optArray(obj, key, ctx).map((v, i) => {
        if (typeof v !== "string")
            fail(`${ctx}.${key}[${i}]`, "must be a string");
        return v;
    });
}
function optStringRecord(obj, key, ctx) {
    const v = obj[key];
    if (v === undefined || v === null)
        return {};
    const rec = asObject(v, `${ctx}.${key}`);
    const out = {};
    for (const [k, val] of Object.entries(rec)) {
        if (typeof val !== "string")
            fail(`${ctx}.${key}.${k}`, "must be a string");
        out[k] = val;
    }
    return out;
}
function enumValue(obj, key, allowed, fallback, ctx) {
    const v = obj[key];
    if (v === undefined || v === null)
        return fallback;
    if (typeof v !== "string" || !allowed.includes(v)) {
        fail(`${ctx}.${key}`, `must be one of ${allowed.join(", ")}`);
    }
    return v;
}
function readCompose(doc, ctx) {
    const obj = asObject(doc, ctx);
    const rawServices = asObject(obj.services ?? fail(`${ctx}.services`, "is required"), `${ctx}.services`);
    const services = {};
    for (const [name, raw] of Object.entries(rawServices)) {
        services[name] = readService(raw, `${ctx}.services.${name}`);
    }
    return {
        services,
        secrets: optArray(obj, "secrets", ctx).map((v, i) => readSecretDecl(v, `${ctx}.secrets[${i}]`)),
        config: optArray(obj, "config", ctx).map((v, i) => readConfigField(v, `${ctx}.config[${i}]`)),
    };
}
function readService(raw, ctx) {
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
    };
}
function readInitContainer(raw, ctx) {
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
function readResources(raw, ctx) {
    if (raw === undefined || raw === null) {
        return { cpu: DEFAULT_CPU, memory: DEFAULT_MEMORY };
    }
    const obj = asObject(raw, ctx);
    return {
        cpu: optString(obj, "cpu", ctx) ?? DEFAULT_CPU,
        memory: optString(obj, "memory", ctx) ?? DEFAULT_MEMORY,
    };
}
function readFile(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        path: reqString(obj, "path", ctx),
        content: optString(obj, "content", ctx),
        content_from: optString(obj, "content_from", ctx),
        sensitive: optBool(obj, "sensitive", false),
    };
}
const EXPOSE_VALUES = ["none", "ingress", "tcp", "udp"];
const PROTOCOL_VALUES = ["http", "tcp", "udp"];
function readPort(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        name: reqString(obj, "name", ctx),
        container: reqInt(obj, "container", ctx),
        protocol: enumValue(obj, "protocol", PROTOCOL_VALUES, DEFAULT_PROTOCOL, ctx),
        expose: enumValue(obj, "expose", EXPOSE_VALUES, DEFAULT_EXPOSE, ctx),
        path: optString(obj, "path", ctx),
    };
}
function readVolume(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        name: reqString(obj, "name", ctx),
        path: reqString(obj, "path", ctx),
        size: reqString(obj, "size", ctx),
        label: optString(obj, "label", ctx),
    };
}
function readScratch(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        path: reqString(obj, "path", ctx),
        size: optString(obj, "size", ctx),
    };
}
function readSecretDecl(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        name: reqString(obj, "name", ctx),
        generate: enumValue(obj, "generate", GENERATE_VALUES, DEFAULT_GENERATE, ctx),
        bytes: optNumber(obj, "bytes", ctx),
    };
}
function readConfigField(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        name: reqString(obj, "name", ctx),
        label: optString(obj, "label", ctx),
        type: enumValue(obj, "type", FIELD_TYPE_VALUES, DEFAULT_FIELD_TYPE, ctx),
        default: optString(obj, "default", ctx),
        required: optBool(obj, "required", false),
        pattern: optString(obj, "pattern", ctx),
    };
}
function readBackup(raw, ctx) {
    const obj = asObject(raw, ctx);
    return {
        command: obj.command == null ? undefined : optStringArray(obj, "command", ctx),
        volume: optString(obj, "volume", ctx),
        artifact: optString(obj, "artifact", ctx),
    };
}
