import { parse as parseYaml } from "yaml";
import type { ConfigField, FieldType, Generate, SecretDecl } from "./types.js";

export interface ComposeSchema {
  config: Array<ConfigField>;
  secrets: Array<SecretDecl>;
}

const FIELD_TYPES: ReadonlyArray<FieldType> = ["string", "int", "bool", "file"];
const GENERATE_VALUES: ReadonlyArray<Generate> = ["password", "token"];

function asFieldType(value: unknown): FieldType {
  const t = typeof value === "string" ? value.toLowerCase() : "";
  return (FIELD_TYPES as ReadonlyArray<string>).includes(t) ? (t as FieldType) : "string";
}

function asGenerate(value: unknown): Generate {
  const g = typeof value === "string" ? value.toLowerCase() : "";
  return (GENERATE_VALUES as ReadonlyArray<string>).includes(g) ? (g as Generate) : "password";
}

function asOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
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
export function parseComposeSchema(yaml: string): ComposeSchema {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch {
    return { config: [], secrets: [] };
  }
  if (typeof doc !== "object" || doc === null) return { config: [], secrets: [] };
  const raw = doc as { config?: unknown; secrets?: unknown };

  const config: Array<ConfigField> = Array.isArray(raw.config)
    ? raw.config
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          name: typeof e.name === "string" ? e.name : "",
          label: asOptionalString(e.label),
          type: asFieldType(e.type),
          default: asOptionalString(e.default),
          required: e.required === true,
          pattern: asOptionalString(e.pattern),
        }))
        .filter((f) => f.name.length > 0)
    : [];

  const secrets: Array<SecretDecl> = Array.isArray(raw.secrets)
    ? raw.secrets
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          name: typeof e.name === "string" ? e.name : "",
          generate: asGenerate(e.generate),
          bytes: typeof e.bytes === "number" ? e.bytes : undefined,
        }))
        .filter((s) => s.name.length > 0)
    : [];

  return { config, secrets };
}
