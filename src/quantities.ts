/**
 * Kubernetes-style quantity parsing, matching `lnvps_compose::parse_cpu_milli`
 * and `lnvps_compose::parse_bytes` exactly: same suffixes, same precedence,
 * same rejections. Both throw on a string that Rust's parser would also
 * reject, rather than silently returning zero — a wrong number here is a
 * wrong price or a wrong capacity check, and both are worse than an error.
 */

/**
 * Parse a Kubernetes CPU quantity to millicores: `"500m"` → 500, `"2"` →
 * 2000, `"1.5"` → 1500.
 */
export function parseCpuMilli(value: string): number {
  const s = value.trim();
  if (s.endsWith("m")) {
    const m = s.slice(0, -1).trim();
    if (!/^\d+$/.test(m)) throw new Error(`invalid cpu '${value}'`);
    return Number.parseInt(m, 10);
  }
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`invalid cpu '${value}'`);
  }
  const cores = Number(s);
  if (cores < 0) throw new Error(`negative cpu '${value}'`);
  return Math.round(cores * 1000);
}

const BYTE_SUFFIXES: Array<[string, number]> = [
  ["Ki", 1024],
  ["Mi", 1024 ** 2],
  ["Gi", 1024 ** 3],
  ["Ti", 1024 ** 4],
  ["k", 1_000],
  ["M", 1_000_000],
  ["G", 1_000_000_000],
  ["T", 1_000_000_000_000],
];

/**
 * Parse a Kubernetes memory/storage quantity to bytes. Supports binary
 * suffixes (`Ki`,`Mi`,`Gi`,`Ti`), decimal suffixes (`k`,`M`,`G`,`T`), and bare
 * byte counts. The numeric part is an integer, same as the Rust side — a
 * fractional quantity like `"5.5Gi"` is rejected, not silently truncated.
 */
export function parseQuantityBytes(value: string): number {
  const s = value.trim();
  let num = s;
  let mult = 1;
  for (const [suffix, m] of BYTE_SUFFIXES) {
    if (s.endsWith(suffix)) {
      num = s.slice(0, -suffix.length);
      mult = m;
      break;
    }
  }
  const trimmed = num.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error(`invalid size '${value}'`);
  return Number.parseInt(trimmed, 10) * mult;
}
