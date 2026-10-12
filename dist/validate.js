/**
 * Business rules `serde_yaml`'s structural deserialize does not enforce —
 * mirrors the Rust source's `Compose::validate()` (`lnvps_compose/src/lib.rs`
 * in `LNVPS/api`): same rule set, same error shape/messages where practical,
 * so a validation failure in the browser matches what the operator would
 * have rejected.
 *
 * Called from {@link parseCompose}'s strict/authoring path only —
 * `parseComposeSchema`/`parseComposeFootprint` stay lenient and never call
 * this.
 *
 * Out of scope, same as the Rust source's own carve-out: `resolve_env`,
 * `resolve_files`, `resolve_init`, `validate_declarations`,
 * `validate_volume_changes`, `addresses_host` (operator/admission-time, not
 * rendering) and `volumes()` (server-computed, already served by the API).
 */
import { parseQuantityBytes } from "./quantities.js";
import { fileMergeFormat, MAX_CONFIG_GROUP_LEN, MAX_PATTERN_LEN, MAX_SCRATCH_BYTES, MAX_SECRET_BYTES, MAX_VOLUME_LABEL_LEN, MIN_SECRET_BYTES, scratchSizeOrDefault, } from "./types.js";
/** Maximum inline file / ConfigMap content size (well under the k8s ~1 MiB
 * ConfigMap limit). Not part of this package's public API, matching the
 * Rust source's own (non-`pub`) visibility for this constant. */
const MAX_FILE_BYTES = 256 * 1024;
/**
 * Validate a parsed {@link Compose} against the business rules `parseCompose`'s
 * structural pass does not check. Throws on the first violation found,
 * rather than collecting every one — same as the Rust source, which returns
 * on its first `bail!`.
 */
export function validateCompose(compose) {
    if (Object.keys(compose.services).length === 0) {
        throw new Error("compose must define at least one service");
    }
    for (const [sname, svc] of Object.entries(compose.services)) {
        if (svc.image.trim().length === 0) {
            throw new Error(`service '${sname}': image is required`);
        }
        for (const p of svc.ports) {
            // Ingress is HTTP only (WebSocket rides HTTP → wss).
            if (p.expose === "ingress" && p.protocol !== "http") {
                throw new Error(`service '${sname}' port '${p.name}': expose: ingress requires protocol: http`);
            }
        }
        // `user:` must be root or a numeric UID. A name (e.g. `nonroot`) is
        // rejected here rather than at runtime: the kubelet cannot resolve a
        // name against the image, so under `runAsNonRoot` the pod would fail to
        // start with "image has non-numeric user" and retry for minutes with no
        // signal to whoever added the app.
        if (svc.user !== undefined && !userIsRoot(svc.user) && userUid(svc.user) === undefined) {
            throw new Error(`service '${sname}': user '${svc.user}' must be "root", "0", or a positive numeric UID ` +
                `(a user *name* cannot be verified by the kubelet under runAsNonRoot — use the ` +
                `numeric UID from the image's /etc/passwd)`);
        }
        for (const v of svc.volumes) {
            validateMountPath(sname, v.name, v.path);
            if (v.label !== undefined) {
                const l = v.label.trim();
                if (l.length === 0) {
                    throw new Error(`service '${sname}': volume '${v.name}': label is empty — omit it instead`);
                }
                if ([...l].length > MAX_VOLUME_LABEL_LEN) {
                    throw new Error(`service '${sname}': volume '${v.name}': label must be at most ${MAX_VOLUME_LABEL_LEN} characters`);
                }
            }
        }
        // Scratch paths: absolute, bounded, and not overlapping anything that
        // holds data. A scratch mount that shadowed a volume would hide the
        // customer's data behind an empty directory on every restart, and the
        // app would look like it had lost it.
        for (let i = 0; i < svc.scratch.length; i++) {
            const s = svc.scratch[i];
            checkAbsNoTraversal(sname, "scratch", s.path);
            let bytes;
            try {
                bytes = parseQuantityBytes(scratchSizeOrDefault(s));
            }
            catch (e) {
                throw new Error(`service '${sname}': scratch '${s.path}': ${e.message}`);
            }
            if (bytes === 0) {
                throw new Error(`service '${sname}': scratch '${s.path}': size must be non-zero`);
            }
            if (bytes > MAX_SCRATCH_BYTES) {
                throw new Error(`service '${sname}': scratch '${s.path}': size exceeds ${MAX_SCRATCH_BYTES} bytes — ` +
                    `a path that needs more than that is a volume, not scratch`);
            }
            for (const v of svc.volumes) {
                if (s.path === v.path || pathIsWithin(s.path, v.path)) {
                    throw new Error(`service '${sname}': scratch '${s.path}' is inside data volume '${v.path}' — it ` +
                        `would shadow persisted data with an empty directory`);
                }
                if (pathIsWithin(v.path, s.path)) {
                    throw new Error(`service '${sname}': data volume '${v.path}' is inside scratch '${s.path}' — the ` +
                        `volume's data would not survive a restart`);
                }
            }
            for (let j = i + 1; j < svc.scratch.length; j++) {
                const other = svc.scratch[j];
                if (s.path === other.path) {
                    throw new Error(`service '${sname}': duplicate scratch path '${s.path}'`);
                }
                if (pathIsWithin(s.path, other.path) || pathIsWithin(other.path, s.path)) {
                    throw new Error(`service '${sname}': scratch '${s.path}' and '${other.path}' are nested`);
                }
            }
        }
        // depends_on must reference real services.
        for (const dep of svc.depends_on) {
            if (!Object.hasOwn(compose.services, dep)) {
                throw new Error(`service '${sname}': depends_on unknown service '${dep}'`);
            }
        }
        // Config files: valid path, single content source, size-bounded, and not
        // overlapping a data volume.
        for (const f of svc.files) {
            checkAbsNoTraversal(sname, "file", f.path);
            if (f.content !== undefined && f.content_from !== undefined) {
                throw new Error(`service '${sname}': file '${f.path}' has both content and content_from`);
            }
            if (f.content === undefined && f.content_from === undefined) {
                throw new Error(`service '${sname}': file '${f.path}' needs content or content_from`);
            }
            if (f.content !== undefined) {
                if (utf8ByteLength(f.content) > MAX_FILE_BYTES) {
                    throw new Error(`service '${sname}': file '${f.path}' content exceeds ${MAX_FILE_BYTES} bytes`);
                }
            }
            else if (f.content_from !== undefined) {
                if (!compose.config.some((cf) => cf.name === f.content_from)) {
                    throw new Error(`service '${sname}': file '${f.path}' content_from references unknown config field '${f.content_from}'`);
                }
            }
            if (f.merge_from !== undefined) {
                if (f.content === undefined) {
                    throw new Error(`service '${sname}': file '${f.path}' merge_from needs inline content to merge into`);
                }
                requireFileField(compose, sname, `file '${f.path}' merge_from`, f.merge_from);
                if (fileMergeFormat(f) === undefined) {
                    throw new Error(`service '${sname}': file '${f.path}' merge_from needs \`format: yaml|toml|json\` (the path has no recognised extension)`);
                }
            }
            // A config file must not land inside a read-write data volume.
            for (const v of svc.volumes) {
                if (f.path === v.path || pathIsWithin(f.path, v.path)) {
                    throw new Error(`service '${sname}': file '${f.path}' overlaps data volume mount '${v.path}'`);
                }
            }
            // Nor inside a scratch path: the file is mounted read-only and the
            // scratch directory is emptied on every restart, so which one wins is
            // a question a catalog author should not have to ask.
            for (const s of svc.scratch) {
                if (f.path === s.path || pathIsWithin(f.path, s.path)) {
                    throw new Error(`service '${sname}': file '${f.path}' overlaps scratch path '${s.path}'`);
                }
            }
        }
        if (svc.env_from !== undefined) {
            requireFileField(compose, sname, "env_from", svc.env_from);
        }
        // A backup entry is exactly one of command | volume.
        if (svc.backup !== undefined) {
            const b = svc.backup;
            if (b.command !== undefined && b.volume !== undefined) {
                throw new Error(`service '${sname}': backup has both command and volume`);
            }
            else if (b.command === undefined && b.volume === undefined) {
                throw new Error(`service '${sname}': backup needs either command or volume`);
            }
            else if (b.volume !== undefined) {
                if (!svc.volumes.some((v) => v.name === b.volume)) {
                    throw new Error(`service '${sname}': backup volume '${b.volume}' is not declared`);
                }
            }
        }
        // Init steps: a name we can render, something to run, and no `${…}` in
        // the command — an interpolated customer config value there would be
        // shell injection, so values go through `env`.
        for (let i = 0; i < svc.init.length; i++) {
            const init = svc.init[i];
            validateInitName(sname, init.name);
            if (svc.init.slice(0, i).some((o) => o.name === init.name)) {
                throw new Error(`service '${sname}': duplicate init step '${init.name}' — names become container ` +
                    `names and must be unique within the service`);
            }
            if (init.image.trim().length === 0) {
                throw new Error(`service '${sname}': init '${init.name}': image is required`);
            }
            for (const [field, argv] of [
                ["command", init.command],
                ["args", init.args],
            ]) {
                if (argv === undefined)
                    continue;
                if (argv.length === 0) {
                    throw new Error(`service '${sname}': init '${init.name}': ${field} is empty — omit it to use the ` +
                        `image's own`);
                }
                if (argv.some((a) => extractRefs(a).length > 0)) {
                    throw new Error(`service '${sname}': init '${init.name}': ${field} must not contain '\${…}' — a ` +
                        `customer-supplied value interpolated into a command is injectable; put it in ` +
                        `the step's \`env:\` and read it as a shell variable`);
                }
            }
            if (init.user !== undefined && !userIsRoot(init.user) && userUid(init.user) === undefined) {
                throw new Error(`service '${sname}': init '${init.name}': user '${init.user}' must be "root", "0", ` +
                    `or a positive numeric UID`);
            }
        }
    }
    // A declared secret length must be usable. Checked at authoring time
    // because the failure mode otherwise is an app that starts, rejects its
    // own key and crash-loops — long after whoever typed the number left.
    for (const s of compose.secrets) {
        if (s.bytes !== undefined && (s.bytes < MIN_SECRET_BYTES || s.bytes > MAX_SECRET_BYTES)) {
            throw new Error(`secret '${s.name}': bytes must be between ${MIN_SECRET_BYTES} and ${MAX_SECRET_BYTES} ` +
                `(got ${s.bytes})`);
        }
    }
    // A declared `pattern` must compile (issue LNVPS/api#271). Safe to enforce
    // here, where the operator also runs it, because the field is new: no
    // stored row can carry one that predates the rule.
    for (const f of compose.config) {
        if (f.pattern !== undefined) {
            try {
                compilePattern(f.pattern);
            }
            catch (e) {
                throw new Error(`config field '${f.name}': ${e.message}`);
            }
        }
        if (f.group !== undefined) {
            const group = f.group.trim();
            if (group.length === 0 || [...group].length > MAX_CONFIG_GROUP_LEN) {
                throw new Error(`config field '${f.name}': group must be 1-${MAX_CONFIG_GROUP_LEN} characters`);
            }
        }
    }
}
function requireFileField(compose, service, context, field) {
    const c = compose.config.find((cf) => cf.name === field);
    if (c === undefined) {
        throw new Error(`service '${service}': ${context} references unknown config field '${field}'`);
    }
    if (c.type !== "file") {
        throw new Error(`service '${service}': ${context} field '${field}' must be \`type: file\``);
    }
}
/** Whether a compose `user:` value means "start as root". */
function userIsRoot(user) {
    return user === "root" || user === "0";
}
/** The positive numeric UID a compose `user:` names, if it names one. */
function userUid(user) {
    if (!/^[+-]?\d+$/.test(user))
        return undefined;
    const uid = Number.parseInt(user, 10);
    // Rust parses into an i64 and treats overflow as "not a uid" (`Err` falls
    // through to `None`), rather than the closest representable value — a
    // digit string this long is never a real UID, so reject it the same way.
    return uid > 0 && Number.isSafeInteger(uid) ? uid : undefined;
}
/** Validate an in-container path: absolute, not root, no `..` traversal. */
function checkAbsNoTraversal(service, label, path) {
    if (!path.startsWith("/")) {
        throw new Error(`service '${service}': ${label} path '${path}' must be absolute`);
    }
    if (path === "/") {
        throw new Error(`service '${service}': ${label} path cannot be '/'`);
    }
    if (path.split("/").some((seg) => seg === "..")) {
        throw new Error(`service '${service}': ${label} path '${path}' must not contain '..'`);
    }
}
/** Validate a volume mount: name is a slug, path is absolute/non-traversal. */
function validateMountPath(service, name, path) {
    if (name.length === 0 || !/^[a-z0-9-]*$/.test(name)) {
        throw new Error(`service '${service}': volume name '${name}' must be a lowercase slug`);
    }
    checkAbsNoTraversal(service, "volume", path);
}
/**
 * Validate an init step's name as a DNS label: it becomes a container name,
 * which Kubernetes rejects outright if it is not one — and a rejected pod
 * spec is a deployment that never becomes ready, with the reason buried in
 * the operator's log rather than returned to whoever typed the name.
 */
function validateInitName(service, name) {
    if (name.length === 0 || utf8ByteLength(name) > 40) {
        throw new Error(`service '${service}': init name '${name}' must be 1–40 characters`);
    }
    if (!/^[a-z0-9-]*$/.test(name) || name.startsWith("-") || name.endsWith("-")) {
        throw new Error(`service '${service}': init name '${name}' must be lowercase letters, digits and ` +
            `hyphens (not leading or trailing)`);
    }
}
/** Whether `path` sits inside directory `dir` (both absolute). */
function pathIsWithin(path, dir) {
    const trimmed = dir.replace(/\/+$/, "");
    return path.startsWith(`${trimmed}/`);
}
/** Extract the `NAME`s referenced as `${NAME}` in a string. */
function extractRefs(s) {
    const out = [];
    const re = /\$\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        if (m[1].length > 0)
            out.push(m[1]);
    }
    return out;
}
/**
 * Check a `pattern` compiles as a fully-anchored regex, the same as the Rust
 * `regex` crate would.
 *
 * Anchoring is not the author's job: `npub1…` without `^…$` silently accepts
 * a value with junk on either end, and that is exactly the mistake that
 * produces a crashlooping deployment. The pattern is wrapped rather than
 * rewritten, so an author's own `^`/`$` stay valid and mean the same thing.
 *
 * Uses JS `RegExp`, not Rust's `regex` crate, so the two engines' feature
 * sets have to be reconciled by hand rather than by construction: `regex`
 * guarantees linear-time matching by supporting neither backreferences nor
 * lookaround (named groups, `(?<name>…)`, are fine — only the lookaround
 * spelling `(?<=…)`/`(?<!…)` collides with that prefix), so a pattern using
 * either compiles here but would fail at the admin API — rejected explicitly,
 * below, so a pattern this function accepts is one the admin API accepts too.
 */
function compilePattern(pattern) {
    if (pattern.trim().length === 0) {
        throw new Error("pattern is empty — omit it instead");
    }
    if (utf8ByteLength(pattern) > MAX_PATTERN_LEN) {
        throw new Error(`pattern must be at most ${MAX_PATTERN_LEN} characters`);
    }
    if (hasUnescapedBackreference(pattern)) {
        throw new Error(`pattern '${pattern}' is not a valid regex: backreferences are not supported`);
    }
    if (pattern.includes("(?=") ||
        pattern.includes("(?!") ||
        pattern.includes("(?<=") ||
        pattern.includes("(?<!")) {
        throw new Error(`pattern '${pattern}' is not a valid regex: lookaround is not supported`);
    }
    try {
        new RegExp(`^(?:${pattern})$`);
    }
    catch (e) {
        throw new Error(`pattern '${pattern}' is not a valid regex: ${e.message}`);
    }
}
/**
 * Whether `pattern` contains a `\` escape whose target is a digit (`\0`–
 * `\9`) — a backreference, or (with octal parsing off, the `regex` crate's
 * default) an error either way. Walks escape pairs rather than scanning for
 * `\` next to a digit directly: an escaped backslash (`\\`) followed by a
 * literal `1` is two tokens, not one, and compiles fine.
 */
function hasUnescapedBackreference(pattern) {
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === "\\") {
            if (/[0-9]/.test(pattern[i + 1] ?? ""))
                return true;
            i++; // the escaped character is consumed with the backslash, whatever it is
        }
    }
    return false;
}
/**
 * UTF-8 byte length of a string, matching Rust's `str::len()` (bytes, not
 * UTF-16 code units or Unicode scalar values). Counts per code point rather
 * than using `TextEncoder`, which is a DOM/runtime global this package's
 * build config deliberately does not assume (`tsconfig.build.json` compiles
 * with no ambient `types`, so consumers get output that assumes nothing
 * about which runtime loads it).
 */
function utf8ByteLength(s) {
    let bytes = 0;
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp <= 0x7f)
            bytes += 1;
        else if (cp <= 0x7ff)
            bytes += 2;
        else if (cp <= 0xffff)
            bytes += 3;
        else
            bytes += 4;
    }
    return bytes;
}
