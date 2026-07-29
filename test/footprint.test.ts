import { describe, expect, test } from "bun:test";
import { parseComposeFootprint } from "../src/footprint";
import { ROUTE96_COMPOSE } from "./fixtures";

describe("parseComposeFootprint", () => {
  test("matches the Rust source's numbers for the route96 example", () => {
    const { total, services } = parseComposeFootprint(ROUTE96_COMPOSE);

    expect(total).toEqual({
      cpu_milli: 1000,
      memory_bytes: 1_073_741_824,
      storage_bytes: 26_843_545_600,
    });

    expect(services).toEqual([
      { name: "db", cpu_milli: 500, memory_bytes: 536_870_912, storage_bytes: 5_368_709_120 },
      {
        name: "route96",
        cpu_milli: 500,
        memory_bytes: 536_870_912,
        storage_bytes: 21_474_836_480,
      },
    ]);

    // The parts sum to the total the same way the Rust source guarantees.
    const summed = services.reduce(
      (acc, s) => ({
        cpu_milli: acc.cpu_milli + s.cpu_milli,
        memory_bytes: acc.memory_bytes + s.memory_bytes,
        storage_bytes: acc.storage_bytes + s.storage_bytes,
      }),
      { cpu_milli: 0, memory_bytes: 0, storage_bytes: 0 },
    );
    expect(summed).toEqual(total);
  });

  test("applies the default resources when a service omits them", () => {
    const { total } = parseComposeFootprint(`
services:
  app: { image: example/app }
`);
    expect(total).toEqual({ cpu_milli: 250, memory_bytes: 256 * 1024 * 1024, storage_bytes: 0 });
  });

  test("an init step counts only when it asks for more than its service", () => {
    const small = parseComposeFootprint(`
services:
  app:
    image: example/app
    resources: { cpu: 500m, memory: 512Mi }
    init:
      - { name: setup, image: example/setup }
`);
    expect(small.total.cpu_milli).toBe(500);
    expect(small.total.memory_bytes).toBe(512 * 1024 * 1024);

    const large = parseComposeFootprint(`
services:
  app:
    image: example/app
    resources: { cpu: 100m, memory: 128Mi }
    init:
      - { name: setup, image: example/setup, resources: { cpu: 2, memory: 1Gi } }
`);
    expect(large.total.cpu_milli).toBe(2000);
    expect(large.total.memory_bytes).toBe(1024 * 1024 * 1024);
  });

  test("unquoted numeric quantities are coerced, matching how YAML parses them", () => {
    const { services } = parseComposeFootprint(`
services:
  app:
    image: example/app
    resources: { cpu: 1, memory: 20 }
`);
    expect(services[0]!.cpu_milli).toBe(1000);
    expect(services[0]!.memory_bytes).toBe(20);
  });

  test("empty total for a document with no services, rather than throwing", () => {
    expect(parseComposeFootprint("services: [")).toEqual({
      total: { cpu_milli: 0, memory_bytes: 0, storage_bytes: 0 },
      services: [],
    });
    expect(parseComposeFootprint("config: []")).toEqual({
      total: { cpu_milli: 0, memory_bytes: 0, storage_bytes: 0 },
      services: [],
    });
  });

  test("an unparseable quantity contributes zero rather than failing the app", () => {
    const { services } = parseComposeFootprint(`
services:
  app:
    image: example/app
    resources: { cpu: not-a-quantity, memory: 512Mi }
`);
    expect(services[0]!.cpu_milli).toBe(0);
    expect(services[0]!.memory_bytes).toBe(512 * 1024 * 1024);
  });
});
