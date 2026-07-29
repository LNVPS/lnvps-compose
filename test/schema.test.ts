import { describe, expect, test } from "bun:test";
import { parseComposeSchema } from "../src/schema";

describe("parseComposeSchema", () => {
  test("reads config fields and secrets", () => {
    const { config, secrets } = parseComposeSchema(`
services:
  app: { image: example/app }
config:
  - { name: owner_npub, label: "Owner npub", type: string, required: true }
  - { name: max_users, type: int, default: 10 }
secrets:
  - { name: DB_PASSWORD, generate: password }
  - { name: SIGNING_KEY, generate: token, bytes: 32 }
`);
    expect(config).toEqual([
      {
        name: "owner_npub",
        label: "Owner npub",
        type: "string",
        default: undefined,
        required: true,
        pattern: undefined,
      },
      {
        name: "max_users",
        label: undefined,
        type: "int",
        default: "10",
        required: false,
        pattern: undefined,
      },
    ]);
    expect(secrets).toEqual([
      { name: "DB_PASSWORD", generate: "password", bytes: undefined },
      { name: "SIGNING_KEY", generate: "token", bytes: 32 },
    ]);
  });

  test("returns empty lists for a document with neither key", () => {
    expect(parseComposeSchema(`services: { app: { image: x } }`)).toEqual({
      config: [],
      secrets: [],
    });
  });

  test("returns empty lists rather than throwing on unparseable YAML", () => {
    expect(parseComposeSchema("services: [")).toEqual({ config: [], secrets: [] });
  });

  test("drops a config entry with no name rather than failing the whole list", () => {
    const { config } = parseComposeSchema(`
config:
  - { type: string }
  - { name: valid_one }
`);
    expect(config.map((f) => f.name)).toEqual(["valid_one"]);
  });

  test("falls back to string/password for an unrecognised type", () => {
    const { config, secrets } = parseComposeSchema(`
config:
  - { name: a, type: not_a_real_type }
secrets:
  - { name: b, generate: not_a_real_strategy }
`);
    expect(config[0]!.type).toBe("string");
    expect(secrets[0]!.generate).toBe("password");
  });
});
