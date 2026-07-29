import { type ConfigField, type SecretDecl } from "./types.js";
export interface ComposeSchema {
    config: Array<ConfigField>;
    secrets: Array<SecretDecl>;
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
export declare function parseComposeSchema(yaml: string): ComposeSchema;
