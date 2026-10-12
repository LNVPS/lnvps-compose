import { describe, expect, test } from "bun:test";
import {
  configFieldDisplayLabel,
  fileFormatFromPath,
  fileMergeFormat,
  groupConfigFields,
  DEFAULT_SCRATCH_SIZE,
  DEFAULT_SECRET_BYTES,
  scratchSizeOrDefault,
  secretByteLen,
  type ConfigField,
  type Scratch,
  type SecretDecl,
} from "../src/types";

describe("scratchSizeOrDefault", () => {
  test("returns the declared size", () => {
    const s: Scratch = { path: "/tmp", size: "32Mi" };
    expect(scratchSizeOrDefault(s)).toBe("32Mi");
  });

  test("falls back to the default when none is declared", () => {
    const s: Scratch = { path: "/tmp" };
    expect(scratchSizeOrDefault(s)).toBe(DEFAULT_SCRATCH_SIZE);
  });
});

describe("secretByteLen", () => {
  test("returns the declared length", () => {
    const s: SecretDecl = { name: "K", generate: "token", bytes: 32 };
    expect(secretByteLen(s)).toBe(32);
  });

  test("falls back to the default when none is declared", () => {
    const s: SecretDecl = { name: "K", generate: "password" };
    expect(secretByteLen(s)).toBe(DEFAULT_SECRET_BYTES);
  });
});

describe("configFieldDisplayLabel", () => {
  test("prefers the declared label", () => {
    const f: ConfigField = {
      name: "owner_npub",
      label: "Owner npub",
      type: "string",
      required: true,
    };
    expect(configFieldDisplayLabel(f)).toBe("Owner npub");
  });

  test("falls back to the field name when there is no label", () => {
    const f: ConfigField = { name: "owner_npub", type: "string", required: true };
    expect(configFieldDisplayLabel(f)).toBe("owner_npub");
  });

  test("falls back to the field name when the label is blank", () => {
    const f: ConfigField = { name: "owner_npub", label: "   ", type: "string", required: true };
    expect(configFieldDisplayLabel(f)).toBe("owner_npub");
  });
});

describe("groupConfigFields", () => {
  const field = (name: string, group?: string): ConfigField => ({
    name,
    type: "string",
    required: false,
    group,
  });

  test("keeps ungrouped fields apart and groups in first-seen order", () => {
    const { ungrouped, groups } = groupConfigFields([
      field("name"),
      field("max", "Limits"),
      field("log", "Logging"),
      field("min", " Limits "),
      field("desc", "  "),
    ]);
    expect(ungrouped.map((f) => f.name)).toEqual(["name", "desc"]);
    expect(groups.map((g) => [g.name, g.fields.map((f) => f.name)])).toEqual([
      ["Limits", ["max", "min"]],
      ["Logging", ["log"]],
    ]);
  });

  test("returns nothing for no fields", () => {
    expect(groupConfigFields([])).toEqual({ ungrouped: [], groups: [] });
  });
});

describe("fileMergeFormat", () => {
  test("infers the format from the extension", () => {
    expect(fileFormatFromPath("/app/config.yml")).toBe("yaml");
    expect(fileFormatFromPath("/app/config.YAML")).toBe("yaml");
    expect(fileFormatFromPath("/app/config.toml")).toBe("toml");
    expect(fileFormatFromPath("/app/x.json")).toBe("json");
    expect(fileFormatFromPath("/etc/strfry.conf")).toBeUndefined();
    expect(fileFormatFromPath("/etc/noext")).toBeUndefined();
  });

  test("prefers an explicit format", () => {
    expect(fileMergeFormat({ path: "/etc/a.conf", format: "toml", sensitive: false })).toBe("toml");
    expect(fileMergeFormat({ path: "/etc/a.yml", sensitive: false })).toBe("yaml");
  });
});
