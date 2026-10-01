// work/evidence/art-generation-review/page-retry-proof.ts
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// work/art-generation-consumer-v1/frozen-v1/client/src/render/art.ts
import { ImageSource, Rectangle, Texture } from "pixi.js";

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/errors.ts
var RuntimeError = class _RuntimeError extends Error {
  constructor(code, message, recoverable = true, details) {
    super(message);
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
    this.name = "RuntimeError";
  }
  code;
  recoverable;
  details;
  static from(value) {
    if (value instanceof _RuntimeError) return value;
    if (value && typeof value === "object" && "code" in value && "message" in value) {
      const v = value;
      return new _RuntimeError(String(v.code), String(v.message), v.recoverable !== false, value);
    }
    return new _RuntimeError("runtime_failed", value instanceof Error ? value.message : String(value), false);
  }
};

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/crypto.ts
var constants = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotate(value, bits) {
  return value >>> bits | value << 32 - bits;
}
function hex(bytes2) {
  return Array.from(bytes2, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function copy(data) {
  if (!(data instanceof Uint8Array)) throw new RuntimeError("hash_input", "Hash input must be bytes.");
  return data.slice();
}
async function fallback(data) {
  const state = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]), words = new Uint32Array(64);
  const process = (block, offset) => {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      words[i] = block[at] << 24 | block[at + 1] << 16 | block[at + 2] << 8 | block[at + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2], s0 = rotate(x, 7) ^ rotate(x, 18) ^ x >>> 3, s1 = rotate(y, 17) ^ rotate(y, 19) ^ y >>> 10;
      words[i] = words[i - 16] + s0 + words[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25), choice = e & f ^ ~e & g, t1 = h + sigma1 + choice + constants[i] + words[i] >>> 0;
      const sigma0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22), majority = a & b ^ a & c ^ b & c, t2 = sigma0 + majority >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    state[0] = state[0] + a >>> 0;
    state[1] = state[1] + b >>> 0;
    state[2] = state[2] + c >>> 0;
    state[3] = state[3] + d >>> 0;
    state[4] = state[4] + e >>> 0;
    state[5] = state[5] + f >>> 0;
    state[6] = state[6] + g >>> 0;
    state[7] = state[7] + h >>> 0;
  };
  const fullLength = data.length - data.length % 64;
  for (let offset = 0; offset < fullLength; offset += 64) {
    process(data, offset);
    if (offset > 0 && offset % (256 * 1024) === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const remaining = data.length - fullLength, tail = new Uint8Array(remaining < 56 ? 64 : 128);
  tail.set(data.subarray(fullLength));
  tail[remaining] = 128;
  const length = new DataView(tail.buffer);
  length.setUint32(tail.length - 8, Math.floor(data.length / 536870912), false);
  length.setUint32(tail.length - 4, data.length * 8 >>> 0, false);
  for (let offset = 0; offset < tail.length; offset += 64) process(tail, offset);
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
async function sha256Hex(data) {
  const bytes2 = copy(data), subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      return hex(new Uint8Array(await subtle.digest("SHA-256", bytes2.buffer)));
    } catch {
    }
  }
  return fallback(bytes2);
}

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/content-library.ts
var LIMITS = { index: 1 << 20, map: 16 << 20, mission: 2 << 20 };
var factions = ["US", "IR", "SY", "SA"];
var fail = (message) => {
  throw new RuntimeError("content_index_invalid", message);
};
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var identifier = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value);
var plain = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\p{Cc}\p{Cf}]/u.test(value);
function shape(value, required, optional = []) {
  if (!object(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) fail("The content index contains missing or unsupported fields.");
}
function staticPath(value, prefix) {
  if (typeof value !== "string" || value.length > 240 || !/^\/(?:content|assets)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(value) || value.includes("//") || value.split("/").some((segment) => segment === "." || segment === "..") || prefix && !value.startsWith(prefix)) return false;
  return true;
}
function array(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} exceeds its supported index size.`);
  return value;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate entries.`);
}
function dependencies(value, packs) {
  const values = array(value, 32, "Pack references");
  if (values.some((id) => !identifier(id) || !packs.has(id))) fail("A required pack is undeclared.");
  unique(values, "Pack references");
}
function file(value, kind, packs) {
  if (!identifier(value.id) || !identifier(value.version) || !plain(value.title, 100) || !staticPath(value.url, kind === "map" ? "/content/maps/" : "/content/missions/") || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 1 || Number(value.bytes) > LIMITS[kind]) fail(`A ${kind} index entry has invalid identity, metadata, path, checksum or size.`);
  dependencies(value.required_packs, packs);
}
function decodeContentIndex(source) {
  if (!(source instanceof Uint8Array) || source.byteLength > LIMITS.index) fail("The content index exceeds 1 MiB.");
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source));
  } catch {
    fail("The content index is not valid UTF-8 JSON.");
  }
  shape(data, ["format_version", "version", "packs", "maps", "missions"]);
  if (data.format_version !== 1) throw new RuntimeError("content_index_incompatible", "Keep this index for the matching game version.");
  if (!identifier(data.version)) fail("The content index version is invalid.");
  const packs = array(data.packs, 32, "Packs"), maps = array(data.maps, 64, "Maps"), missions = array(data.missions, 128, "Missions");
  for (const pack of packs) {
    shape(pack, ["id", "version", "manifest_url"]);
    if (!identifier(pack.id) || !identifier(pack.version) || !staticPath(pack.manifest_url)) fail("A pack reference is invalid.");
  }
  unique(packs.map((p) => p.id), "Packs");
  unique(packs.map((p) => p.manifest_url), "Pack manifests");
  const packIDs = new Set(packs.map((p) => p.id));
  const fields = ["id", "version", "title", "url", "sha256", "bytes", "required_packs"];
  for (const map of maps) {
    shape(map, [...fields, "author", "players", "kind"], ["environment"]);
    file(map, "map", packIDs);
    if (!plain(map.author, 100) || !Number.isInteger(map.players) || Number(map.players) < 1 || Number(map.players) > 4 || !["skirmish", "scenario"].includes(String(map.kind))) fail("A map index entry has invalid author, player count or kind.");
    if (map.environment !== void 0) {
      shape(map.environment, ["url", "sha256", "bytes"]);
      const env = map.environment;
      if (!staticPath(env.url, "/content/environment/") || typeof env.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(env.sha256) || !Number.isSafeInteger(env.bytes) || Number(env.bytes) < 1 || Number(env.bytes) > 1 << 20) fail("A map environment entry has an invalid path, checksum or size.");
    }
  }
  unique(maps.map((m) => m.id), "Maps");
  const mapIDs = new Set(maps.map((m) => m.id));
  for (const mission of missions) {
    shape(mission, [...fields, "map_id", "mode", "faction", "order"], ["presentation_url"]);
    file(mission, "mission", packIDs);
    if (!identifier(mission.map_id) || !mapIDs.has(mission.map_id) || !["tutorial", "campaign", "coop"].includes(String(mission.mode)) || !factions.includes(String(mission.faction)) || !Number.isInteger(mission.order) || Number(mission.order) < 1 || Number(mission.order) > (mission.mode === "campaign" ? 6 : mission.mode === "tutorial" ? 5 : 2) || mission.presentation_url !== void 0 && !staticPath(mission.presentation_url)) fail("A mission index entry has an invalid map, mode, faction, story order or presentation path.");
  }
  unique(missions.map((m) => m.id), "Missions");
  unique(missions.map((m) => {
    const v = m;
    return `${v.mode}:${v.mode === "campaign" ? v.faction : "all"}:${v.order}`;
  }), "Mission order");
  unique([...maps, ...missions].map((v) => v.url), "Content file paths");
  return structuredClone(data);
}

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/cache.ts
var PACK_PREFIX = "frontline-pack-v1:";
var READY_PATH = "/__frontline_pack_ready__";
var MANIFEST_PATH = "/__frontline_pack_manifest__";

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/asset-generation.ts
var MAX_MANIFEST = 4 << 20;
var MAX_FILE = 128 << 20;
var MAX_TOTAL = 2 * 1024 ** 3;
function fail2(code, message) {
  throw new RuntimeError(code, message);
}
var canceled = (signal) => {
  if (signal?.aborted) fail2("asset_canceled", "The asset load was canceled.");
};
var object2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function pathOf(value) {
  if (typeof value !== "string" || value.length > 512 || !/^\/[A-Za-z0-9_.@~/-]+$/.test(value) || value.includes("//") || value.split("/").some((x) => x === "." || x === "..") || (value === "/api" || value.startsWith("/api/")) || value === READY_PATH || value === MANIFEST_PATH) fail2("asset_path", "Choose a declared same-origin public asset path.");
  return value;
}
async function bytes(response, maximum, signal) {
  canceled(signal);
  if (!response.ok || response.redirected) fail2("asset_unavailable", "The requested asset response is unavailable.");
  const length = response.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) fail2("asset_size", "The asset response exceeds its allowed size.");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let count = 0;
  const abort = () => {
    void reader.cancel().catch(() => {
    });
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (; ; ) {
      canceled(signal);
      const value = await reader.read();
      canceled(signal);
      if (value.done) break;
      count += value.value.byteLength;
      if (count > maximum) {
        void reader.cancel().catch(() => {
        });
        fail2("asset_size", "The asset response exceeds its allowed size.");
      }
      chunks.push(value.value);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const joined = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}
function parse(source) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source));
  } catch {
    fail2("asset_manifest_invalid", "The asset metadata is not valid UTF-8 JSON.");
  }
}
function manifest(source) {
  const data = parse(source);
  if (!object2(data) || Object.keys(data).some((k) => !["id", "version", "files"].includes(k)) || typeof data.id !== "string" || typeof data.version !== "string" || !Array.isArray(data.files) || data.files.length < 1 || data.files.length > 16e3) fail2("asset_manifest_invalid", "The asset manifest is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.version)) fail2("asset_manifest_invalid", "The asset manifest identity is invalid.");
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  const files = data.files.map((value) => {
    if (!object2(value) || Object.keys(value).some((k) => !["path", "sha256", "bytes"].includes(k)) || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 0 || Number(value.bytes) > MAX_FILE) fail2("asset_manifest_invalid", "An asset descriptor is invalid.");
    const path = pathOf(value.path);
    if (seen.has(path)) fail2("asset_manifest_invalid", "An asset descriptor is duplicated.");
    seen.add(path);
    total += Number(value.bytes);
    return Object.freeze({ path, sha256: value.sha256, bytes: Number(value.bytes) });
  });
  if (total > MAX_TOTAL) fail2("asset_manifest_invalid", "The asset manifest is too large.");
  return { id: data.id, version: data.version, files };
}
async function captureAssetGeneration(indexSource, packId, options = {}) {
  const indexBytes = indexSource.slice(), index = decodeContentIndex(indexBytes), descriptor = index.packs.find((p) => p.id === packId);
  if (!descriptor) fail2("asset_identity", "The requested asset pack is absent from this content index.");
  const base = new URL(options.origin ?? globalThis.location?.origin ?? "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) fail2("asset_origin", "Choose the game origin without credentials or a path.");
  const origin = base.origin, fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis), storage = options.cacheStorage ?? globalThis.caches;
  const lifetime = new AbortController(), combined = (signal) => AbortSignal.any([lifetime.signal, ...options.signal ? [options.signal] : [], ...signal ? [signal] : []]);
  const initialSignal = combined();
  canceled(initialSignal);
  let bound;
  const present = async (name) => !!storage && (await storage.keys()).includes(name);
  const ready = async () => {
    if (!storage) return;
    const names = (await storage.keys()).filter((n) => n.startsWith(PACK_PREFIX));
    if (names.length > 128) fail2("asset_cache_limit", "Too many cached generations to inspect safely.");
    const candidates = [];
    for (const name of names) {
      canceled(initialSignal);
      if (!await present(name)) continue;
      const cache = await storage.open(name), response = await cache.match(READY_PATH);
      if (!response) continue;
      let value;
      try {
        value = parse(await bytes(response, 4096, initialSignal));
      } catch {
        continue;
      }
      if (!object2(value) || value.id !== descriptor.id || value.version !== descriptor.version || !Number.isSafeInteger(value.installedAt) || Number(value.installedAt) < 0 || !Number.isSafeInteger(value.files) || Number(value.files) < 1 || Number(value.files) > 16e3) continue;
      const metadata = value.metadataFiles ?? 0;
      if (metadata !== 0 && metadata !== 1) continue;
      if (metadata === 1 && (typeof value.manifestSHA256 !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestSHA256))) continue;
      if ((await cache.keys()).length < Number(value.files) + 1 + Number(metadata)) continue;
      candidates.push({ name, installedAt: Number(value.installedAt), files: Number(value.files), metadataFiles: Number(metadata), ...typeof value.manifestSHA256 === "string" ? { manifestSHA256: value.manifestSHA256 } : {} });
    }
    return candidates.sort((a, b) => b.installedAt - a.installedAt || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
  };
  const network = async (path, maximum2, signal) => {
    canceled(signal);
    signal = AbortSignal.any([signal, AbortSignal.timeout(15e3)]);
    let response;
    try {
      response = await fetcher(new URL(path, origin), { credentials: "omit", redirect: "error", cache: "no-store", signal });
    } catch (error) {
      canceled(signal);
      throw new RuntimeError("asset_unavailable", "The exact asset generation is unavailable. Reconnect to its matching host or reinstall that generation.", true, error);
    }
    if (response.url && new URL(response.url).origin !== origin) fail2("asset_origin", "The asset response came from another origin.");
    return bytes(response, maximum2, signal);
  };
  bound = await ready();
  let manifestBytes;
  if (bound) {
    if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed.");
    const cache = await storage.open(bound.name), response = await cache.match(MANIFEST_PATH);
    if (response) {
      manifestBytes = await bytes(response, MAX_MANIFEST, initialSignal);
      if (bound.manifestSHA256 && await sha256Hex(manifestBytes) !== bound.manifestSHA256) fail2("asset_integrity", "The cached manifest failed its integrity check.");
    } else if (bound.metadataFiles) fail2("asset_generation_unavailable", "The completed generation is missing its manifest.");
  }
  manifestBytes ??= await network(descriptor.manifest_url, MAX_MANIFEST, initialSignal);
  const pack = manifest(manifestBytes), indexSHA256 = await sha256Hex(indexBytes), manifestSHA256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(pack)));
  canceled(initialSignal);
  if (pack.id !== descriptor.id || pack.version !== descriptor.version) fail2("asset_identity", "The pack manifest differs from the captured content index.");
  const byPath = new Map(pack.files.map((f) => [f.path, f])), indexFile = byPath.get("/content/index.json");
  if (!indexFile || indexFile.bytes !== indexBytes.length || indexFile.sha256 !== indexSHA256) fail2("asset_identity", "The manifest does not describe the exact captured content index.");
  if (bound && bound.files !== pack.files.length) fail2("asset_identity", "The completed cache does not match its captured manifest.");
  const identity = Object.freeze({ id: pack.id, version: pack.version, indexSHA256, manifestSHA256, key: `${pack.id}:${pack.version}:${manifestSHA256}` });
  let disposed = false, inFlight = 0, inFlightBytes = 0, leaseBytes = 0;
  const leases = /* @__PURE__ */ new Map(), maximum = options.maxLeaseBytes ?? 64 << 20;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 256 << 20) fail2("asset_limit", "The decoded asset lease limit is invalid.");
  const waiting = [];
  const pump = () => {
    while (!disposed && waiting.length && inFlight < 4 && inFlightBytes + waiting[0].bytes <= MAX_FILE) {
      const job = waiting.shift();
      job.signal.removeEventListener("abort", job.abort);
      inFlight++;
      inFlightBytes += job.bytes;
      job.start();
    }
  };
  const acquire = (size, signal) => {
    canceled(signal);
    if (waiting.length >= 64) fail2("asset_busy", "The bounded asset request queue is full.");
    return new Promise((resolve, reject) => {
      const job = { bytes: size, signal, start: resolve, abort: () => {
        const index2 = waiting.indexOf(job);
        if (index2 < 0) return;
        waiting.splice(index2, 1);
        signal.removeEventListener("abort", job.abort);
        reject(new RuntimeError("asset_canceled", "The queued asset load was canceled."));
        pump();
      } };
      waiting.push(job);
      signal.addEventListener("abort", job.abort, { once: true });
      if (signal.aborted) job.abort();
      else pump();
    });
  };
  const file2 = (path) => {
    const f = byPath.get(pathOf(path));
    if (!f) fail2("asset_unknown", "The asset is not declared by the captured manifest.");
    return f;
  };
  const live = (signal) => {
    canceled(combined(signal));
    if (disposed) fail2("asset_canceled", "The asset generation was disposed.");
  };
  const key = (path) => {
    const f = file2(path);
    return `${identity.key}:${f.path}:${f.sha256}`;
  };
  const read = async (path, signal) => {
    live(signal);
    const f = file2(path), active = combined(signal);
    await acquire(f.bytes, active);
    try {
      if (!bound) bound = await ready();
      let data;
      if (bound) {
        if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed.");
        const cache = await storage.open(bound.name), response = await cache.match(new URL(f.path, origin).href);
        if (!response) fail2("asset_generation_unavailable", "The selected generation is missing a required asset.");
        data = await bytes(response, f.bytes, active);
        if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed during loading.");
      } else data = await network(f.path, f.bytes, active);
      live(signal);
      if (data.length !== f.bytes || await sha256Hex(data) !== f.sha256) fail2("asset_integrity", "The asset bytes differ from the captured generation.");
      live(signal);
      return data;
    } finally {
      inFlight--;
      inFlightBytes -= f.bytes;
      pump();
    }
  };
  const lease = async (path, signal) => {
    live(signal);
    const f = file2(path), cacheKey = key(path);
    let entry = leases.get(cacheKey);
    if (!entry) {
      const data = await read(path, signal);
      live(signal);
      entry = leases.get(cacheKey);
      if (!entry) {
        if (leaseBytes + data.length > maximum) fail2("asset_memory", "Release unused asset leases before loading more pages.");
        const suffix = path.slice(path.lastIndexOf(".")), type = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".json": "application/json", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wasm": "application/wasm" }[suffix] ?? "application/octet-stream";
        entry = { url: URL.createObjectURL(new Blob([new Uint8Array(data).buffer], { type })), bytes: data.length, refs: 0 };
        leases.set(cacheKey, entry);
        leaseBytes += data.length;
      }
    }
    entry.refs++;
    let released = false;
    const retained = entry;
    return Object.freeze({ url: entry.url, key: cacheKey, release() {
      if (released) return;
      released = true;
      retained.refs--;
      if (retained.refs === 0 && leases.get(cacheKey) === retained) {
        URL.revokeObjectURL(retained.url);
        leaseBytes -= retained.bytes;
        leases.delete(cacheKey);
      }
    } });
  };
  return Object.freeze({ identity, key, read, json: async (path, signal) => parse(await read(path, signal)), lease, get statistics() {
    return Object.freeze({ inFlight, inFlightBytes, queued: waiting.length, leases: leases.size, leaseBytes, disposed });
  }, dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    for (const entry of leases.values()) URL.revokeObjectURL(entry.url);
    leases.clear();
    leaseBytes = 0;
  } });
}

// work/art-generation-consumer-v1/frozen-v1/client/src/runtime/asset-generation-input.ts
async function artGenerationInput(fetcher = globalThis.fetch.bind(globalThis), source, signal) {
  if (!source) {
    const active = AbortSignal.any([AbortSignal.timeout(15e3), ...signal ? [signal] : []]);
    const response = await fetcher("/content/index.json", { credentials: "omit", redirect: "error", cache: "no-store", signal: active });
    if (!response.ok || response.redirected || !response.body) throw new RuntimeError("asset_index_unavailable", "The matching game content index is unavailable.");
    const chunks = [], reader = response.body.getReader();
    let size = 0;
    const abort = () => {
      void reader.cancel().catch(() => {
      });
    };
    active.addEventListener("abort", abort, { once: true });
    try {
      for (; ; ) {
        active.throwIfAborted();
        const { done, value } = await reader.read();
        active.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > 1 << 20) throw new RuntimeError("asset_index_size", "The game content index exceeds its supported size.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {
      });
      throw error;
    } finally {
      active.removeEventListener("abort", abort);
      reader.releaseLock();
    }
    source = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      source.set(chunk, offset);
      offset += chunk.length;
    }
  }
  const bytes2 = source.slice(), index = decodeContentIndex(bytes2), pack = index.packs.find((pack2) => pack2.manifest_url === "/assets/packs/base.json");
  if (!pack) throw new RuntimeError("asset_index_missing", "The captured index does not declare the game art pack.");
  return { source: bytes2, packId: pack.id };
}

// work/art-generation-consumer-v1/frozen-v1/client/src/content/catalog.ts
var AIR_ROLES = /* @__PURE__ */ new Set(["fighter", "strike", "gunship", "airlift", "isr", "scout_drone"]);
function classify(u) {
  if (u.armor === "infantry") return "infantry";
  if (AIR_ROLES.has(u.role)) return u.faction === "IR" || u.role === "scout_drone" ? "drone" : u.role === "gunship" || u.role === "airlift" ? "rotor" : "aircraft";
  if (u.role === "tank") return "tank";
  if (["rig", "hauler", "repair"].includes(u.role)) return "support";
  return "vehicle";
}

// work/art-generation-consumer-v1/frozen-v1/client/src/render/art-id.ts
var BUILDING_SKINS = { hq: "hq", power: "power", supply: "supply", barracks: "barracks", factory: "factory", radar: "radar", tech: "tech", depot: "repair_depot", outpost: "outpost", bunker: "bunker", turret: "gun_turret", aa_post: "aa_post", abm: "interceptor_battery", strategic: "strategic_site" };
var SPECIAL_BUILDINGS = { "US.airfield": "US.airfield", "IR.drone_hub": "IR.drone_hub", "SY.workshop_air": "SY.air_workshop", "SA.airfield": "SA.airfield", "SY.safehouse": "SY.safehouse" };
var OBJECT_SKINS = { light_prop: "destructible_wall_hp_light", heavy_prop: "destructible_wall_hp_heavy", garrison: "warehouse_garrisonable", energy_station: "supply_station_neutral" };
function authoredArtId(type, ownerFaction) {
  const special = SPECIAL_BUILDINGS[type];
  if (special) return `building.${special}`;
  if (/^(US|IR|SY|SA)\./.test(type)) return `unit.${type}`;
  if (type.startsWith("map.")) {
    const role = type.slice(4);
    return `prop.${OBJECT_SKINS[role] ?? role}`;
  }
  const skin = BUILDING_SKINS[type];
  return skin && ownerFaction && ["US", "IR", "SY", "SA"].includes(ownerFaction) ? `building.${ownerFaction}.${skin}` : void 0;
}

// work/art-generation-consumer-v1/frozen-v1/client/src/content/art-ui.ts
function artUIKeys(index, id) {
  if (!id || id.length >= 240 || id.includes("..") || !/^[A-Za-z0-9_.@-]+$/.test(id)) throw Error(`Invalid battlefield UI asset: ${id}`);
  const legacy = id.replace(/^(unit|building)\./, "");
  const advertised = (keys) => keys?.includes(id) ? id : legacy && keys?.includes(legacy) ? legacy : void 0;
  return { portrait: advertised(index.portraits), build: advertised(index.buildIcons) };
}

// work/art-generation-consumer-v1/frozen-v1/client/src/render/alpha-picking.ts
function makeAlphaMask(width, height, rgba) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(width * height) || rgba.length !== width * height * 4) throw Error("Invalid atlas pixel data");
  const bits = new Uint8Array(Math.ceil(width * height / 8));
  for (let index = 0; index < width * height; index++) if (rgba[index * 4 + 3] !== 0) bits[index >> 3] |= 1 << (index & 7);
  return { width, height, bits };
}
function alphaInFrame(mask, frame, x, y, tolerance) {
  if (![x, y, tolerance].every(Number.isFinite) || tolerance < 0) return false;
  const left = Math.max(0, Math.floor(x - tolerance)), right = Math.min(frame.w - 1, Math.floor(x + tolerance)), top = Math.max(0, Math.floor(y - tolerance)), bottom = Math.min(frame.h - 1, Math.floor(y + tolerance));
  if (left > right || top > bottom) return false;
  for (let py = top; py <= bottom; py++) {
    const first = (frame.y + py) * mask.width + frame.x + left, last = (frame.y + py) * mask.width + frame.x + right;
    for (let byte = first >> 3; byte <= last >> 3; byte++) {
      const lo = byte === first >> 3 ? first & 7 : 0, hi = byte === last >> 3 ? last & 7 : 7;
      if (mask.bits[byte] & (255 << lo & 255 >>> 7 - hi)) return true;
    }
  }
  return false;
}

// work/art-generation-consumer-v1/frozen-v1/client/src/render/art.ts
var SpriteSheet = class {
  constructor(id, meta2, scale, pages, loadPage = async () => {
    throw Error("Verified sprite-page loader unavailable.");
  }, onError) {
    this.id = id;
    this.meta = meta2;
    this.scale = scale;
    this.pages = pages;
    this.loadPage = loadPage;
    this.onError = onError;
    for (const state of meta2.states) this.states.set(state.name, state);
    for (let pass = 0; pass < (meta2.aliases?.length ?? 0); pass++) for (const alias of meta2.aliases ?? []) {
      const source = this.states.get(alias.source);
      if (!source || this.states.has(alias.name)) continue;
      this.states.set(alias.name, { ...source, name: alias.name, progress_driven: alias.progress_driven ?? source.progress_driven });
      this.aliases.set(alias.name, alias);
    }
    for (const page2 of pages) for (const key of Object.keys(page2.descriptors)) this.lookup.set(`${page2.layer}|${key}`, page2);
  }
  id;
  meta;
  scale;
  pages;
  loadPage;
  onError;
  states = /* @__PURE__ */ new Map();
  lookup = /* @__PURE__ */ new Map();
  disposed = false;
  aliases = /* @__PURE__ */ new Map();
  lifetime = new AbortController();
  /** Screen scale that converts this atlas to 1× world pixels. */
  get pixelScale() {
    return this.scale === "2x" ? 0.5 : 1;
  }
  get statistics() {
    return { indexedPages: this.pages.length, residentPages: this.pages.filter((page2) => page2.texture).length, residentBytes: this.pages.reduce((sum, page2) => sum + (page2.texture ? page2.bytes : 0), 0), pickingBytes: this.pages.reduce((sum, page2) => sum + (page2.alpha?.bits.byteLength ?? 0), 0) };
  }
  key(layer, state, direction, index) {
    return `${layer}|${state}/d${String(direction).padStart(2, "0")}_f${String(index).padStart(2, "0")}`;
  }
  sourceFrame(state, direction, index) {
    for (let depth = 0; depth < this.aliases.size; depth++) {
      const alias = this.aliases.get(state);
      if (!alias) break;
      const source = this.states.get(alias.source);
      if (alias.reverse) index = source.frames - 1 - index;
      state = alias.source;
    }
    return { state, direction, index };
  }
  hasFrame(layer, state, direction, index) {
    const source = this.sourceFrame(state, direction, index);
    return this.lookup.has(this.key(layer, source.state, source.direction, source.index));
  }
  frame(layer, state, direction, index) {
    const source = this.sourceFrame(state, direction, index), key = this.key(layer, source.state, source.direction, source.index), page2 = this.lookup.get(key);
    if (!page2 || this.disposed) return;
    page2.lastUsed = performance.now();
    if (!page2.texture) this.load(page2);
    return page2.frames.get(key);
  }
  has(state) {
    return this.states.has(state);
  }
  load(page2) {
    if (page2.pending || page2.failed || this.disposed) return;
    page2.pending = (async () => {
      await page2.unloading;
      if (this.disposed) return;
      const generation = ++page2.generation, owned = await this.loadPage(page2.url, this.lifetime.signal);
      if (this.disposed) {
        owned.dispose();
        return;
      }
      const texture = owned.texture;
      page2.owned = owned;
      page2.texture = texture;
      page2.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
      if (page2.layer === "beauty" || page2.layer === "team") {
        const canvas = document.createElement("canvas");
        canvas.width = texture.source.pixelWidth;
        canvas.height = texture.source.pixelHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw Error("Atlas picking context unavailable");
        context.drawImage(texture.source.resource, 0, 0);
        page2.alpha = makeAlphaMask(canvas.width, canvas.height, context.getImageData(0, 0, canvas.width, canvas.height).data);
        canvas.width = canvas.height = 0;
      }
      for (const [key, frame] of Object.entries(page2.descriptors)) {
        const t = new Texture({ source: texture.source, frame: new Rectangle(frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h) });
        const ink = frame.ink_bounds, anchorY = frame.anchor?.y ?? 0.5;
        const valid = ink && [ink.x, ink.y, ink.w, ink.h].every(Number.isInteger) && ink.x >= 0 && ink.y >= 0 && ink.w > 0 && ink.h > 0 && ink.x + ink.w <= frame.frame.w && ink.y + ink.h <= frame.frame.h;
        page2.frames.set(`${page2.layer}|${key}`, { texture: t, atlasTexture: texture, anchorX: frame.anchor?.x ?? 0.5, anchorY, ...page2.alpha ? { containsAlpha: (x, y, tolerance) => page2.generation === generation && !!page2.alpha && alphaInFrame(page2.alpha, frame.frame, x, y, tolerance) } : {}, ...valid ? { bodyBottom: (ink.y + ink.h - anchorY * frame.frame.h) * this.pixelScale, inkBounds: ink } : {} });
      }
    })().catch(async (error) => {
      page2.failed = true;
      page2.generation++;
      page2.alpha = void 0;
      for (const frame of page2.frames.values()) frame.texture.destroy(false);
      page2.frames.clear();
      page2.texture = void 0;
      page2.owned?.dispose();
      page2.owned = void 0;
      if (!this.disposed) {
        this.onError?.(error instanceof Error ? error : new Error(String(error)));
        console.warn("Sprite page failed to load", this.id, page2.url, error);
      }
    }).finally(() => {
      page2.pending = void 0;
    });
  }
  async settle() {
    await Promise.all(this.pages.map((page2) => page2.pending));
  }
  unload(page2) {
    if (page2.pending || !page2.texture) return;
    page2.generation++;
    page2.alpha = void 0;
    for (const frame of page2.frames.values()) frame.texture.destroy(false);
    page2.frames.clear();
    page2.texture = void 0;
    page2.owned?.dispose();
    page2.owned = void 0;
  }
  evictBefore(before) {
    for (const page2 of this.pages) if (page2.lastUsed < before) this.unload(page2);
  }
  async dispose() {
    this.disposed = true;
    this.lifetime.abort();
    await this.settle();
    for (const page2 of this.pages) this.unload(page2);
    await Promise.all(this.pages.map((page2) => page2.unloading));
  }
};
var ArtLibrary = class {
  constructor(options = {}) {
    this.options = options;
    this.generation = options.generation;
  }
  options;
  index;
  onError;
  generation;
  initialization;
  binding = Promise.resolve();
  epoch = 0;
  closed = false;
  lifetime = new AbortController();
  get generationIdentity() {
    return this.generation?.identity;
  }
  get generationStatistics() {
    return this.generation?.statistics;
  }
  fetch = async (input, init) => {
    await this.init();
    const request = input instanceof Request ? input : void 0, url = new URL(request?.url ?? String(input), this.options.origin ?? location.origin), method = init?.method ?? request?.method ?? "GET";
    if (method !== "GET" || url.origin !== new URL(this.options.origin ?? location.origin).origin || url.search || url.hash || url.username || url.password) throw Error("Only a declared same-origin asset GET is allowed.");
    const bytes2 = await this.generation.read(url.pathname, init?.signal ?? request?.signal ?? void 0), type = url.pathname.endsWith(".png") ? "image/png" : url.pathname.endsWith(".json") ? "application/json" : "application/octet-stream";
    return new Response(new Uint8Array(bytes2).buffer, { status: 200, headers: { "Content-Type": type, "Content-Length": String(bytes2.length) } });
  };
  sheets = /* @__PURE__ */ new Map();
  images = /* @__PURE__ */ new Map();
  cameos = /* @__PURE__ */ new Map();
  scale = "1x";
  releaseWork = Promise.resolve();
  loaded = /* @__PURE__ */ new Set();
  configure(quality) {
    this.scale = quality === "high" ? "2x" : "1x";
  }
  get statistics() {
    return [...this.loaded].reduce((sum, sheet2) => {
      const next = sheet2.statistics;
      return { indexedPages: sum.indexedPages + next.indexedPages, residentPages: sum.residentPages + next.residentPages, residentBytes: sum.residentBytes + next.residentBytes, pickingBytes: sum.pickingBytes + next.pickingBytes };
    }, { indexedPages: 0, residentPages: 0, residentBytes: 0, pickingBytes: 0 });
  }
  async settle() {
    await Promise.all([...this.loaded].map((sheet2) => sheet2.settle()));
  }
  /** Keep current on-screen frames; reclaim animations unused for ten seconds. */
  trim() {
    const budget = this.scale === "2x" ? 384 * 1024 * 1024 : 192 * 1024 * 1024;
    if (this.statistics.residentBytes > budget) for (const sheet2 of this.loaded) sheet2.evictBefore(performance.now() - 1e4);
  }
  captureOptions() {
    return { ...this.options, signal: AbortSignal.any([this.lifetime.signal, ...this.options.signal ? [this.options.signal] : []]) };
  }
  async init() {
    if (this.closed) throw new DOMException("Art library was disposed.", "AbortError");
    if (this.index) return this.index;
    if (this.initialization) return this.initialization;
    const epoch = this.epoch;
    const work = (async () => {
      let generation = this.generation;
      try {
        if (!generation) {
          const input = await artGenerationInput(this.options.fetcher, this.options.indexSource, this.captureOptions().signal);
          generation = await captureAssetGeneration(input.source, input.packId, this.captureOptions());
        }
        const index = await generation.json("/art/index.json");
        if (epoch !== this.epoch) {
          generation.dispose();
          throw new DOMException("Art generation was replaced.", "AbortError");
        }
        this.generation = generation;
        this.index = index;
        return index;
      } catch (error) {
        if (epoch === this.epoch) {
          generation?.dispose();
          this.generation = void 0;
          this.initialization = void 0;
        }
        throw error;
      }
    })();
    this.initialization = work;
    return work;
  }
  /** Called only at the application's explicit idle content-reload boundary. A
   * failed candidate keeps the previous index, pixels and generation available. */
  useIndex(source, isCurrent = () => true) {
    const captured = source.slice();
    let result;
    const work = this.binding.then(async () => {
      if (this.closed || !isCurrent()) throw new DOMException("Content reload is no longer idle.", "AbortError");
      if (this.generation?.identity.indexSHA256 === await sha256Hex(captured)) {
        result = await this.init();
        return;
      }
      const input = await artGenerationInput(this.options.fetcher, captured, this.captureOptions().signal), next = await captureAssetGeneration(input.source, input.packId, this.captureOptions());
      let index;
      try {
        index = await next.json("/art/index.json");
        await this.release();
      } catch (error) {
        next.dispose();
        throw error;
      }
      if (this.closed || !isCurrent()) {
        next.dispose();
        throw new DOMException("Content reload is no longer idle.", "AbortError");
      }
      const previous = this.generation;
      this.epoch++;
      this.clearImages();
      this.generation = next;
      this.index = index;
      this.initialization = Promise.resolve(index);
      previous?.dispose();
      result = index;
    });
    this.binding = work.catch(() => {
    });
    return work.then(() => result);
  }
  clearImages() {
    const images = this.images;
    this.images = /* @__PURE__ */ new Map();
    this.cameos.clear();
    for (const image of images.values()) void image.then((value) => {
      value.src = "";
    }).catch(() => {
    });
  }
  async page(path, signal, generation) {
    const bytes2 = await generation.read(path, signal);
    signal.throwIfAborted();
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes2).buffer], { type: "image/png" }));
    if (signal.aborted || generation.statistics.disposed) {
      bitmap.close();
      throw new DOMException("Sprite loading was canceled.", "AbortError");
    }
    let texture;
    try {
      texture = new Texture({ source: new ImageSource({ resource: bitmap, resolution: 1 }) });
    } catch (error) {
      bitmap.close();
      throw error;
    }
    let closed = false;
    return { texture, dispose() {
      if (closed) return;
      closed = true;
      texture.destroy(true);
      bitmap.close();
    } };
  }
  has(id) {
    return !!this.index?.sprites[id];
  }
  /** Resolve the authored sprite for an entity type, with an explicit stand-in flag. */
  resolve(type, ownerFaction, catalog) {
    const direct = this.directId(type, ownerFaction);
    if (direct && this.has(direct)) return { id: direct, standIn: false };
    const standIn = this.standIn(type, ownerFaction, catalog);
    return standIn ? { id: standIn, standIn: true } : void 0;
  }
  directId(type, ownerFaction) {
    return authoredArtId(type, ownerFaction);
  }
  standIn(type, faction, catalog) {
    const u = catalog?.units.get(type);
    const pick = (...ids) => ids.find((id) => this.has(id));
    if (u) {
      const c = classify(u);
      if (c === "infantry") return pick(`unit.${u.faction}.rifle`, "unit.US.rifle", "unit.SY.rifle", "unit.IR.rifle", "unit.SA.rifle");
      if (c === "aircraft" || c === "drone" || c === "rotor") return pick(`unit.${u.faction}.strike`, "unit.IR.strike", "unit.US.fighter");
      if (c === "tank") return pick(`unit.${u.faction}.tank`, "unit.US.tank", "unit.SA.tank");
      if (u.role === "mobile_abm" || u.role === "launcher" || u.role === "artillery") return pick(`unit.${u.faction}.${u.role}`, "unit.SA.mobile_abm", "unit.US.tank");
      return pick(`unit.${u.faction}.car`, "unit.SY.car", "unit.US.car", "unit.US.tank");
    }
    if (catalog?.buildings.has(type) || faction) return void 0;
    return void 0;
  }
  sheet(id) {
    const scale = this.scale, key = `${this.epoch}|${id}|${scale}`;
    let p = this.sheets.get(key);
    if (!p) {
      p = this.loadSheet(id, scale, this.epoch).catch((error) => {
        if (!this.closed && !(error instanceof DOMException && error.name === "AbortError")) {
          this.onError?.(error instanceof Error ? error : new Error(String(error)));
          console.warn("Sprite failed to load", id, error);
        }
        return void 0;
      });
      this.sheets.set(key, p);
    }
    return p;
  }
  async loadSheet(id, requestedScale, requestEpoch) {
    await this.releaseWork;
    const index = await this.init();
    if (this.closed || requestEpoch !== this.epoch || index !== this.index) throw new DOMException("Art generation was replaced.", "AbortError");
    const rel = index.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const generation = this.generation, epoch = this.epoch, meta2 = await generation.json(`/art/${rel}`), scale = meta2.atlases[requestedScale] ? requestedScale : "1x";
    const pages = [];
    for (const [layer, files] of Object.entries(meta2.atlases[scale])) for (const file2 of files) {
      const atlas = await generation.json(base + file2);
      pages.push({ url: base + atlas.meta.image, layer, descriptors: atlas.frames, frames: /* @__PURE__ */ new Map(), lastUsed: 0, bytes: 0, generation: 0 });
    }
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const sheet2 = new SpriteSheet(id, meta2, scale, pages, (path, signal) => this.page(path, signal, generation), (error) => this.onError?.(error));
    this.loaded.add(sheet2);
    return sheet2;
  }
  async image(url, expectedGeneration) {
    const epoch = this.epoch;
    await this.init();
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const generation = expectedGeneration ?? this.generation;
    if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
    const key = generation.key(url);
    let pending = this.images.get(key);
    if (!pending) {
      pending = (async () => {
        const lease = await generation.lease(url);
        try {
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => {
              image.onload = image.onerror = null;
              resolve(image);
            };
            image.onerror = () => {
              image.onload = image.onerror = null;
              reject(new Error("Image failed: " + url));
            };
            image.src = lease.url;
          });
          if (this.generation !== generation || generation.statistics.disposed) {
            img.src = "";
            throw new DOMException("Art generation was replaced.", "AbortError");
          }
          return img;
        } finally {
          lease.release();
        }
      })();
      this.images.set(key, pending);
    }
    return pending;
  }
  terrain(name) {
    return this.index?.terrain.includes(name) ? this.image(`/art/terrain/${name}.png`) : void 0;
  }
  /** Illustrated production/selection cameo composed from the real sprite layers. */
  cameo(id, teamColor, state = "idle", direction, purpose = "portrait") {
    const key = `${this.epoch}|${id}|${teamColor}|${state}|${direction}|${purpose}`;
    let p = this.cameos.get(key);
    if (!p) {
      p = this.composeCameo(id, teamColor, state, direction, purpose).catch(() => void 0);
      this.cameos.set(key, p);
    }
    return p;
  }
  async composeCameo(id, teamColor, stateName, direction, purpose) {
    const epoch = this.epoch, index = await this.init();
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const generation = this.generation, keys = artUIKeys(index, id);
    const build = purpose === "build" && keys.build, key = build || keys.portrait;
    const ui = build ? "icons/build" : keys.portrait ? "portraits" : void 0;
    if (ui) {
      const [beauty, team] = await Promise.all(["beauty", "team"].map((layer) => this.image(`/art/ui/${ui}/${key}@2x.${layer}.png`, generation)));
      if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
      if (beauty.naturalWidth !== team.naturalWidth || beauty.naturalHeight !== team.naturalHeight) throw Error("Illustration layers do not match");
      const canvas2 = document.createElement("canvas");
      canvas2.width = beauty.naturalWidth;
      canvas2.height = beauty.naturalHeight;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(beauty, 0, 0);
      const tinted = document.createElement("canvas");
      tinted.width = canvas2.width;
      tinted.height = canvas2.height;
      const mask = tinted.getContext("2d");
      mask.drawImage(team, 0, 0);
      mask.globalCompositeOperation = "multiply";
      mask.fillStyle = teamColor;
      mask.fillRect(0, 0, tinted.width, tinted.height);
      mask.globalCompositeOperation = "destination-in";
      mask.drawImage(team, 0, 0);
      ctx2.drawImage(tinted, 0, 0);
      return canvas2.toDataURL("image/png");
    }
    const rel = index.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const meta2 = await generation.json(`/art/${rel}`);
    const state = meta2.states.find((s) => s.name === stateName) ?? meta2.states.find((s) => ["idle", "fly", "hover", "full"].includes(s.name)) ?? meta2.states[0];
    const dir = direction ?? (state.directions >= 16 ? Math.round(state.directions * 3 / 16) % state.directions : state.directions >= 8 ? 1 : 0);
    const frameKey = `${state.name}/d${String(dir).padStart(2, "0")}_f00`;
    const canvas = document.createElement("canvas");
    const [w, h] = meta2.frame_size_2x;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const parts = [[state.name, frameKey]];
    if (state.part === "hull" && meta2.states.some((s) => s.name === "aim")) {
      const aim = meta2.states.find((s) => s.name === "aim");
      parts.push(["aim", `aim/d${String(Math.round(dir * aim.directions / state.directions) % aim.directions).padStart(2, "0")}_f00`]);
    }
    for (const [partState, key2] of parts) {
      for (const layer of ["beauty", "team"]) {
        const files = meta2.atlases["2x"][layer];
        if (!files) continue;
        for (const file2 of files) {
          const atlas = await generation.json(base + file2);
          const f = atlas.frames[key2];
          if (!f) continue;
          const img = await this.image(base + atlas.meta.image, generation);
          if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
          if (layer === "team") {
            const tmp = document.createElement("canvas");
            tmp.width = f.frame.w;
            tmp.height = f.frame.h;
            const t = tmp.getContext("2d");
            t.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, 0, 0, f.frame.w, f.frame.h);
            t.globalCompositeOperation = "multiply";
            t.fillStyle = teamColor;
            t.fillRect(0, 0, f.frame.w, f.frame.h);
            t.globalCompositeOperation = "destination-in";
            t.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, 0, 0, f.frame.w, f.frame.h);
            ctx.drawImage(tmp, 0, 0);
          } else ctx.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, 0, 0, f.frame.w, f.frame.h);
          void partState;
          break;
        }
      }
    }
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 16) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX <= minX) return void 0;
    const pad = 6, cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2, out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d").drawImage(canvas, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
    return out.toDataURL("image/png");
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.epoch++;
    this.lifetime.abort();
    this.generation?.dispose();
    this.clearImages();
    await this.binding;
    await this.release();
    this.generation = void 0;
    this.index = void 0;
    this.initialization = void 0;
  }
  /** Release GPU textures for a finished match; same-generation cameos stay cached. */
  release() {
    const previous = this.sheets;
    this.sheets = /* @__PURE__ */ new Map();
    const earlier = this.releaseWork;
    this.releaseWork = (async () => {
      await earlier;
      const sheets = await Promise.all(previous.values());
      for (const sheet2 of sheets) {
        if (sheet2) {
          await sheet2.dispose();
          this.loaded.delete(sheet2);
        }
      }
    })();
    return this.releaseWork;
  }
};
var art = new ArtLibrary();

// work/evidence/art-generation-review/page-retry-proof.ts
var meta = { id: "review.page", frame_size_2x: [2, 2], anchor_2x: [1, 1], layers: ["beauty"], atlases: { "1x": {}, "2x": {} }, states: [{ name: "idle", part: "body", directions: 1, frames: 1, fps: 1, loop: true }] };
var page = { url: "/art/review/page.png", descriptors: { "idle/d00_f00": { frame: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 } } }, layer: "beauty", frames: /* @__PURE__ */ new Map(), generation: 0, lastUsed: 0, bytes: 0 };
var attempts = 0;
var failures = [];
var transient = new RuntimeError("asset_unavailable", "Controlled transient transport failure.");
var sheet = new SpriteSheet(meta.id, meta, "1x", [page], async () => {
  attempts++;
  throw transient;
}, (error) => failures.push(error.code));
var originalWarn = console.warn;
console.warn = () => {
};
try {
  assert.equal(sheet.frame("beauty", "idle", 0, 0), void 0);
  await sheet.settle();
  assert.equal(attempts, 1);
  assert.deepEqual(failures, ["asset_unavailable"]);
  for (let i = 0; i < 100; i++) assert.equal(sheet.frame("beauty", "idle", 0, 0), void 0);
  await sheet.settle();
  assert.equal(attempts, 1);
  await sheet.dispose();
  const result = { scope: "Frozen-v1 production SpriteSheet public API; controlled transient error before texture creation, no browser or GPU claim.", firstAttempts: 1, laterFrameRequests: 100, additionalAttempts: attempts - 1, reportedFailures: failures, statisticsAfterDispose: sheet.statistics };
  await writeFile("work/evidence/art-generation-review/page-retry-result.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  console.warn = originalWarn;
  await sheet.dispose();
}
