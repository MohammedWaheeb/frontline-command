// work/audio-generation-retry-v1/tests/candidate.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// work/audio-generation-retry-v1/source/client/src/runtime/errors.ts
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

// work/audio-generation-retry-v1/source/client/src/runtime/crypto.ts
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
function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const bytes = copy(data), subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      return hex(new Uint8Array(await subtle.digest("SHA-256", bytes.buffer)));
    } catch {
    }
  }
  return fallback(bytes);
}

// work/audio-generation-retry-v1/source/client/src/app/store.ts
import { useSyncExternalStore } from "react";
var Observable = class {
  constructor(value) {
    this.value = value;
  }
  value;
  listeners = /* @__PURE__ */ new Set();
  get() {
    return this.value;
  }
  set(next) {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const l of [...this.listeners]) l();
  }
  update(fn) {
    this.set(fn(this.value));
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
};

// work/audio-generation-retry-v1/source/client/src/audio/index.ts
function audioVariantKey(variant2) {
  return JSON.stringify([variant2.url, variant2.bytes, variant2.sha256, variant2.duration, variant2.mp3_url ?? null, variant2.mp3_bytes ?? null, variant2.mp3_sha256 ?? null]);
}
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
var keys = (v, allowed) => Object.keys(v).every((key) => allowed.includes(key));
function parseAudioIndex(value) {
  if (!record(value) || !keys(value, ["format", "sample_rate", "entries"]) || value.format !== 1 || !finite(value.sample_rate, 8e3, 96e3) || !record(value.entries) || Object.keys(value.entries).length > 4096) throw Error("Invalid audio index.");
  const entries = /* @__PURE__ */ Object.create(null);
  for (const [id, raw] of Object.entries(value.entries)) {
    if (!/^(vo|sfx|music)\.[a-zA-Z0-9_.-]{1,160}$/.test(id) || !record(raw) || !keys(raw, ["bus", "priority", "cooldown_ms", "loop", "bpm", "beats_per_bar", "variants"]) || !["voice", "music", "effects", "ui"].includes(String(raw.bus)) || !Array.isArray(raw.variants) || !raw.variants.length || raw.variants.length > 8 || !finite(raw.priority ?? 0, 0, 100) || !finite(raw.cooldown_ms ?? 0, 0, 6e4) || raw.loop !== void 0 && typeof raw.loop !== "boolean" || raw.bpm !== void 0 && !finite(raw.bpm, 30, 240) || raw.beats_per_bar !== void 0 && !finite(raw.beats_per_bar, 1, 16)) throw Error(`Invalid audio entry: ${id}`);
    const variants = raw.variants.map((variant2) => {
      if (!record(variant2) || !keys(variant2, ["url", "caption", "display_caption", "duration", "bytes", "sha256", "mp3_url", "mp3_bytes", "mp3_sha256"]) || typeof variant2.url !== "string" || !/^\/art\/audio\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(ogg|mp3|wav)$/.test(variant2.url) || variant2.url.includes("..") || !finite(variant2.duration, 0.01, raw.bus === "music" ? 180 : 90) || !Number.isSafeInteger(variant2.bytes) || !finite(variant2.bytes, 1, 16 * 1024 ** 2) || typeof variant2.sha256 !== "string" || !/^([a-f0-9]{64})$/.test(variant2.sha256) || variant2.caption !== void 0 && (typeof variant2.caption !== "string" || variant2.caption.length > 12e3) || variant2.display_caption !== void 0 && (typeof variant2.display_caption !== "string" || variant2.display_caption.length > 12e3) || raw.bus === "voice" && !variant2.caption) throw Error(`Invalid audio variant: ${id}`);
      if (variant2.mp3_url !== void 0 || variant2.mp3_bytes !== void 0 || variant2.mp3_sha256 !== void 0) {
        if (typeof variant2.mp3_url !== "string" || !/^\/art\/audio\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.mp3$/.test(variant2.mp3_url) || variant2.mp3_url.includes("..") || !Number.isSafeInteger(variant2.mp3_bytes) || !finite(variant2.mp3_bytes, 1, 16 * 1024 ** 2) || typeof variant2.mp3_sha256 !== "string" || !/^([a-f0-9]{64})$/.test(variant2.mp3_sha256)) throw Error(`Invalid MP3 fallback: ${id}`);
      }
      return { ...variant2 };
    });
    entries[id] = { bus: raw.bus, priority: raw.priority ?? 0, cooldown_ms: raw.cooldown_ms ?? 0, loop: raw.loop === true, bpm: raw.bpm, beats_per_bar: raw.beats_per_bar, variants };
  }
  return { format: 1, sample_rate: value.sample_rate, entries };
}
async function boundedAudioBytes(response, max) {
  if (!response.ok || response.redirected || !response.body) throw Error(`Audio file unavailable (${response.status}).`);
  const reader = response.body.getReader(), parts = [];
  let length = 0;
  try {
    for (; ; ) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > max) throw Error("Audio file exceeds declared size.");
      parts.push(result.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}
var AudioCooldowns = class {
  until = /* @__PURE__ */ new Map();
  admit(key, now, ms) {
    if ((this.until.get(key) ?? -Infinity) > now) return false;
    this.until.set(key, now + ms);
    if (this.until.size > 512) {
      for (const [id, end] of this.until) if (end <= now) this.until.delete(id);
    }
    if (this.until.size > 1024) this.until.delete(this.until.keys().next().value);
    return true;
  }
  clear() {
    this.until.clear();
  }
};

// work/audio-generation-retry-v1/source/client/src/audio/mixer.ts
var BUSES = ["voice", "music", "effects", "ui"];
var MEMORY = 64 * 1024 ** 2;
var VOICES = 24;
var AudioMixer = class {
  constructor(preferences2, fetcher = (...args) => globalThis.fetch(...args)) {
    this.fetcher = fetcher;
    this.preferences = preferences2;
    this.state.update((state) => ({ ...state, status: preferences2.audioConsent ? "gesture" : "disabled" }));
  }
  fetcher;
  state = new Observable({ status: "disabled", captions: [] });
  cooldowns = new AudioCooldowns();
  continuousRequests = /* @__PURE__ */ new Map();
  continuousSources = /* @__PURE__ */ new Map();
  continuousPending = /* @__PURE__ */ new Map();
  continuousNext = /* @__PURE__ */ new Map();
  continuousEpoch = 0;
  indexDigest;
  preferences;
  context;
  master;
  buses = /* @__PURE__ */ new Map();
  index;
  indexWork;
  life = new AbortController();
  loads = new AbortController();
  generation = 0;
  closed = false;
  focused = true;
  captionID = 0;
  expiry;
  sources = /* @__PURE__ */ new Set();
  buffers = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  variants = /* @__PURE__ */ new Map();
  pins = /* @__PURE__ */ new Map();
  outputEpoch = 0;
  scheduled = /* @__PURE__ */ new Set();
  voiceEpoch = 0;
  voicePriority = -1;
  voiceDeadline = 0;
  musicNames = [];
  musicLevels = [];
  musicSources = [];
  musicWork = false;
  musicEpoch = 0;
  inFlight = 0;
  get manifest() {
    return this.index;
  }
  get statistics() {
    return { context: this.context?.state ?? "absent", sources: this.sources.size, continuous: this.continuousSources.size, buffers: this.buffers.size, decodedBytes: [...this.buffers.values()].reduce((sum, value) => sum + value.bytes, 0), pending: this.pending.size, generation: this.generation, gains: Object.fromEntries([["master", this.master?.gain.value ?? 0], ...BUSES.map((bus) => [bus, this.buses.get(bus)?.gain.value ?? 0])]) };
  }
  attach(target = window) {
    const signal = this.life.signal;
    target.addEventListener("pointerdown", this.gesture, { capture: true, signal });
    target.addEventListener("keydown", this.gesture, { capture: true, signal });
    target.addEventListener("click", this.click, { signal });
    target.addEventListener("blur", this.blur, { signal });
    target.addEventListener("focus", this.focus, { signal });
    document.addEventListener("visibilitychange", this.visibility, { signal });
  }
  async loadIndex(retry = false) {
    if (this.closed || this.index && !retry) return;
    if (this.indexWork) return this.indexWork;
    this.indexWork = (async () => {
      try {
        const response = await this.fetcher("/art/audio/index.json", { signal: this.life.signal, credentials: "omit", redirect: "error", cache: "no-cache" });
        const bytes = await boundedAudioBytes(response, 4 * 1024 ** 2);
        const index = parseAudioIndex(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))), digest = await sha256Hex(bytes);
        if (!this.closed) {
          if (this.index && this.indexDigest !== digest) this.reset();
          this.index = index;
          this.indexDigest = digest;
          this.state.update((state) => ({ ...state, error: void 0, status: this.preferences.audioConsent ? this.context?.state === "running" ? "ready" : "gesture" : "disabled" }));
          void this.ensureMusic();
          this.ensureContinuous();
        }
      } catch (error) {
        if (!this.closed) this.state.update((state) => ({ ...state, status: "unavailable", error: error instanceof Error ? error.message : "Audio unavailable." }));
      } finally {
        this.indexWork = void 0;
      }
    })();
    return this.indexWork;
  }
  update(preferences2) {
    const withdrawn = this.preferences.audioConsent && !preferences2.audioConsent;
    this.preferences = preferences2;
    if (withdrawn) {
      this.reset();
      void this.context?.suspend();
    }
    this.applyGains();
    if (!preferences2.captions) this.state.update((state) => ({ ...state, captions: [] }));
    this.state.update((state) => ({ ...state, status: !preferences2.audioConsent ? "disabled" : this.context?.state === "running" ? "ready" : this.index ? "gesture" : state.status }));
    this.ensureContinuous();
  }
  applyGains() {
    if (!this.context) return;
    this.master.gain.setValueAtTime(this.preferences.audioConsent ? this.preferences.audio.master : 0, this.context.currentTime);
    for (const bus of BUSES) this.buses.get(bus).gain.setValueAtTime(this.preferences.audio[bus], this.context.currentTime);
  }
  gesture = (event) => {
    if (!event.isTrusted || !this.preferences.audioConsent || this.closed || document.visibilityState === "hidden") return;
    this.focused = true;
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 24e3 });
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      for (const bus of BUSES) {
        const gain = this.context.createGain();
        gain.connect(this.master);
        this.buses.set(bus, gain);
      }
      this.applyGains();
    }
    void this.context.resume().then(() => {
      if (!this.closed) {
        this.state.update((state) => ({ ...state, status: "ready" }));
        void this.ensureMusic();
        this.ensureContinuous();
      }
    }).catch(() => this.state.update((state) => ({ ...state, status: "gesture" })));
  };
  click = (event) => {
    if (event.isTrusted && event.target?.closest?.("button") && !event.target.closest("button").disabled) this.play("sfx.ui_click");
  };
  blur = () => {
    this.focused = false;
    this.stopTransient();
    void this.context?.suspend();
  };
  focus = () => {
    this.focused = true;
  };
  visibility = () => {
    if (document.visibilityState === "hidden") this.blur();
    else this.focus();
  };
  caption(text, priority = 50, duration = 5e3) {
    if (!this.preferences.captions || !text) return;
    const now = performance.now(), caption = { id: ++this.captionID, text: text.slice(0, 12e3), priority, expires: now + Math.min(12e3, Math.max(2500, duration)) };
    this.state.update((state) => ({ ...state, captions: [...state.captions.filter((c) => c.expires > now), caption].sort((a, b) => b.priority - a.priority || b.id - a.id).slice(0, 3) }));
    if (this.expiry) clearTimeout(this.expiry);
    this.expireCaptions();
  }
  expireCaptions() {
    this.expiry = setTimeout(() => {
      const now = performance.now();
      this.state.update((state) => ({ ...state, captions: state.captions.filter((c) => c.expires > now) }));
      if (this.state.get().captions.length) this.expireCaptions();
    }, 500);
  }
  play(id, options = {}) {
    if (this.closed) return;
    const entry = this.index?.entries[id], now = performance.now(), priority = options.priority ?? entry?.priority ?? 0;
    if (!this.cooldowns.admit(options.key ?? id, now, options.cooldown ?? entry?.cooldown_ms ?? 0)) return;
    const cursor = this.variants.get(id) ?? 0, variant2 = entry?.variants[cursor % (entry?.variants.length ?? 1)];
    this.variants.set(id, cursor + 1);
    const text = variant2?.display_caption ?? variant2?.caption ?? options.caption;
    if (text) this.caption(text, priority, (variant2?.duration ?? 3) * 1e3 + 1500);
    if (!entry || !variant2 || !this.preferences.audioConsent || !this.focused || this.context?.state !== "running") return;
    if (this.preferences.audio.master === 0 || this.preferences.audio[entry.bus] === 0) return;
    let voice = 0;
    if (entry.bus === "voice") {
      if (this.voiceDeadline > now && this.voicePriority > priority) return;
      if (this.voiceDeadline > now && this.voicePriority === priority && priority >= 50 && priority < 100) return;
      this.voicePriority = priority;
      this.voiceDeadline = now + variant2.duration * 1e3 + 2e3;
      voice = ++this.voiceEpoch;
      for (const source of this.sources) if (source.bus === "voice") this.stop(source);
    }
    const generation = this.generation, output = this.outputEpoch;
    void this.buffer(variant2).then((buffer) => {
      if (generation !== this.generation || output !== this.outputEpoch || this.closed || !this.focused || this.context?.state !== "running" || !this.preferences.audioConsent || voice && voice !== this.voiceEpoch) return;
      if (this.sources.size >= VOICES) {
        const victim = [...this.sources].find((source2) => !source2.music && source2.priority < priority);
        if (!victim) return;
        this.stop(victim);
      }
      const source = this.source(buffer, entry, priority);
      source.node.start();
      if (voice) this.voiceDeadline = performance.now() + buffer.duration * 1e3;
    }).catch((error) => {
      if (voice && voice === this.voiceEpoch) {
        this.voiceDeadline = 0;
        this.voicePriority = -1;
      }
      this.failure(error, generation);
    });
  }
  failure(error, generation) {
    if (generation !== this.generation || this.closed || ["AbortError", "QuotaExceededError"].includes(error.name)) return;
    this.state.update((state) => ({ ...state, error: error instanceof Error ? error.message : "An audio file could not be loaded." }));
  }
  source(buffer, entry, priority, music = false, pan) {
    const context = this.context, node = context.createBufferSource(), gain = context.createGain();
    node.buffer = buffer;
    node.loop = entry.loop;
    node.connect(gain);
    const panner = pan === void 0 ? void 0 : context.createStereoPanner();
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan ?? 0));
      gain.connect(panner);
      panner.connect(this.buses.get(entry.bus));
    } else gain.connect(this.buses.get(entry.bus));
    const source = { node, gain, panner, bus: entry.bus, priority, music };
    this.sources.add(source);
    node.onended = () => {
      this.sources.delete(source);
      if (source.key && this.continuousSources.get(source.key) === source) this.continuousSources.delete(source.key);
      node.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    return source;
  }
  stop(source) {
    source.node.onended = null;
    try {
      source.node.stop();
    } catch {
    }
    source.node.disconnect();
    source.gain.disconnect();
    source.panner?.disconnect();
    if (source.key) this.continuousSources.delete(source.key);
    this.sources.delete(source);
  }
  async buffer(variant2) {
    const key = audioVariantKey(variant2), cached = this.buffers.get(key);
    if (cached) {
      cached.used = performance.now();
      return cached.buffer;
    }
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.inFlight >= 4) throw new DOMException("Audio decoder is busy.", "QuotaExceededError");
    const generation = this.generation, context = this.context, signal = this.loads.signal;
    this.inFlight++;
    const work = (async () => {
      const decode = async (url, size2, hash) => {
        const response = await this.fetcher(url, { signal, credentials: "omit", redirect: "error", cache: "force-cache" }), bytes = await boundedAudioBytes(response, size2);
        if (bytes.length !== size2 || await sha256Hex(bytes) !== hash) throw Error("Audio integrity check failed.");
        if (generation !== this.generation) throw new DOMException("Operation changed", "AbortError");
        return context.decodeAudioData(bytes.slice().buffer);
      };
      let buffer;
      try {
        buffer = await decode(variant2.url, variant2.bytes, variant2.sha256);
      } catch (error) {
        if (error.name !== "EncodingError" || !variant2.mp3_url) throw error;
        buffer = await decode(variant2.mp3_url, variant2.mp3_bytes, variant2.mp3_sha256);
      }
      if (generation !== this.generation) throw new DOMException("Operation changed", "AbortError");
      if (!Number.isFinite(buffer.duration) || Math.abs(buffer.duration - variant2.duration) > Math.max(0.15, variant2.duration * 0.02) || buffer.numberOfChannels > 2) throw Error("Audio duration/channel validation failed.");
      const size = buffer.length * buffer.numberOfChannels * 4;
      if (size > MEMORY) throw Error("Audio clip exceeds memory budget.");
      for (const [key2, value] of [...this.buffers].sort((a, b) => a[1].used - b[1].used)) {
        if (this.statistics.decodedBytes + size <= MEMORY) break;
        if (!this.pins.has(value.buffer) && ![...this.sources].some((source) => source.node.buffer === value.buffer)) this.buffers.delete(key2);
      }
      if (this.statistics.decodedBytes + size > MEMORY) throw Error("Audio memory budget reached.");
      this.buffers.set(key, { buffer, bytes: size, used: performance.now() });
      return buffer;
    })().finally(() => {
      this.inFlight--;
      if (this.pending.get(key) === work) this.pending.delete(key);
    });
    this.pending.set(key, work);
    return work;
  }
  /** One quiet bed and up to three on-screen actors. Removal stops even a pending clip. */
  continuous(requests) {
    const next = /* @__PURE__ */ new Map();
    for (const request of requests.slice(0, 4)) {
      if (!request.key || request.key.length > 64 || !Number.isFinite(request.gain) || request.gain <= 0) continue;
      next.set(request.key, { ...request, gain: Math.min(0.3, request.gain), pan: Math.max(-1, Math.min(1, request.pan ?? 0)), repeatMs: Math.max(0, Math.min(6e4, request.repeatMs ?? 0)) });
    }
    for (const [key, source] of this.continuousSources) {
      const request = next.get(key), previous = this.continuousRequests.get(key);
      if (!request || request.id !== previous?.id) this.stop(source);
      else {
        source.gain.gain.setTargetAtTime(request.gain, this.context.currentTime, 0.08);
        source.panner?.pan.setTargetAtTime(request.pan ?? 0, this.context.currentTime, 0.08);
      }
    }
    for (const [key, previous] of this.continuousRequests) if (next.get(key)?.id !== previous.id) {
      this.continuousPending.delete(key);
      this.continuousNext.delete(key);
    }
    this.continuousRequests = next;
    this.ensureContinuous();
  }
  ensureContinuous() {
    if (this.closed || !this.index || !this.preferences.audioConsent || !this.focused || this.context?.state !== "running" || this.preferences.audio.master === 0 || this.preferences.audio.effects === 0) return;
    for (const [key, request] of this.continuousRequests) {
      if (this.continuousSources.has(key) || this.continuousPending.has(key) || (this.continuousNext.get(key) ?? 0) > performance.now() || this.sources.size >= VOICES) continue;
      const entry = this.index.entries[request.id];
      if (!entry || entry.bus !== "effects") continue;
      const epoch = ++this.continuousEpoch, generation = this.generation, output = this.outputEpoch;
      this.continuousPending.set(key, epoch);
      void this.buffer(entry.variants[0]).then((buffer) => {
        const latest = this.continuousRequests.get(key);
        if (this.closed || generation !== this.generation || output !== this.outputEpoch || this.continuousPending.get(key) !== epoch || latest?.id !== request.id || !this.focused || this.context?.state !== "running" || !this.preferences.audioConsent || this.sources.size >= VOICES) return;
        const source = this.source(buffer, entry, 0, false, latest.pan);
        source.key = key;
        source.gain.gain.value = latest.gain;
        this.continuousSources.set(key, source);
        this.continuousNext.set(key, performance.now() + Math.max(buffer.duration * 1e3, latest.repeatMs ?? 0));
        source.node.start();
      }).catch((error) => this.failure(error, generation)).finally(() => {
        if (this.continuousPending.get(key) === epoch) this.continuousPending.delete(key);
      });
    }
  }
  /** Layers start together at a single bar origin; intensity changes only their gains. */
  music(ids, levels = ids.map((_, i) => i ? 0 : 1)) {
    const changed = ids.join("|") !== this.musicNames.join("|");
    this.musicNames = [...ids];
    this.musicLevels = [...levels];
    if (changed) {
      this.musicEpoch++;
      for (const source of this.musicSources) this.stop(source);
      this.musicSources = [];
      this.musicWork = false;
    }
    if (this.musicSources.length) this.mixMusic();
    else void this.ensureMusic();
    this.ensureContinuous();
  }
  async ensureMusic() {
    if (this.musicWork || this.musicSources.length || !this.musicNames.length || !this.index || !this.preferences.audioConsent || !this.focused || this.context?.state !== "running") return;
    const ids = [...this.musicNames], entries = ids.map((id) => this.index.entries[id]);
    if (entries.some((entry) => !entry || entry.bus !== "music" || !entry.loop)) return;
    const first = entries[0];
    if (entries.length > 3 || entries.some((entry) => entry.bpm !== first.bpm || entry.beats_per_bar !== first.beats_per_bar || Math.abs(entry.variants[0].duration - first.variants[0].duration) > 0.05)) {
      this.state.update((state) => ({ ...state, error: "Music layers do not share a valid loop." }));
      return;
    }
    const generation = this.generation, epoch = this.musicEpoch;
    this.musicWork = true;
    const buffers = [];
    try {
      for (const entry of entries) {
        const buffer = await this.buffer(entry.variants[0]);
        buffers.push(buffer);
        this.pins.set(buffer, (this.pins.get(buffer) ?? 0) + 1);
      }
      if (generation !== this.generation || epoch !== this.musicEpoch || ids.join("|") !== this.musicNames.join("|") || this.closed || !this.preferences.audioConsent) return;
      const when = this.context.currentTime + 0.05;
      this.musicSources = entries.map((entry, i) => {
        const source = this.source(buffers[i], entry, 0, true);
        source.gain.gain.value = this.musicLevels[i] ?? 0;
        source.node.start(when);
        return source;
      });
    } catch (error) {
      this.failure(error, generation);
    } finally {
      for (const buffer of buffers) {
        const count = (this.pins.get(buffer) ?? 1) - 1;
        if (count > 0) this.pins.set(buffer, count);
        else this.pins.delete(buffer);
      }
      if (generation === this.generation && epoch === this.musicEpoch) this.musicWork = false;
    }
  }
  mixMusic() {
    if (!this.context) return;
    this.musicSources.forEach((source, i) => source.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, this.musicLevels[i] ?? 0)), this.context.currentTime, 0.6));
  }
  afterSpeech(id) {
    const generation = this.generation, timer = setTimeout(() => {
      this.scheduled.delete(timer);
      if (generation === this.generation && !this.closed) this.play(id);
    }, Math.max(100, this.voiceDeadline - performance.now() + 100));
    this.scheduled.add(timer);
  }
  clearCaptions() {
    if (this.expiry) clearTimeout(this.expiry);
    this.state.update((state) => ({ ...state, captions: [] }));
  }
  stopTransient() {
    this.continuousNext.clear();
    this.outputEpoch++;
    this.voiceEpoch++;
    this.voiceDeadline = 0;
    for (const source of this.sources) if (!source.music) this.stop(source);
  }
  /** Session/seek/reconnect boundary: abort late loads and prevent stale warnings. */
  reset() {
    this.continuousRequests.clear();
    this.continuousPending.clear();
    this.continuousNext.clear();
    this.outputEpoch++;
    for (const timer of this.scheduled) clearTimeout(timer);
    this.scheduled.clear();
    this.generation++;
    this.musicEpoch++;
    this.loads.abort();
    this.loads = new AbortController();
    for (const source of this.sources) this.stop(source);
    this.musicSources = [];
    this.musicWork = false;
    this.pending.clear();
    this.buffers.clear();
    this.pins.clear();
    this.cooldowns.clear();
    this.variants.clear();
    this.voiceEpoch++;
    this.voiceDeadline = 0;
    this.voicePriority = -1;
    this.state.update((state) => ({ ...state, captions: [] }));
    if (this.expiry) clearTimeout(this.expiry);
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.life.abort();
    this.reset();
    this.musicNames = [];
    this.buses.clear();
    void this.context?.close();
    this.context = void 0;
  }
};

// work/audio-generation-retry-v1/tests/candidate.test.ts
var encode = (value) => new TextEncoder().encode(value);
var sha = (value) => createHash("sha256").update(value).digest("hex");
var variant = (label) => ({ url: "/art/audio/test.wav", bytes: encode(label).length, sha256: sha(encode(label)), duration: 1, caption: label });
var document2 = (label) => ({ format: 1, sample_rate: 24e3, entries: { "vo.test": { bus: "voice", priority: 1, cooldown_ms: 0, loop: false, variants: [variant(label)] } } });
var deferred = () => {
  let resolve;
  const promise = new Promise((value) => resolve = value);
  return { promise, resolve };
};
var decoded = (label) => ({ duration: 1, numberOfChannels: 1, length: 24e3, label });
var preferences = { audioConsent: false, captions: false, audio: { master: 1, voice: 1, music: 1, effects: 1, ui: 1 } };
function course() {
  let label = "A", malformed = false, unavailable = false, holdA = false, reads = 0, decodes = 0, indexReads = 0;
  const entered = deferred(), held = deferred();
  const mixer = new AudioMixer(preferences, async (input) => {
    if (String(input).endsWith("index.json")) {
      indexReads++;
      return new Response(JSON.stringify(malformed ? { bad: true } : document2(label)));
    }
    reads++;
    return new Response(unavailable ? "unavailable" : encode(label), { status: unavailable ? 503 : 200 });
  });
  mixer.context = { state: "suspended", close: async () => {
  }, decodeAudioData: async (data) => {
    decodes++;
    const name = new TextDecoder().decode(data);
    entered.resolve();
    return holdA && name === "A" ? held.promise : decoded(name);
  } };
  return { mixer, entered, held, change(value) {
    label = value;
  }, malformed(value) {
    malformed = value;
  }, unavailable(value) {
    unavailable = value;
  }, hold() {
    holdA = true;
  }, buffer(value = mixer.manifest.entries["vo.test"].variants[0]) {
    return mixer.buffer(value);
  }, counts() {
    return { reads, decodes, indexReads };
  } };
}
test("changed index at the same URL cannot reuse a decoded old clip", async () => {
  const c = course();
  await c.mixer.loadIndex();
  const old = await c.buffer();
  assert.equal(old.label, "A");
  const generation = c.mixer.statistics.generation;
  c.change("B");
  await c.mixer.loadIndex(true);
  const next = await c.buffer();
  assert.equal(next.label, "B");
  assert.notEqual(next, old);
  assert.equal(c.mixer.statistics.generation, generation + 1);
  assert.deepEqual(c.counts(), { reads: 2, decodes: 2, indexReads: 2 });
  c.mixer.dispose();
});
test("pending old decode cannot satisfy or delete the new descriptor request", async () => {
  const c = course();
  c.hold();
  await c.mixer.loadIndex();
  const old = c.buffer(), rejected = assert.rejects(old, (error) => error.name === "AbortError");
  await c.entered.promise;
  c.change("B");
  await c.mixer.loadIndex(true);
  const next = await c.buffer();
  assert.equal(next.label, "B");
  c.held.resolve(decoded("A"));
  await rejected;
  assert.equal(await c.buffer(), next);
  assert.deepEqual(c.counts(), { reads: 2, decodes: 2, indexReads: 2 });
  assert.equal(c.mixer.statistics.pending, 0);
  assert.equal(c.mixer.statistics.buffers, 1);
  c.mixer.dispose();
});
test("failed candidate index retains the previous decoded generation", async () => {
  const c = course();
  await c.mixer.loadIndex();
  const original = c.mixer.manifest, old = await c.buffer(), generation = c.mixer.statistics.generation;
  c.malformed(true);
  await c.mixer.loadIndex(true);
  assert.equal(c.mixer.manifest, original);
  assert.equal(c.mixer.statistics.generation, generation);
  assert.equal(await c.buffer(), old);
  assert.equal(c.counts().reads, 1);
  assert(c.mixer.state.get().error);
  c.mixer.dispose();
});
test("only a validated changed index stops old sources and clears old captions", async () => {
  const c = course();
  await c.mixer.loadIndex();
  let stopped = 0, disconnected = 0;
  c.mixer.sources.add({ node: { stop() {
    stopped++;
  }, disconnect() {
    disconnected++;
  }, onended: null }, gain: { disconnect() {
    disconnected++;
  } }, bus: "voice", priority: 1, music: false });
  c.mixer.state.update((state) => ({ ...state, captions: [{ id: 1, text: "A speech", priority: 1, expires: 1e5 }] }));
  c.malformed(true);
  await c.mixer.loadIndex(true);
  assert.equal(stopped, 0);
  assert.equal(c.mixer.statistics.sources, 1);
  assert.equal(c.mixer.state.get().captions[0].text, "A speech");
  c.malformed(false);
  c.change("B");
  await c.mixer.loadIndex(true);
  assert.equal(stopped, 1);
  assert.equal(disconnected, 2);
  assert.equal(c.mixer.statistics.sources, 0);
  assert.deepEqual(c.mixer.state.get().captions, []);
  c.mixer.dispose();
});
test("exact same index retry verifies again without discarding coherent decoded clips", async () => {
  const c = course();
  await c.mixer.loadIndex();
  const old = await c.buffer(), generation = c.mixer.statistics.generation;
  await c.mixer.loadIndex(true);
  assert.equal(await c.buffer(), old);
  assert.equal(c.mixer.statistics.generation, generation);
  assert.deepEqual(c.counts(), { reads: 1, decodes: 1, indexReads: 2 });
  c.mixer.dispose();
});
test("buffer keys include byte/hash/duration and codec fallback identity", () => {
  const a = variant("A"), key = audioVariantKey(a);
  for (const change of [{ url: "/art/audio/other.wav" }, { bytes: 2 }, { sha256: "b".repeat(64) }, { duration: 2 }, { mp3_url: "/art/audio/test.mp3", mp3_bytes: 3, mp3_sha256: "c".repeat(64) }]) assert.notEqual(audioVariantKey({ ...a, ...change }), key);
  const fallback2 = { ...a, mp3_url: "/art/audio/test.mp3", mp3_bytes: 3, mp3_sha256: "c".repeat(64) };
  assert.notEqual(audioVariantKey({ ...fallback2, mp3_sha256: "d".repeat(64) }), audioVariantKey(fallback2));
  assert.equal(audioVariantKey({ ...a, caption: "Caption is index-owned." }), key);
});
test("different same-URL descriptors and concurrent exact descriptors remain distinct/deduplicated", async () => {
  const c = course();
  await c.mixer.loadIndex();
  const [a, duplicate] = await Promise.all([c.buffer(), c.buffer()]);
  assert.equal(a, duplicate);
  assert.equal(c.counts().reads, 1);
  c.change("B");
  const b = await c.buffer(variant("B"));
  assert.equal(b.label, "B");
  assert.notEqual(a, b);
  assert.equal(c.counts().reads, 2);
  c.mixer.dispose();
});
test("failed reads release pending entries; corrupt recovery never reaches the decoder", async () => {
  const c = course();
  await c.mixer.loadIndex();
  c.unavailable(true);
  await assert.rejects(c.buffer());
  assert.equal(c.mixer.statistics.pending, 0);
  c.unavailable(false);
  c.change("B");
  await assert.rejects(c.buffer(), /integrity/);
  assert.equal(c.counts().decodes, 0);
  c.change("A");
  assert.equal((await c.buffer()).label, "A");
  assert.equal(c.counts().reads, 3);
  c.mixer.dispose();
});
test("disposed pending decode cannot publish a buffer or issue more index requests", async () => {
  const c = course();
  c.hold();
  await c.mixer.loadIndex();
  const pending = c.buffer(), rejected = assert.rejects(pending, (error) => error.name === "AbortError");
  await c.entered.promise;
  c.mixer.dispose();
  c.held.resolve(decoded("A"));
  await rejected;
  assert.equal(c.mixer.statistics.pending, 0);
  assert.equal(c.mixer.statistics.buffers, 0);
  assert.equal(c.mixer.statistics.sources, 0);
  await c.mixer.loadIndex(true);
  assert.equal(c.counts().indexReads, 1);
});
test("dispose during index capture prevents late index publication", async () => {
  const entered = deferred(), held = deferred();
  let requests = 0;
  const mixer = new AudioMixer(preferences, async () => {
    requests++;
    entered.resolve();
    return held.promise;
  });
  const pending = mixer.loadIndex();
  await entered.promise;
  mixer.dispose();
  held.resolve(new Response(JSON.stringify(document2("A"))));
  await pending;
  assert.equal(mixer.manifest, void 0);
  await mixer.loadIndex(true);
  assert.equal(requests, 1);
});
test("index retry preserves four-decode admission until old decoders finish", async () => {
  let label = "A", reads = 0;
  const held = Array.from({ length: 4 }, () => deferred()), entered = deferred();
  let decoding = 0;
  const mixer = new AudioMixer(preferences, async (input) => String(input).endsWith("index.json") ? new Response(JSON.stringify(document2(label))) : (reads++, new Response(encode(label))));
  mixer.context = { state: "suspended", close: async () => {
  }, decodeAudioData: async (data) => {
    const name = new TextDecoder().decode(data);
    if (name === "B") return decoded(name);
    const slot = decoding++;
    if (decoding === 4) entered.resolve();
    return held[slot].promise;
  } };
  await mixer.loadIndex();
  const first = held.map((_, i) => mixer.buffer({ ...variant("A"), url: `/art/audio/a${i}.wav` })), rejected = first.map((p) => assert.rejects(p, (e) => e.name === "AbortError"));
  await entered.promise;
  label = "B";
  await mixer.loadIndex(true);
  await assert.rejects(mixer.buffer(variant("B")), (e) => e.name === "QuotaExceededError");
  assert.equal(reads, 4);
  held.forEach((item) => item.resolve(decoded("A")));
  await Promise.all(rejected);
  assert.equal((await mixer.buffer(variant("B"))).label, "B");
  assert.equal(reads, 5);
  mixer.dispose();
});
