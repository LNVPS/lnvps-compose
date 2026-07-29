/**
 * The route96 example from `LNVPS/api`'s `docs/managed-app-examples.md`,
 * kept byte-for-byte so a footprint mismatch here means this package has
 * drifted from the Rust source, not that the fixture is wrong.
 */
export const ROUTE96_COMPOSE = `
services:
  db:
    image: mariadb:11
    user: root    # mariadb's entrypoint starts as root, then drops to \`mysql\`
    resources: { cpu: 500m, memory: 512Mi }
    ports:
      - { name: mysql, container: 3306, protocol: tcp, expose: none }
    env:
      MARIADB_ROOT_PASSWORD: \${DB_ROOT_PASSWORD}
      MARIADB_DATABASE: route96
    volumes:
      - { name: data, path: /var/lib/mysql, size: 5Gi, label: database }
    scratch:
      - { path: /tmp }
      - { path: /run/mysqld, size: 32Mi }
    backup:
      command: ["sh", "-c", "exec mariadb-dump --all-databases -uroot -p\\"$MARIADB_ROOT_PASSWORD\\""]
      artifact: route96.sql
  route96:
    image: voidic/route96:latest
    user: "1000"
    resources: { cpu: 500m, memory: 512Mi }
    depends_on: [db]
    ports:
      - { name: http, container: 8000, protocol: http, expose: ingress }
    files:
      - path: /app/config.yaml
        content: |
          listen: "0.0.0.0:8000"
          database: "mysql://root:\${DB_ROOT_PASSWORD}@db:3306/route96"
          storage_dir: "/app/data"
          max_upload_bytes: 104857600
          public_url: "https://\${HOSTNAME}"
    volumes:
      - { name: blobs, path: /app/data, size: 20Gi, label: files }
    backup:
      volume: blobs
secrets:
  - { name: DB_ROOT_PASSWORD, generate: password }
`;
