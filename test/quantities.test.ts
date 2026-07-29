import { describe, expect, test } from "bun:test";
import { parseCpuMilli, parseQuantityBytes } from "../src/quantities";

describe("parseCpuMilli", () => {
  test("millicore suffix", () => {
    expect(parseCpuMilli("500m")).toBe(500);
    expect(parseCpuMilli("50m")).toBe(50);
  });

  test("whole and fractional cores", () => {
    expect(parseCpuMilli("2")).toBe(2000);
    expect(parseCpuMilli("1.5")).toBe(1500);
  });

  test("rounds a fractional millicore result", () => {
    expect(parseCpuMilli("0.0001")).toBe(0);
  });

  test("rejects a fractional millicore suffix", () => {
    expect(() => parseCpuMilli("1.5m")).toThrow();
  });

  test("rejects negative cpu", () => {
    expect(() => parseCpuMilli("-1")).toThrow("negative cpu");
  });

  test("rejects garbage", () => {
    expect(() => parseCpuMilli("abc")).toThrow("invalid cpu");
    expect(() => parseCpuMilli("")).toThrow("invalid cpu");
  });
});

describe("parseQuantityBytes", () => {
  test("binary suffixes", () => {
    expect(parseQuantityBytes("1Ki")).toBe(1024);
    expect(parseQuantityBytes("5Gi")).toBe(5 * 1024 ** 3);
    expect(parseQuantityBytes("20Gi")).toBe(20 * 1024 ** 3);
    expect(parseQuantityBytes("1Ti")).toBe(1024 ** 4);
  });

  test("decimal suffixes", () => {
    expect(parseQuantityBytes("1k")).toBe(1_000);
    expect(parseQuantityBytes("1M")).toBe(1_000_000);
    expect(parseQuantityBytes("1G")).toBe(1_000_000_000);
    expect(parseQuantityBytes("1T")).toBe(1_000_000_000_000);
  });

  test("bare byte count", () => {
    expect(parseQuantityBytes("512")).toBe(512);
  });

  test("checks the longer suffix first, so Ki is not read as a bare k", () => {
    expect(parseQuantityBytes("4Ki")).toBe(4 * 1024);
  });

  test("rejects a fractional quantity", () => {
    expect(() => parseQuantityBytes("5.5Gi")).toThrow("invalid size");
  });

  test("rejects garbage", () => {
    expect(() => parseQuantityBytes("abc")).toThrow("invalid size");
  });

  test("rejects a quantity that overflows a safe integer, rather than losing precision", () => {
    expect(() => parseQuantityBytes("9007199254740993")).toThrow("overflows");
    expect(() => parseQuantityBytes("9007199254740" + "T")).toThrow("overflows");
  });

  test("accepts a quantity right at the safe integer boundary", () => {
    expect(parseQuantityBytes("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
