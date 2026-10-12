import { parse as parseYaml } from "yaml";
import { FIELD_TYPE_VALUES, GENERATE_VALUES, } from "./types.js";
function asFieldType(value) {
    const t = typeof value === "string" ? value.toLowerCase() : "";
    return FIELD_TYPE_VALUES.includes(t) ? t : "string";
}
function asGenerate(value) {
    const g = typeof value === "string" ? value.toLowerCase() : "";
    return GENERATE_VALUES.includes(g) ? g : "password";
}
function asOptionalString(value) {
    if (value === null || value === undefined)
        return undefined;
    return String(value);
}
/**
 * Extract the `config:`/`secrets:` declarations from an app's compose YAML —
 * the deploy form's field list, replacing both web's `parseAppConfig` and
 * admin's `parseComposeSchema`.
 *
 * Deliberately lenient: an unparseable document, or one missing either key,
 * returns empty lists rather than throwing. This runs against the catalog's
 * stored compose to render a form, not to gate whether a compose is valid —
 * that gate is {@link parseCompose}, run at authoring time.
 */
export function parseComposeSchema(yaml) {
    let doc;
    try {
        doc = parseYaml(yaml);
    }
    catch {
        return { config: [], secrets: [] };
    }
    if (typeof doc !== "object" || doc === null)
        return { config: [], secrets: [] };
    const raw = doc;
    const config = Array.isArray(raw.config)
        ? raw.config
            .filter((e) => typeof e === "object" && e !== null)
            .map((e) => ({
            name: typeof e.name === "string" ? e.name : "",
            label: asOptionalString(e.label),
            type: asFieldType(e.type),
            default: asOptionalString(e.default),
            required: e.required === true,
            pattern: asOptionalString(e.pattern),
            group: asOptionalString(e.group),
        }))
            .filter((f) => f.name.length > 0)
        : [];
    const secrets = Array.isArray(raw.secrets)
        ? raw.secrets
            .filter((e) => typeof e === "object" && e !== null)
            .map((e) => ({
            name: typeof e.name === "string" ? e.name : "",
            generate: asGenerate(e.generate),
            bytes: typeof e.bytes === "number" ? e.bytes : undefined,
        }))
            .filter((s) => s.name.length > 0)
        : [];
    return { config, secrets };
}
