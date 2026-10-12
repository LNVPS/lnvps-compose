import { describe, expect, test } from "bun:test";
import { parseCompose } from "../src/parse";
import { ROUTE96_COMPOSE } from "./fixtures";

describe("parseCompose", () => {
  test("parses every field of the route96 example", () => {
    const c = parseCompose(ROUTE96_COMPOSE);

    expect(Object.keys(c.services).sort()).toEqual(["db", "route96"]);
    expect(c.secrets).toEqual([{ name: "DB_ROOT_PASSWORD", generate: "password", bytes: undefined }]);
    expect(c.config).toEqual([]);

    const db = c.services.db!;
    expect(db.image).toBe("mariadb:11");
    expect(db.user).toBe("root");
    expect(db.resources).toEqual({ cpu: "500m", memory: "512Mi" });
    expect(db.ports).toEqual([
      { name: "mysql", container: 3306, protocol: "tcp", expose: "none", path: undefined },
    ]);
    expect(db.env).toEqual({
      MARIADB_ROOT_PASSWORD: "${DB_ROOT_PASSWORD}",
      MARIADB_DATABASE: "route96",
    });
    expect(db.volumes).toEqual([
      { name: "data", path: "/var/lib/mysql", size: "5Gi", label: "database" },
    ]);
    expect(db.scratch).toEqual([
      { path: "/tmp", size: undefined },
      { path: "/run/mysqld", size: "32Mi" },
    ]);
    expect(db.backup?.artifact).toBe("route96.sql");
    expect(db.backup?.command?.[2]).toContain("mariadb-dump");

    const route96 = c.services.route96!;
    expect(route96.depends_on).toEqual(["db"]);
    expect(route96.ports[0]).toMatchObject({ expose: "ingress", protocol: "http" });
    expect(route96.files[0]?.path).toBe("/app/config.yaml");
    expect(route96.backup).toEqual({ command: undefined, volume: "blobs", artifact: undefined });
  });

  test("defaults resources when a service omits them", () => {
    const c = parseCompose(`
services:
  app:
    image: example/app
`);
    expect(c.services.app!.resources).toEqual({ cpu: "250m", memory: "256Mi" });
  });

  test("defaults an init step's resources independently of its service", () => {
    const c = parseCompose(`
services:
  app:
    image: example/app
    init:
      - { name: setup, image: example/setup }
`);
    expect(c.services.app!.init[0]!.resources).toBeUndefined();
  });

  test("rejects a document with no services", () => {
    expect(() => parseCompose(`services: {}`)).toThrow(/at least one service/);
    expect(() => parseCompose(`config: []`)).toThrow();
  });

  test("rejects a service with no image", () => {
    expect(() =>
      parseCompose(`
services:
  app: {}
`),
    ).toThrow(/services\.app\.image/);
  });

  test("rejects an unknown expose value", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: example/app
    ports:
      - { name: http, container: 80, expose: public }
`),
    ).toThrow(/expose/);
  });

  test("rejects a container port that is not a number", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: example/app
    ports:
      - { name: http, container: "80" }
`),
    ).toThrow(/container/);
  });

  test("rejects invalid YAML outright", () => {
    expect(() => parseCompose("services: [")).toThrow("invalid compose YAML");
  });

  test("rejects a service that is not a mapping", () => {
    expect(() =>
      parseCompose(`
services:
  app: "not a mapping"
`),
    ).toThrow(/must be a mapping/);
  });

  test("rejects a non-boolean sensitive flag", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: example/app
    files:
      - { path: /etc/app.conf, content: x, sensitive: "yes" }
`),
    ).toThrow(/must be a boolean/);
  });

  test("rejects a non-numeric secret byte length", () => {
    expect(() =>
      parseCompose(`
services:
  app: { image: example/app }
secrets:
  - { name: K, bytes: "32" }
`),
    ).toThrow(/must be a number/);
  });

  test("parses config fields, defaulting type and required", () => {
    const c = parseCompose(`
services:
  app: { image: example/app }
config:
  - { name: owner_npub, label: "Owner npub", required: true }
  - { name: extra, type: int, default: "5" }
`);
    expect(c.config).toEqual([
      {
        name: "owner_npub",
        label: "Owner npub",
        type: "string",
        default: undefined,
        required: true,
        pattern: undefined,
      },
      {
        name: "extra",
        label: undefined,
        type: "int",
        default: "5",
        required: false,
        pattern: undefined,
      },
    ]);
  });

  test("rejects an unquoted numeric default, unlike the lenient schema reader", () => {
    expect(() =>
      parseCompose(`
services:
  app: { image: example/app }
config:
  - { name: extra, type: int, default: 5 }
`),
    ).toThrow(/config\[0\]\.default/);
  });

  test("parses config groups and config overrides", () => {
    const c = parseCompose(`
services:
  app:
    image: example/app
    env_from: extra_env
    files:
      - { path: /app/config.yml, content: "a: 1", merge_from: overrides }
      - { path: /app/settings, content: "{}", merge_from: json, format: json }
config:
  - { name: overrides, type: file, group: Advanced }
  - { name: json, type: file, group: Advanced }
  - { name: extra_env, type: file }
`);
    const app = c.services.app!;
    expect(app.env_from).toBe("extra_env");
    expect(app.files[0]!.merge_from).toBe("overrides");
    expect(app.files[0]!.format).toBeUndefined();
    expect(app.files[1]!.format).toBe("json");
    expect(c.config.map((f) => f.group)).toEqual(["Advanced", "Advanced", undefined]);
  });

  test("rejects an unknown file format", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: example/app
    files:
      - { path: /app/c.conf, content: "x", merge_from: o, format: ini }
`),
    ).toThrow(/files\[0\]\.format/);
  });
});
