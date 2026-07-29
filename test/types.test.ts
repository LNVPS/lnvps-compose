import { describe, expect, test } from "bun:test";
import {
  configFieldDisplayLabel,
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
