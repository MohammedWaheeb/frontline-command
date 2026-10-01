// client/tests/runtime/asset-preflight.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// client/src/content/art-ui.ts
function artUIKeys(index2, id) {
  if (!id || id.length >= 240 || id.includes("..") || !/^[A-Za-z0-9_.@-]+$/.test(id)) throw Error(`Invalid battlefield UI asset: ${id}`);
  const legacy = id.replace(/^(unit|building)\./, "");
  const advertised = (keys) => keys?.includes(id) ? id : legacy && keys?.includes(legacy) ? legacy : void 0;
  return { portrait: advertised(index2.portraits), build: advertised(index2.buildIcons) };
}

// client/src/app/asset-preflight.ts
var ASSET_PREFLIGHT_LIMITS = Object.freeze({ files: 16384, json: 8 * 1024 * 1024, image: 64 * 1024 * 1024, total: 2 * 1024 * 1024 * 1024 });
var safeAssetPath = (path) => typeof path === "string" && path.length > 0 && path.length < 240 && !path.startsWith("/") && !path.includes("..") && !/[\\?#%]/.test(path) && /^[A-Za-z0-9_./@-]+$/.test(path);
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var AssetPreflight = class {
  constructor(options = {}) {
    this.options = options;
    this.limits = { ...ASSET_PREFLIGHT_LIMITS, ...options.limits };
    for (const key of Object.keys(ASSET_PREFLIGHT_LIMITS)) {
      if (!Number.isSafeInteger(this.limits[key]) || this.limits[key] <= 0 || this.limits[key] > ASSET_PREFLIGHT_LIMITS[key]) throw Error("Invalid battlefield verification limit.");
    }
  }
  options;
  entries = /* @__PURE__ */ new Map();
  complete = /* @__PURE__ */ new Set();
  totalBytes = 0;
  limits;
  get files() {
    return this.complete.size;
  }
  get bytes() {
    return this.totalBytes;
  }
  checkCanceled() {
    this.options.signal?.throwIfAborted();
  }
  cached(url, kind, load) {
    this.checkCanceled();
    if (!url.startsWith("/art/") || !safeAssetPath(url.slice(5))) throw Error(`Invalid battlefield asset URL: ${url}`);
    const prior = this.entries.get(url);
    if (prior) {
      if (prior.kind !== kind) throw Error(`Conflicting battlefield asset types: ${url}`);
      return prior.value;
    }
    if (this.entries.size >= this.limits.files) throw Error("The battlefield asset list exceeds its supported size.");
    const value = Promise.resolve().then(load);
    this.entries.set(url, { kind, value });
    return value;
  }
  async read(url, limit) {
    this.checkCanceled();
    const controller = new AbortController(), parent = this.options.signal;
    const abort = () => controller.abort(parent?.reason);
    parent?.addEventListener("abort", abort, { once: true });
    const stopDeadline = (this.options.scheduleTimeout ?? ((callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    }))(() => controller.abort(new DOMException("Battlefield asset download timed out.", "TimeoutError")), 15e3);
    let stopped = false;
    const finishDownload = () => {
      if (!stopped) {
        stopped = true;
        stopDeadline();
        parent?.removeEventListener("abort", abort);
      }
    };
    let body = null;
    let reader;
    try {
      controller.signal.throwIfAborted();
      const response = await (this.options.fetch ?? globalThis.fetch)(url, { cache: "force-cache", credentials: "same-origin", redirect: "error", signal: controller.signal });
      controller.signal.throwIfAborted();
      body = response.body;
      if (!response.ok || !body) throw Error(`Battlefield asset failed to load: ${url}`);
      reader = body.getReader();
      const chunks = [];
      let size = 0;
      for (; ; ) {
        const { done, value } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) {
          finishDownload();
          break;
        }
        size += value.byteLength;
        this.totalBytes += value.byteLength;
        if (size > limit || this.totalBytes > this.limits.total) throw Error(`Battlefield asset exceeds its supported size: ${url}`);
        chunks.push(value.slice());
      }
      if (!size) throw Error(`Battlefield asset is empty: ${url}`);
      return new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
    } catch (error) {
      const cause = controller.signal.aborted ? controller.signal.reason : error;
      finishDownload();
      if (reader) await reader.cancel(cause).catch(() => {
      });
      else if (body) await body.cancel(cause).catch(() => {
      });
      throw cause;
    } finally {
      finishDownload();
      reader?.releaseLock();
    }
  }
  json(url) {
    return this.cached(url, "json", async () => {
      const blob = await this.read(url, this.limits.json);
      this.checkCanceled();
      let value;
      try {
        value = JSON.parse(await blob.text());
      } catch {
        throw Error(`Battlefield asset metadata is invalid: ${url}`);
      }
      this.checkCanceled();
      this.complete.add(url);
      return value;
    });
  }
  image(url) {
    return this.cached(url, "image", async () => {
      const blob = await this.read(url, this.limits.image);
      this.checkCanceled();
      let bitmap;
      try {
        bitmap = await (this.options.decode ?? createImageBitmap)(blob);
        this.checkCanceled();
        if (!Number.isSafeInteger(bitmap.width) || !Number.isSafeInteger(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) throw Error("Invalid image dimensions.");
        const result = { width: bitmap.width, height: bitmap.height };
        this.complete.add(url);
        return result;
      } catch (error) {
        this.checkCanceled();
        if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
        throw Error(`Battlefield image could not be decoded: ${url}`, { cause: error });
      } finally {
        bitmap?.close();
      }
    });
  }
};
async function planArtPreparation(index2, sheetIds, scale, verifier, onProgress) {
  const images = /* @__PURE__ */ new Map(), uiPairs = [], sheets = [...new Set(sheetIds)];
  const image = (url, next = { right: 0, bottom: 0 }) => {
    const previous = images.get(url);
    if (previous && (previous.width !== void 0 && next.width !== void 0 && previous.width !== next.width || previous.height !== void 0 && next.height !== void 0 && previous.height !== next.height)) throw Error(`Conflicting battlefield atlas dimensions: ${url}`);
    images.set(url, { width: next.width ?? previous?.width, height: next.height ?? previous?.height, right: Math.max(next.right, previous?.right ?? 0), bottom: Math.max(next.bottom, previous?.bottom ?? 0) });
  };
  const atlas2 = async (base, name, id) => {
    if (!safeAssetPath(name)) throw Error(`Invalid battlefield atlas path: ${id}`);
    const data = await verifier.json(base + name);
    if (!record(data) || !record(data.meta) || !safeAssetPath(data.meta.image) || !record(data.frames) || !Object.keys(data.frames).length) throw Error(`Invalid battlefield atlas image: ${id}`);
    const bounds = { right: 0, bottom: 0 };
    if (data.meta.size !== void 0) {
      const size = data.meta.size;
      if (!record(size) || !Number.isSafeInteger(size.w) || !Number.isSafeInteger(size.h) || size.w <= 0 || size.h <= 0) throw Error(`Invalid battlefield atlas dimensions: ${id}`);
      bounds.width = size.w;
      bounds.height = size.h;
    }
    for (const item of Object.values(data.frames)) {
      const frame = record(item) ? item.frame : void 0;
      if (!record(frame) || !["x", "y", "w", "h"].every((key) => Number.isSafeInteger(frame[key])) || frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0) throw Error(`Invalid battlefield atlas frame: ${id}`);
      bounds.right = Math.max(bounds.right, frame.x + frame.w);
      bounds.bottom = Math.max(bounds.bottom, frame.y + frame.h);
    }
    image(base + data.meta.image, bounds);
  };
  let model = 0;
  for (const id of sheets) {
    verifier.checkCanceled();
    onProgress?.(`Preparing model files ${++model} / ${sheets.length}`);
    const path = index2.sprites[id];
    if (!safeAssetPath(path)) throw Error(`Invalid battlefield asset path: ${id}`);
    const base = `/art/${path.slice(0, path.lastIndexOf("/") + 1)}`, meta = await verifier.json(`/art/${path}`);
    if (!record(meta) || !record(meta.atlases)) throw Error(`Missing battlefield atlas: ${id}`);
    const loadLayers = async (layers, onlyCameo = false) => {
      if (!record(layers) || !Object.keys(layers).length || Object.keys(layers).length > 16) throw Error(`Missing battlefield atlas: ${id}`);
      for (const [layer, names] of Object.entries(layers)) {
        if (onlyCameo && layer !== "beauty" && layer !== "team") continue;
        if (!Array.isArray(names) || names.length > 256 || layer === "beauty" && !names.length) throw Error(`Invalid battlefield atlas: ${id}`);
        for (const name of names) await atlas2(base, name, id);
      }
      if (onlyCameo && !Array.isArray(layers.beauty)) throw Error(`Missing battlefield cameo atlas: ${id}`);
    };
    await loadLayers(meta.atlases[scale] ?? meta.atlases["1x"]);
    const { portrait, build } = artUIKeys(index2, id);
    for (const [kind, key] of [["portraits", portrait], ["icons/build", build]]) {
      if (!key) continue;
      const pair = ["beauty", "team"].map((layer) => `/art/ui/${kind}/${key}@2x.${layer}.png`);
      pair.forEach((url) => image(url));
      uiPairs.push(pair);
    }
    if (!portrait) await loadLayers(meta.atlases["2x"], true);
  }
  return { images, uiPairs };
}
async function verifyArtImages(plan, verifier, onProgress) {
  const dimensions = /* @__PURE__ */ new Map();
  let complete = 0;
  onProgress?.(`Preparing battlefield images 0 / ${plan.images.size}`);
  for (const [url, required] of plan.images) {
    const size = await verifier.image(url);
    if (required.width !== void 0 && required.width !== size.width || required.height !== void 0 && required.height !== size.height || required.right > size.width || required.bottom > size.height) throw Error(`Battlefield atlas image dimensions do not match: ${url}`);
    dimensions.set(url, size);
    onProgress?.(`Preparing battlefield images ${++complete} / ${plan.images.size}`);
  }
  for (const [beauty, team] of plan.uiPairs) {
    const a = dimensions.get(beauty), b = dimensions.get(team);
    if (!a || !b || a.width !== b.width || a.height !== b.height) throw Error(`Battlefield illustration layers do not match: ${beauty}`);
  }
  verifier.checkCanceled();
}

// client/tests/runtime/asset-preflight.test.ts
var json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
var atlas = (image, width = 4, height = 4) => ({ meta: { image, size: { w: width, h: height } }, frames: { "idle/d00_f00": { frame: { x: 0, y: 0, w: width, h: height } } } });
var index = (sprites, portraits = [], buildIcons = []) => ({ format: 1, sprites, portraits, buildIcons, terrain: [], chrome: [], icons: true, emblems: true });
function graph(portraits = ["US.car"], buildIcons = ["US.car"]) {
  const resources = /* @__PURE__ */ new Map();
  const meta = { atlases: { "1x": { beauty: ["beauty-1.json"], team: ["team-1.json"], shadow: ["shadow-1.json"] }, "2x": { beauty: ["beauty-2.json"], team: ["team-2.json"], shadow: ["shadow-2.json"] } } };
  resources.set("/art/car/sprite.json", meta);
  for (const scale of [1, 2]) for (const layer of ["beauty", "team", "shadow"]) resources.set(`/art/car/${layer}-${scale}.json`, atlas(`${layer}-${scale}.png`));
  const calls = [], closed = [];
  const fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    return url.endsWith(".png") ? new Response(url) : resources.has(url) ? json(resources.get(url)) : new Response("missing", { status: 404 });
  };
  const verifier = new AssetPreflight({ fetch: fetcher, decode: async (blob) => {
    const url = await blob.text();
    return { width: 4, height: 4, close: () => {
      closed.push(url);
    } };
  } });
  return { resources, calls, closed, verifier, index: index({ "unit.US.car": "car/sprite.json" }, portraits, buildIcons) };
}
test("standard verifies selected world pages plus actual 2x portrait/build pairs, without unused 2x world pages", async () => {
  const g = graph(), progress = [];
  const plan = await planArtPreparation(g.index, ["unit.US.car", "unit.US.car"], "1x", g.verifier, (label) => progress.push(label));
  await verifyArtImages(plan, g.verifier, (label) => progress.push(label));
  assert.equal(g.calls.length, 11);
  assert.equal(g.verifier.files, 11);
  assert.equal(g.closed.length, 7);
  assert.ok(g.calls.includes("/art/ui/portraits/US.car@2x.beauty.png"));
  assert.ok(g.calls.includes("/art/ui/icons/build/US.car@2x.team.png"));
  assert.ok(!g.calls.some((url) => url.includes("-2.")));
  assert.equal(progress[0], "Preparing model files 1 / 1");
  assert.equal(progress.at(-1), "Preparing battlefield images 7 / 7");
});
test("high quality uses 2x world pages; the missing-high fallback matches the renderer", async () => {
  for (const missing of [false, true]) {
    const g = graph();
    if (missing) delete g.resources.get("/art/car/sprite.json").atlases["2x"];
    await verifyArtImages(await planArtPreparation(g.index, ["unit.US.car"], "2x", g.verifier), g.verifier);
    assert.ok(g.calls.includes(`/art/car/shadow-${missing ? 1 : 2}.png`));
    assert.ok(!g.calls.includes(`/art/car/beauty-${missing ? 2 : 1}.json`));
  }
});
test("a portrait also satisfies build fallback; missing portrait conservatively verifies every 2x beauty/team page", async () => {
  const portrait = graph(["US.car"], []);
  await verifyArtImages(await planArtPreparation(portrait.index, ["unit.US.car"], "1x", portrait.verifier), portrait.verifier);
  assert.equal(portrait.calls.length, 9);
  assert.ok(!portrait.calls.some((url) => url.includes("icons/build")));
  for (const build of [[], ["US.car"]]) {
    const g = graph([], build), meta = g.resources.get("/art/car/sprite.json");
    meta.atlases["2x"].beauty.push("other-state.json");
    g.resources.set("/art/car/other-state.json", { meta: { image: "other-state.png" }, frames: { "landing/d15_f12": { frame: { x: 0, y: 0, w: 4, h: 4 } } } });
    await verifyArtImages(await planArtPreparation(g.index, ["unit.US.car"], "1x", g.verifier), g.verifier);
    assert.ok(g.calls.includes("/art/car/other-state.png"));
    assert.ok(g.calls.includes("/art/car/team-2.png"));
    assert.ok(!g.calls.includes("/art/car/shadow-2.json"));
    assert.equal(g.calls.filter((url) => url.includes("icons/build")).length, build.length ? 2 : 0);
  }
});
test("a high-quality cameo fallback shares already verified metadata and images", async () => {
  const g = graph([], []);
  await verifyArtImages(await planArtPreparation(g.index, ["unit.US.car"], "2x", g.verifier), g.verifier);
  assert.equal(g.calls.length, 7);
  assert.equal(new Set(g.calls).size, 7);
  assert.equal(g.closed.length, 3);
});
test("per-launch concurrent URL dedup counts bytes and decode only once; later launches reverify", async () => {
  let fetches = 0, decodes = 0, closes = 0;
  const options = { fetch: (async () => {
    fetches++;
    return new Response("four");
  }), decode: async () => {
    decodes++;
    return { width: 2, height: 2, close() {
      closes++;
    } };
  } };
  const v = new AssetPreflight(options);
  const [a, b] = await Promise.all([v.image("/art/shared.png"), v.image("/art/shared.png")]);
  assert.equal(a, b);
  assert.equal(v.bytes, 4);
  assert.equal(v.files, 1);
  assert.deepEqual([fetches, decodes, closes], [1, 1, 1]);
  await new AssetPreflight(options).image("/art/shared.png");
  assert.equal(fetches, 2);
  assert.throws(() => v.json("/art/shared.png"), /Conflicting/);
});
test("image verification is sequential and closes each bitmap before the next decode", async () => {
  const plan = { images: new Map(Array.from({ length: 5 }, (_, i) => [`/art/${i}.png`, { right: 0, bottom: 0 }])), uiPairs: [] };
  let live = 0, peak = 0, closed = 0;
  const v = new AssetPreflight({ fetch: (async () => new Response("png")), decode: async () => {
    live++;
    peak = Math.max(peak, live);
    await Promise.resolve();
    return { width: 2, height: 2, close() {
      live--;
      closed++;
    } };
  } });
  await verifyArtImages(plan, v);
  assert.equal(peak, 1);
  assert.equal(live, 0);
  assert.equal(closed, 5);
});
function deadlineHarness(parent) {
  let callback, canceled = 0, requested = 0;
  const signals = [], controller = {};
  const fetcher = async (_url, init) => {
    requested++;
    const signal = init.signal;
    signals.push(signal);
    return new Response(new ReadableStream({ start(stream) {
      controller.stream = stream;
      signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
    } }));
  };
  const verifier = new AssetPreflight({ signal: parent, fetch: fetcher, scheduleTimeout: (next, milliseconds) => {
    assert.equal(milliseconds, 15e3);
    callback = next;
    return () => {
      callback = void 0;
      canceled++;
    };
  } });
  return { verifier, signals, controller, fire: () => callback?.(), pending: () => !!callback, cleared: () => canceled, requests: () => requested };
}
test("completed native EOF clears its deadline and detaches parent abort while preserving subsequent launch cancellation", async () => {
  const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json("/art/one.json");
  await Promise.resolve();
  h.controller.stream.enqueue(new TextEncoder().encode('{"ok":true}'));
  h.controller.stream.close();
  assert.deepEqual(await job, { ok: true });
  assert.equal(h.pending(), false);
  assert.equal(h.cleared(), 1);
  h.fire();
  parent.abort(new DOMException("User left", "AbortError"));
  assert.equal(h.signals[0].aborted, false, "finished response is not aborted 15s later or when the caller leaves");
  assert.throws(() => h.verifier.json("/art/two.json"), { name: "AbortError" });
  assert.equal(h.requests(), 1);
});
test("in-flight parent cancellation keeps its exact reason and clears the deadline", async () => {
  const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json("/art/one.json"), reason = new DOMException("User left", "AbortError");
  await Promise.resolve();
  parent.abort(reason);
  await assert.rejects(job, (error) => error === reason);
  assert.equal(h.cleared(), 1);
  assert.equal(h.verifier.files, 0);
});
test("in-flight 15s deadline remains a real TimeoutError and detaches parent listener", async () => {
  const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json("/art/one.json");
  await Promise.resolve();
  h.fire();
  await assert.rejects(job, { name: "TimeoutError" });
  assert.equal(h.cleared(), 1);
  const reason = h.signals[0].reason;
  parent.abort();
  assert.equal(h.signals[0].reason, reason);
});
test("download deadline is cleared at EOF before an asynchronous image decode finishes", async () => {
  let deadline, native, release, decoding;
  const started = new Promise((resolve) => {
    decoding = resolve;
  }), held = new Promise((resolve) => {
    release = resolve;
  });
  const v = new AssetPreflight({ scheduleTimeout: (callback) => {
    deadline = callback;
    return () => {
      deadline = void 0;
    };
  }, fetch: (async (_url, init) => {
    native = init.signal;
    return new Response("png");
  }), decode: async () => {
    decoding();
    await held;
    return { width: 1, height: 1, close() {
    } };
  } });
  const job = v.image("/art/slow-decode.png");
  await started;
  assert.equal(deadline, void 0);
  assert.equal(native?.aborted, false);
  release();
  await job;
});
test("failure cleanup cannot be replaced by a later timeout or parent abort while reader cancellation settles", async () => {
  const parent = new AbortController();
  let deadline, native, release, canceling;
  const started = new Promise((resolve) => {
    canceling = resolve;
  }), held = new Promise((resolve) => {
    release = resolve;
  });
  const v = new AssetPreflight({ signal: parent.signal, limits: { json: 1 }, scheduleTimeout: (callback) => {
    deadline = callback;
    return () => {
      deadline = void 0;
    };
  }, fetch: (async (_url, init) => {
    native = init.signal;
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode("12"));
    }, cancel() {
      canceling();
      return held;
    } }));
  }) });
  const job = v.json("/art/oversize.json");
  await started;
  assert.equal(deadline, void 0);
  parent.abort();
  assert.equal(native?.aborted, false);
  release();
  await assert.rejects(job, /exceeds/);
});
test("a queued already-canceled call performs no fetch", async () => {
  const parent = new AbortController(), h = deadlineHarness(parent.signal);
  const job = h.verifier.json("/art/one.json");
  parent.abort();
  await assert.rejects(job, { name: "AbortError" });
  assert.equal(h.requests(), 0);
});
test("fetch/header failures and native body errors preserve cause and clean the deadline", async () => {
  for (const kind of ["fetch", "body"]) {
    const reason = Error(kind), parent = new AbortController();
    let cleared = 0, signal;
    const v = new AssetPreflight({ signal: parent.signal, scheduleTimeout: () => () => {
      cleared++;
    }, fetch: (async (_url, init) => {
      signal = init.signal;
      if (kind === "fetch") throw reason;
      return new Response(new ReadableStream({ start(stream) {
        stream.error(reason);
      } }));
    }) });
    await assert.rejects(v.json("/art/file.json"), (error) => error === reason);
    parent.abort();
    assert.equal(cleared, 1);
    assert.equal(signal?.aborted, false);
  }
});
test("parent cancellation during image decoding closes the bitmap and is never relabeled as a corrupt image", async () => {
  const parent = new AbortController();
  let close = 0, native;
  const v = new AssetPreflight({ signal: parent.signal, fetch: (async (_url, init) => {
    native = init.signal;
    return new Response("png");
  }), decode: async () => {
    parent.abort();
    return { width: 1, height: 1, close() {
      close++;
    } };
  } });
  await assert.rejects(v.image("/art/a.png"), { name: "AbortError" });
  assert.equal(close, 1);
  assert.equal(native?.aborted, false);
  assert.equal(v.files, 0);
});
test("bad HTTP, empty body, malformed JSON and image decode failures remain failures", async () => {
  for (const [response, pattern] of [[new Response("denied", { status: 403 }), /failed to load/], [new Response(""), /empty/], [new Response("{bad"), /metadata is invalid/]]) {
    const v2 = new AssetPreflight({ fetch: (async () => response) });
    await assert.rejects(v2.json("/art/a.json"), pattern);
    assert.equal(v2.files, 0);
  }
  const v = new AssetPreflight({ fetch: (async () => new Response("bad png")), decode: async () => {
    throw Error("decoder failed");
  } });
  await assert.rejects(v.image("/art/a.png"), /could not be decoded/);
  assert.equal(v.files, 0);
});
test("encoded per-file/total limits still fail, stop the reader, and are counted once", async () => {
  for (const limits of [{ json: 3 }, { total: 3 }]) {
    let canceled = 0;
    const v2 = new AssetPreflight({ limits, fetch: (async () => new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode("1234"));
    }, cancel() {
      canceled++;
    } }))) });
    await assert.rejects(v2.json("/art/large.json"), /exceeds/);
    assert.equal(canceled, 1);
    assert.equal(v2.files, 0);
  }
  const v = new AssetPreflight({ limits: { total: 5 }, fetch: (async () => new Response("123")) });
  assert.equal(await v.json("/art/one.json"), 123);
  assert.equal(await v.json("/art/one.json"), 123);
  assert.equal(v.bytes, 3);
  await assert.rejects(v.json("/art/two.json"), /exceeds/);
});
test("the file ceiling is bounded, sealed-roster-derived, and cannot be raised by a caller", async () => {
  assert.equal(ASSET_PREFLIGHT_LIMITS.files, 16384);
  assert.ok(14222 + 22 + 136 * 4 < ASSET_PREFLIGHT_LIMITS.files);
  assert.equal(ASSET_PREFLIGHT_LIMITS.total, 2 * 1024 ** 3);
  assert.equal(ASSET_PREFLIGHT_LIMITS.json, 8 * 1024 ** 2);
  assert.equal(ASSET_PREFLIGHT_LIMITS.image, 64 * 1024 ** 2);
  assert.throws(() => new AssetPreflight({ limits: { files: 16385 } }), /Invalid/);
  let calls = 0;
  const v = new AssetPreflight({ limits: { files: 2 }, fetch: (async () => {
    calls++;
    return json({});
  }) });
  await v.json("/art/a.json");
  await v.json("/art/b.json");
  await v.json("/art/a.json");
  assert.throws(() => v.json("/art/c.json"), /supported size/);
  assert.equal(calls, 2);
});
test("a valid 4550-file graph exceeds the old ceiling and verifies within the new bound", async () => {
  const sprites = {}, ui = [];
  let fetched = 0, decoded = 0;
  for (let i = 0; i < 70; i++) {
    sprites[`unit.US.test${i}`] = `unit${i}/sprite.json`;
    ui.push(`US.test${i}`);
  }
  const v = new AssetPreflight({ fetch: (async (input) => {
    fetched++;
    const url = String(input);
    if (url.endsWith("/sprite.json")) return json({ atlases: { "1x": { beauty: Array.from({ length: 30 }, (_, i) => `page${i}.json`) } } });
    if (url.endsWith(".json")) return json(atlas(url.split("/").at(-1).replace(".json", ".png"), 1, 1));
    return new Response("png");
  }), decode: async () => {
    decoded++;
    return { width: 1, height: 1, close() {
    } };
  } });
  await verifyArtImages(await planArtPreparation(index(sprites, ui, ui), Object.keys(sprites), "1x", v), v);
  assert.equal(v.files, 4550);
  assert.equal(fetched, 4550);
  assert.equal(decoded, 2380);
});
test("path traversal, malformed or partial atlases, and conflicting image dimensions are rejected", async () => {
  for (const path of ["../a.json", "/a.json", "a%2fb", "a?x", "a#x", "a\\b", ""]) assert.equal(safeAssetPath(path), false);
  for (const value of [null, { meta: { image: "../bad.png" }, frames: {} }, { meta: { image: "a.png" }, frames: {} }, { meta: { image: "a.png" }, frames: { a: { frame: { x: -1, y: 0, w: 1, h: 1 } } } }]) {
    const g2 = graph();
    g2.resources.set("/art/car/beauty-1.json", value);
    await assert.rejects(planArtPreparation(g2.index, ["unit.US.car"], "1x", g2.verifier), /Invalid/);
  }
  const g = graph();
  g.resources.set("/art/car/team-1.json", atlas("beauty-1.png", 8, 8));
  await assert.rejects(planArtPreparation(g.index, ["unit.US.car"], "1x", g.verifier), /Conflicting/);
});
test("decoded atlas bounds and explicit UI pair dimensions must agree", async () => {
  const g = graph();
  g.resources.set("/art/car/beauty-1.json", atlas("beauty-1.png", 8, 8));
  await assert.rejects(verifyArtImages(await planArtPreparation(g.index, ["unit.US.car"], "1x", g.verifier), g.verifier), /dimensions do not match/);
  const v = new AssetPreflight({ fetch: (async (input) => new Response(String(input))), decode: async (blob) => ({ width: (await blob.text()).includes("team") ? 3 : 4, height: 4, close() {
  } }) });
  const plan = { images: /* @__PURE__ */ new Map([["/art/beauty.png", { right: 0, bottom: 0 }], ["/art/team.png", { right: 0, bottom: 0 }]]), uiPairs: [["/art/beauty.png", "/art/team.png"]] };
  await assert.rejects(verifyArtImages(plan, v), /illustration layers do not match/);
});
test("full advertised building UI keys replace unused high-world fallback pages", async () => {
  const g = graph(["building.US.barracks"], ["building.US.barracks"]);
  g.index.sprites = { "building.US.barracks": "car/sprite.json" };
  await verifyArtImages(await planArtPreparation(g.index, ["building.US.barracks"], "1x", g.verifier), g.verifier);
  assert.equal(g.calls.filter((url) => url.startsWith("/art/ui/")).length, 4);
  assert.ok(g.calls.includes("/art/ui/portraits/building.US.barracks@2x.beauty.png"));
  assert.ok(g.calls.includes("/art/ui/icons/build/building.US.barracks@2x.team.png"));
  assert.ok(!g.calls.some((url) => url.includes("-2.")));
});
test("preflight resolves portrait and build keys independently and keeps missing-portrait world fallback", async () => {
  for (const [portraits, builds] of [
    [["building.US.barracks"], ["US.barracks"]],
    [["US.barracks"], ["building.US.barracks"]],
    [[], ["building.US.barracks"]]
  ]) {
    const g = graph(portraits, builds);
    g.index.sprites = { "building.US.barracks": "car/sprite.json" };
    await verifyArtImages(await planArtPreparation(g.index, ["building.US.barracks"], "1x", g.verifier), g.verifier);
    for (const [kind, keys] of [["portraits", portraits], ["icons/build", builds]]) for (const key of keys) assert.ok(g.calls.includes(`/art/ui/${kind}/${key}@2x.beauty.png`));
    assert.equal(g.calls.includes("/art/car/beauty-2.png"), portraits.length === 0);
    assert.ok(!g.calls.includes("/art/car/shadow-2.png"));
  }
});
test("newly reachable advertised building UI missing from disk fails preflight rather than taking an unadvertised fallback", async () => {
  const g = graph(["building.US.barracks"], []);
  g.index.sprites = { "building.US.barracks": "car/sprite.json" };
  const v = new AssetPreflight({ fetch: (async (input) => {
    const url = String(input);
    if (url.startsWith("/art/ui/")) return new Response("missing", { status: 404 });
    return url.endsWith(".png") ? new Response(url) : json(g.resources.get(url));
  }), decode: async () => ({ width: 4, height: 4, close() {
  } }) });
  await assert.rejects(verifyArtImages(await planArtPreparation(g.index, ["building.US.barracks"], "1x", v), v), /failed to load/);
});
