import { describe, expect, test } from "bun:test";
import { parseCompose } from "../src/parse";
import {
  MAX_PATTERN_LEN,
  MAX_SECRET_BYTES,
  MAX_VOLUME_LABEL_LEN,
  MIN_SECRET_BYTES,
} from "../src/types";

describe("validateCompose: services", () => {
  test("rejects a document with no services", () => {
    expect(() => parseCompose(`services: {}`)).toThrow("at least one service");
  });

  test("rejects a whitespace-only image", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: "   "
`),
    ).toThrow("image is required");
  });
});

describe("validateCompose: ports", () => {
  test("rejects ingress on a non-http port", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: x
    ports:
      - { name: p, container: 5, protocol: tcp, expose: ingress }
`),
    ).toThrow("expose: ingress requires protocol: http");
  });

  test("accepts ingress on an http port", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: x
    ports:
      - { name: p, container: 5, protocol: http, expose: ingress }
`),
    ).not.toThrow();
  });

  test("accepts a non-ingress port on any protocol", () => {
    expect(() =>
      parseCompose(`
services:
  app:
    image: x
    ports:
      - { name: p, container: 5, protocol: udp, expose: none }
`),
    ).not.toThrow();
  });
});

describe("validateCompose: service user", () => {
  test("rejects a named or otherwise unusable user", () => {
    for (const bad of ["nonroot", "app", "-1", "1.5", ""]) {
      expect(() =>
        parseCompose(`
services:
  a:
    image: x
    user: "${bad}"
`),
        `user "${bad}" should be rejected`,
      ).toThrow("numeric UID");
    }
  });

  test("accepts user: root", () => {
    expect(() =>
      parseCompose(`
services:
  db:
    image: x
    user: root
`),
    ).not.toThrow();
  });

  test('accepts user: "0"', () => {
    expect(() =>
      parseCompose(`
services:
  db:
    image: x
    user: "0"
`),
    ).not.toThrow();
  });

  test("accepts a positive numeric uid", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    user: "1000"
`),
    ).not.toThrow();
  });

  test("rejects a uid that overflows Rust's i64, not just accepts the nearest float", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    user: "99999999999999999999"
`),
    ).toThrow("numeric UID");
  });
});

describe("validateCompose: volumes", () => {
  test("rejects a volume name that is not a lowercase slug", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: Data, path: /data, size: 1Gi }
`),
    ).toThrow("lowercase slug");
  });

  test("rejects a relative volume path", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: data, size: 1Gi }
`),
    ).toThrow("must be absolute");
  });

  test("rejects a traversing volume path", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /var/../etc, size: 1Gi }
`),
    ).toThrow("must not contain");
  });

  test("rejects the root volume path", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /, size: 1Gi }
`),
    ).toThrow("cannot be '/'");
  });

  test("rejects an empty volume label", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /data, size: 1Gi, label: "" }
`),
    ).toThrow("label is empty");
  });

  test("rejects an overlong volume label", () => {
    const long = "x".repeat(MAX_VOLUME_LABEL_LEN + 1);
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /data, size: 1Gi, label: "${long}" }
`),
    ).toThrow("at most");
  });

  test("accepts a label at exactly the limit", () => {
    const ok = "y".repeat(MAX_VOLUME_LABEL_LEN);
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /data, size: 1Gi, label: "${ok}" }
`),
    ).not.toThrow();
  });
});

describe("validateCompose: scratch", () => {
  const svc = (scratch: string) => `
services:
  db:
    image: mariadb:11
    volumes:
      - { name: data, path: /var/lib/mysql, size: 5Gi }
    scratch:
${scratch}`;

  test("rejects a relative scratch path", () => {
    expect(() => parseCompose(svc("      - { path: tmp }\n"))).toThrow("must be absolute");
  });

  test("rejects a traversing scratch path", () => {
    expect(() => parseCompose(svc("      - { path: /var/../tmp }\n"))).toThrow(
      "must not contain",
    );
  });

  test("rejects the root scratch path", () => {
    expect(() => parseCompose(svc("      - { path: / }\n"))).toThrow("cannot be '/'");
  });

  test("rejects a scratch size over the bound", () => {
    expect(() => parseCompose(svc("      - { path: /tmp, size: 4Gi }\n"))).toThrow("exceeds");
  });

  test("rejects a zero scratch size", () => {
    expect(() => parseCompose(svc('      - { path: /tmp, size: "0" }\n'))).toThrow("non-zero");
  });

  test("rejects an unparseable scratch size", () => {
    expect(() => parseCompose(svc("      - { path: /tmp, size: enormous }\n"))).toThrow(
      "invalid size",
    );
  });

  test("rejects scratch inside a data volume", () => {
    expect(() => parseCompose(svc("      - { path: /var/lib/mysql/tmp }\n"))).toThrow(
      "is inside data volume",
    );
    expect(() => parseCompose(svc("      - { path: /var/lib/mysql }\n"))).toThrow(
      "is inside data volume",
    );
  });

  test("rejects a data volume inside scratch", () => {
    expect(() => parseCompose(svc("      - { path: /var/lib }\n"))).toThrow("is inside scratch");
  });

  test("rejects duplicate scratch paths", () => {
    expect(() =>
      parseCompose(svc("      - { path: /tmp }\n      - { path: /tmp }\n")),
    ).toThrow("duplicate scratch path");
  });

  test("rejects nested scratch paths", () => {
    expect(() =>
      parseCompose(svc("      - { path: /run }\n      - { path: /run/mysqld }\n")),
    ).toThrow("are nested");
  });

  test("rejects a file inside a scratch path", () => {
    expect(() =>
      parseCompose(`
services:
  db:
    image: mariadb:11
    scratch:
      - { path: /run/mysqld }
    files:
      - { path: /run/mysqld/my.cnf, content: "x" }
`),
    ).toThrow("overlaps scratch path");
  });

  test("accepts the shape a database service actually needs", () => {
    expect(() =>
      parseCompose(svc("      - { path: /tmp }\n      - { path: /run/mysqld, size: 32Mi }\n")),
    ).not.toThrow();
  });
});

describe("validateCompose: depends_on", () => {
  test("rejects depends_on referencing an unknown service", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    depends_on: [ghost]
`),
    ).toThrow("unknown service");
  });

  test("accepts depends_on referencing a real service", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    depends_on: [b]
  b:
    image: y
`),
    ).not.toThrow();
  });
});

describe("validateCompose: files", () => {
  test("rejects a file with both content and content_from", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /e.conf, content: "x", content_from: y }
`),
    ).toThrow("has both content and content_from");
  });

  test("rejects a file with neither content nor content_from", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /e.conf }
`),
    ).toThrow("needs content or content_from");
  });

  test("rejects content_from referencing an unknown config field", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /e.conf, content_from: nope }
`),
    ).toThrow("unknown config field");
  });

  test("accepts content_from referencing a declared config field", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /e.conf, content_from: custom }
config:
  - { name: custom, type: file }
`),
    ).not.toThrow();
  });

  test("rejects a traversing file path", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /etc/../x, content: "y" }
`),
    ).toThrow("must not contain");
  });

  test("rejects a file overlapping a data volume", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /app/db/f.conf, content: "y" }
    volumes:
      - { name: db, path: /app/db, size: 1Gi }
`),
    ).toThrow("overlaps data volume");
  });

  test("rejects file content over the byte limit", () => {
    // 256 * 1024: mirrors validate.ts's private MAX_FILE_BYTES, not exported
    // (matching the Rust source's own non-pub visibility for this constant).
    const big = "x".repeat(256 * 1024 + 1);
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    files:
      - { path: /e.conf, content: "${big}" }
`),
    ).toThrow("content exceeds");
  });
});

describe("validateCompose: backup", () => {
  test("rejects a backup with both command and volume", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /data, size: 1Gi }
    backup: { command: ["sh", "-c", "dump"], volume: d }
`),
    ).toThrow("has both command and volume");
  });

  test("rejects a backup with neither command nor volume", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    backup: {}
`),
    ).toThrow("needs either command or volume");
  });

  test("rejects a backup volume that is not declared", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    backup: { volume: nope }
`),
    ).toThrow("is not declared");
  });

  test("accepts a command-only backup", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    backup: { command: ["sh", "-c", "dump"] }
`),
    ).not.toThrow();
  });

  test("accepts a backup volume that is declared", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    volumes:
      - { name: d, path: /data, size: 1Gi }
    backup: { volume: d }
`),
    ).not.toThrow();
  });
});

describe("validateCompose: init containers", () => {
  test("rejects an init name that is not a DNS label", () => {
    for (const bad of ["Setup", "set_up", "-setup", "setup-"]) {
      expect(() =>
        parseCompose(`
services:
  a:
    image: x
    init:
      - { name: ${bad}, image: busybox }
`),
        `name "${bad}" should be rejected`,
      ).toThrow("init name");
    }
  });

  test("rejects an init name over 40 characters", () => {
    const long = "a".repeat(41);
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: ${long}, image: busybox }
`),
    ).toThrow("init name");
  });

  test("rejects duplicate init step names", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: setup, image: busybox }
      - { name: setup, image: alpine }
`),
    ).toThrow("duplicate init step");
  });

  test("rejects an init step with an empty image", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: setup, image: "" }
`),
    ).toThrow("image is required");
  });

  test("rejects an init step with an empty command array", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: setup, image: busybox, command: [] }
`),
    ).toThrow("command is empty");
  });

  test("rejects an init step with an empty args array", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: setup, image: busybox, args: [] }
`),
    ).toThrow("args is empty");
  });

  test("rejects a customer-value reference in an init command", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - name: setup
        image: busybox
        command: ["sh", "-c", "echo \${S3_KEY}"]
`),
    ).toThrow("must not contain");
  });

  test("rejects a customer-value reference in init args", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - name: setup
        image: busybox
        args: ["\${S3_KEY}"]
`),
    ).toThrow("must not contain");
  });

  test("rejects an init user that is not root or a numeric uid", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: setup, image: busybox, user: nonroot }
`),
    ).toThrow("positive numeric UID");
  });

  test("accepts a well-formed init step", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
    init:
      - { name: wait-s3, image: busybox, command: ["sh", "-c", "sleep 1"], user: "1000" }
`),
    ).not.toThrow();
  });
});

describe("validateCompose: secrets", () => {
  test("accepts bytes at the boundaries and in between", () => {
    for (const good of [MIN_SECRET_BYTES, 32, MAX_SECRET_BYTES]) {
      expect(() =>
        parseCompose(`
services:
  a:
    image: x
secrets:
  - { name: K, generate: token, bytes: ${good} }
`),
        `${good} bytes should parse`,
      ).not.toThrow();
    }
  });

  test("rejects bytes outside the range", () => {
    for (const bad of [0, MIN_SECRET_BYTES - 1, MAX_SECRET_BYTES + 1, 4096]) {
      expect(() =>
        parseCompose(`
services:
  a:
    image: x
secrets:
  - { name: K, generate: token, bytes: ${bad} }
`),
        `${bad} bytes should be rejected`,
      ).toThrow("bytes must be between");
    }
  });
});

describe("validateCompose: config pattern", () => {
  test("rejects an empty pattern", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: "" }
`),
    ).toThrow("pattern is empty");
  });

  test("rejects an overlong pattern", () => {
    const long = "a".repeat(MAX_PATTERN_LEN + 1);
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: "${long}" }
`),
    ).toThrow("at most");
  });

  test("rejects a pattern that does not compile", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: "[unclosed" }
`),
    ).toThrow("not a valid regex");
  });

  test("accepts a pattern that compiles", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: owner_npub, type: string, pattern: "npub1[02-9ac-hj-np-z]{58}" }
`),
    ).not.toThrow();
  });

  test("rejects a backreference, which the Rust regex engine cannot compile", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: '(a)\\1' }
`),
    ).toThrow("backreferences");
  });

  test("rejects lookaround, which the Rust regex engine cannot compile", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: "(?=a)b" }
`),
    ).toThrow("lookaround");
  });

  test("rejects a named group, which the Rust regex engine spells differently", () => {
    expect(() =>
      parseCompose(`
services:
  a:
    image: x
config:
  - { name: o, type: string, pattern: "(?<year>[0-9]{4})" }
`),
    ).toThrow("lookaround");
  });
});
