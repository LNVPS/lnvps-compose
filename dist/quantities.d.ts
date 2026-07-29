/**
 * Kubernetes-style quantity parsing, matching `lnvps_compose::parse_cpu_milli`
 * and `lnvps_compose::parse_bytes`: same suffixes, same precedence, same
 * rejections on a string either would reject, rather than silently
 * returning zero — a wrong number here is a wrong price or a wrong capacity
 * check, and both are worse than an error. `parseQuantityBytes` overflows at
 * `Number.MAX_SAFE_INTEGER` (~9007 PiB) rather than Rust's `u64::MAX`
 * (~16 EiB); no real catalog quantity is anywhere near either bound, but the
 * two are not the same threshold.
 */
/**
 * Parse a Kubernetes CPU quantity to millicores: `"500m"` → 500, `"2"` →
 * 2000, `"1.5"` → 1500.
 */
export declare function parseCpuMilli(value: string): number;
/**
 * Parse a Kubernetes memory/storage quantity to bytes. Supports binary
 * suffixes (`Ki`,`Mi`,`Gi`,`Ti`), decimal suffixes (`k`,`M`,`G`,`T`), and bare
 * byte counts. The numeric part is an integer, same as the Rust side — a
 * fractional quantity like `"5.5Gi"` is rejected, not silently truncated.
 */
export declare function parseQuantityBytes(value: string): number;
