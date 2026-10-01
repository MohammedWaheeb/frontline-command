// client/tests/runtime/art-ui.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// client/src/render/art.ts
import { Assets, Rectangle, Texture } from "pixi.js";

// client/src/content/catalog.ts
var AIR_ROLES = /* @__PURE__ */ new Set(["fighter", "strike", "gunship", "airlift", "isr", "scout_drone"]);
function classify(u) {
  if (u.armor === "infantry") return "infantry";
  if (AIR_ROLES.has(u.role)) return u.faction === "IR" || u.role === "scout_drone" ? "drone" : u.role === "gunship" || u.role === "airlift" ? "rotor" : "aircraft";
  if (u.role === "tank") return "tank";
  if (["rig", "hauler", "repair"].includes(u.role)) return "support";
  return "vehicle";
}

// client/src/render/art-id.ts
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

// client/src/content/art-ui.ts
function artUIKeys(index2, id) {
  if (!id || id.length >= 240 || id.includes("..") || !/^[A-Za-z0-9_.@-]+$/.test(id)) throw Error(`Invalid battlefield UI asset: ${id}`);
  const legacy = id.replace(/^(unit|building)\./, "");
  const advertised = (keys) => keys?.includes(id) ? id : legacy && keys?.includes(legacy) ? legacy : void 0;
  return { portrait: advertised(index2.portraits), build: advertised(index2.buildIcons) };
}

// client/src/render/alpha-picking.ts
function makeAlphaMask(width, height, rgba) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(width * height) || rgba.length !== width * height * 4) throw Error("Invalid atlas pixel data");
  const bits = new Uint8Array(Math.ceil(width * height / 8));
  for (let index2 = 0; index2 < width * height; index2++) if (rgba[index2 * 4 + 3] !== 0) bits[index2 >> 3] |= 1 << (index2 & 7);
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

// client/src/render/art.ts
var SpriteSheet = class {
  constructor(id, meta, scale, pages) {
    this.id = id;
    this.meta = meta;
    this.scale = scale;
    this.pages = pages;
    for (const state of meta.states) this.states.set(state.name, state);
    for (let pass = 0; pass < (meta.aliases?.length ?? 0); pass++) for (const alias of meta.aliases ?? []) {
      const source = this.states.get(alias.source);
      if (!source || this.states.has(alias.name)) continue;
      this.states.set(alias.name, { ...source, name: alias.name, progress_driven: alias.progress_driven ?? source.progress_driven });
      this.aliases.set(alias.name, alias);
    }
    for (const page of pages) for (const key of Object.keys(page.descriptors)) this.lookup.set(`${page.layer}|${key}`, page);
  }
  id;
  meta;
  scale;
  pages;
  states = /* @__PURE__ */ new Map();
  lookup = /* @__PURE__ */ new Map();
  disposed = false;
  aliases = /* @__PURE__ */ new Map();
  /** Screen scale that converts this atlas to 1× world pixels. */
  get pixelScale() {
    return this.scale === "2x" ? 0.5 : 1;
  }
  get statistics() {
    return { indexedPages: this.pages.length, residentPages: this.pages.filter((page) => page.texture).length, residentBytes: this.pages.reduce((sum, page) => sum + (page.texture ? page.bytes : 0), 0), pickingBytes: this.pages.reduce((sum, page) => sum + (page.alpha?.bits.byteLength ?? 0), 0) };
  }
  key(layer, state, direction, index2) {
    return `${layer}|${state}/d${String(direction).padStart(2, "0")}_f${String(index2).padStart(2, "0")}`;
  }
  sourceFrame(state, direction, index2) {
    for (let depth = 0; depth < this.aliases.size; depth++) {
      const alias = this.aliases.get(state);
      if (!alias) break;
      const source = this.states.get(alias.source);
      if (alias.reverse) index2 = source.frames - 1 - index2;
      state = alias.source;
    }
    return { state, direction, index: index2 };
  }
  hasFrame(layer, state, direction, index2) {
    const source = this.sourceFrame(state, direction, index2);
    return this.lookup.has(this.key(layer, source.state, source.direction, source.index));
  }
  frame(layer, state, direction, index2) {
    const source = this.sourceFrame(state, direction, index2), key = this.key(layer, source.state, source.direction, source.index), page = this.lookup.get(key);
    if (!page || this.disposed) return;
    page.lastUsed = performance.now();
    if (!page.texture) this.load(page);
    return page.frames.get(key);
  }
  has(state) {
    return this.states.has(state);
  }
  load(page) {
    if (page.pending || page.failed || this.disposed) return;
    page.pending = (async () => {
      await page.unloading;
      if (this.disposed) return;
      const generation = ++page.generation, texture = await Assets.load({ src: page.url, data: { resolution: 1 } });
      page.texture = texture;
      page.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
      if (page.layer === "beauty" || page.layer === "team") {
        const canvas = document.createElement("canvas");
        canvas.width = texture.source.pixelWidth;
        canvas.height = texture.source.pixelHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw Error("Atlas picking context unavailable");
        context.drawImage(texture.source.resource, 0, 0);
        page.alpha = makeAlphaMask(canvas.width, canvas.height, context.getImageData(0, 0, canvas.width, canvas.height).data);
        canvas.width = canvas.height = 0;
      }
      for (const [key, frame] of Object.entries(page.descriptors)) {
        const t = new Texture({ source: texture.source, frame: new Rectangle(frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h) });
        const ink = frame.ink_bounds, anchorY = frame.anchor?.y ?? 0.5;
        const valid = ink && [ink.x, ink.y, ink.w, ink.h].every(Number.isInteger) && ink.x >= 0 && ink.y >= 0 && ink.w > 0 && ink.h > 0 && ink.x + ink.w <= frame.frame.w && ink.y + ink.h <= frame.frame.h;
        page.frames.set(`${page.layer}|${key}`, { texture: t, atlasTexture: texture, anchorX: frame.anchor?.x ?? 0.5, anchorY, ...page.alpha ? { containsAlpha: (x, y, tolerance) => page.generation === generation && !!page.alpha && alphaInFrame(page.alpha, frame.frame, x, y, tolerance) } : {}, ...valid ? { bodyBottom: (ink.y + ink.h - anchorY * frame.frame.h) * this.pixelScale, inkBounds: ink } : {} });
      }
    })().catch(async (error) => {
      page.failed = true;
      page.generation++;
      page.alpha = void 0;
      for (const frame of page.frames.values()) frame.texture.destroy(false);
      page.frames.clear();
      const admitted = !!page.texture;
      page.texture = void 0;
      if (admitted) await Assets.unload(page.url).catch(() => {
      });
      console.warn("Sprite page failed to load", this.id, page.url, error);
    }).finally(() => {
      page.pending = void 0;
    });
  }
  async settle() {
    await Promise.all(this.pages.map((page) => page.pending));
  }
  unload(page) {
    if (page.pending || !page.texture) return;
    page.generation++;
    page.alpha = void 0;
    for (const frame of page.frames.values()) frame.texture.destroy(false);
    page.frames.clear();
    page.texture = void 0;
    page.unloading = Assets.unload(page.url).catch(() => {
    }).finally(() => {
      page.unloading = void 0;
    });
  }
  evictBefore(before) {
    for (const page of this.pages) if (page.lastUsed < before) this.unload(page);
  }
  async dispose() {
    this.disposed = true;
    await this.settle();
    for (const page of this.pages) this.unload(page);
    await Promise.all(this.pages.map((page) => page.unloading));
  }
};
var ArtLibrary = class {
  index;
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
    return [...this.loaded].reduce((sum, sheet) => {
      const next = sheet.statistics;
      return { indexedPages: sum.indexedPages + next.indexedPages, residentPages: sum.residentPages + next.residentPages, residentBytes: sum.residentBytes + next.residentBytes, pickingBytes: sum.pickingBytes + next.pickingBytes };
    }, { indexedPages: 0, residentPages: 0, residentBytes: 0, pickingBytes: 0 });
  }
  async settle() {
    await Promise.all([...this.loaded].map((sheet) => sheet.settle()));
  }
  /** Keep current on-screen frames; reclaim animations unused for ten seconds. */
  trim() {
    const budget = this.scale === "2x" ? 384 * 1024 * 1024 : 192 * 1024 * 1024;
    if (this.statistics.residentBytes > budget) for (const sheet of this.loaded) sheet.evictBefore(performance.now() - 1e4);
  }
  async init() {
    if (this.index) return this.index;
    const response = await fetch("/art/index.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Art index unavailable");
    this.index = await response.json();
    return this.index;
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
    const scale = this.scale, key = `${id}|${scale}`;
    let p = this.sheets.get(key);
    if (!p) {
      p = this.loadSheet(id, scale).catch((error) => {
        console.warn("Sprite failed to load", id, error);
        return void 0;
      });
      this.sheets.set(key, p);
    }
    return p;
  }
  async loadSheet(id, requestedScale) {
    await this.releaseWork;
    const index2 = await this.init(), rel = index2.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const response = await fetch(`/art/${rel}`);
    if (!response.ok) throw new Error("Sprite metadata unavailable");
    const meta = await response.json(), scale = meta.atlases[requestedScale] ? requestedScale : "1x";
    const pages = [];
    for (const [layer, files] of Object.entries(meta.atlases[scale])) for (const file of files) {
      const result = await fetch(base + file);
      if (!result.ok) throw new Error("Sprite atlas unavailable");
      const atlas = await result.json();
      pages.push({ url: base + atlas.meta.image, layer, descriptors: atlas.frames, frames: /* @__PURE__ */ new Map(), lastUsed: 0, bytes: 0, generation: 0 });
    }
    const sheet = new SpriteSheet(id, meta, scale, pages);
    this.loaded.add(sheet);
    return sheet;
  }
  image(url) {
    let p = this.images.get(url);
    if (!p) {
      p = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image failed: " + url));
        img.src = url;
      });
      this.images.set(url, p);
    }
    return p;
  }
  terrain(name) {
    return this.index?.terrain.includes(name) ? this.image(`/art/terrain/${name}.png`) : void 0;
  }
  /** Illustrated production/selection cameo composed from the real sprite layers. */
  cameo(id, teamColor, state = "idle", direction, purpose = "portrait") {
    const key = `${id}|${teamColor}|${state}|${direction}|${purpose}`;
    let p = this.cameos.get(key);
    if (!p) {
      p = this.composeCameo(id, teamColor, state, direction, purpose).catch(() => void 0);
      this.cameos.set(key, p);
    }
    return p;
  }
  async composeCameo(id, teamColor, stateName, direction, purpose) {
    const index2 = await this.init(), keys = artUIKeys(index2, id);
    const build = purpose === "build" && keys.build, key = build || keys.portrait;
    const ui = build ? "icons/build" : keys.portrait ? "portraits" : void 0;
    if (ui) {
      const [beauty, team] = await Promise.all(["beauty", "team"].map((layer) => this.image(`/art/ui/${ui}/${key}@2x.${layer}.png`)));
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
    const rel = index2.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const meta = await (await fetch(`/art/${rel}`)).json();
    const state = meta.states.find((s) => s.name === stateName) ?? meta.states.find((s) => ["idle", "fly", "hover", "full"].includes(s.name)) ?? meta.states[0];
    const dir = direction ?? (state.directions >= 16 ? Math.round(state.directions * 3 / 16) % state.directions : state.directions >= 8 ? 1 : 0);
    const frameKey = `${state.name}/d${String(dir).padStart(2, "0")}_f00`;
    const canvas = document.createElement("canvas");
    const [w, h] = meta.frame_size_2x;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const parts = [[state.name, frameKey]];
    if (state.part === "hull" && meta.states.some((s) => s.name === "aim")) {
      const aim = meta.states.find((s) => s.name === "aim");
      parts.push(["aim", `aim/d${String(Math.round(dir * aim.directions / state.directions) % aim.directions).padStart(2, "0")}_f00`]);
    }
    for (const [partState, key2] of parts) {
      for (const layer of ["beauty", "team"]) {
        const files = meta.atlases["2x"][layer];
        if (!files) continue;
        for (const file of files) {
          const atlas = await (await fetch(base + file)).json();
          const f = atlas.frames[key2];
          if (!f) continue;
          const img = await this.image(base + atlas.meta.image);
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
  /** Release GPU textures for a finished match; cameo data URLs stay cached. */
  release() {
    const previous = this.sheets;
    this.sheets = /* @__PURE__ */ new Map();
    const earlier = this.releaseWork;
    this.releaseWork = (async () => {
      await earlier;
      const sheets = await Promise.all(previous.values());
      for (const sheet of sheets) {
        if (sheet) {
          await sheet.dispose();
          this.loaded.delete(sheet);
        }
      }
    })();
    return this.releaseWork;
  }
};
var art = new ArtLibrary();

// client/tests/runtime/art-ui.test.ts
var index = (portraits, buildIcons = []) => ({ format: 1, sprites: {}, terrain: [], portraits, buildIcons, chrome: [], icons: true, emblems: true });
function canvasDocument() {
  const context = { drawImage() {
  }, fillRect() {
  }, globalCompositeOperation: "", fillStyle: "" };
  return { createElement(name) {
    assert.equal(name, "canvas");
    return { width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;real-composition-path" };
  } };
}
test("actual cameo consumer uses full advertised building portrait and build keys independently", async () => {
  const prior = globalThis.document;
  globalThis.document = canvasDocument();
  try {
    for (const purpose of ["portrait", "build"]) {
      const art2 = new ArtLibrary(), requests = [];
      art2.index = index(["building.US.barracks"], ["building.US.barracks"]);
      art2.image = async (url) => {
        requests.push(url);
        return { naturalWidth: 40, naturalHeight: 40 };
      };
      assert.equal(await art2.cameo("building.US.barracks", "#f00", "idle", 0, purpose), "data:image/png;real-composition-path");
      const kind = purpose === "build" ? "icons/build" : "portraits";
      assert.deepEqual(requests, ["beauty", "team"].map((layer) => `/art/ui/${kind}/building.US.barracks@2x.${layer}.png`));
    }
  } finally {
    globalThis.document = prior;
  }
});
test("actual build cameo falls back to its independently advertised portrait, and units retain legacy keys", async () => {
  const prior = globalThis.document;
  globalThis.document = canvasDocument();
  try {
    for (const [id, portraits, builds, purpose, wanted] of [
      ["building.US.barracks", ["building.US.barracks"], [], "build", "portraits/building.US.barracks"],
      ["building.US.barracks", ["building.US.barracks"], ["US.barracks"], "build", "icons/build/US.barracks"],
      ["building.US.barracks", ["US.barracks"], ["building.US.barracks"], "portrait", "portraits/US.barracks"],
      ["unit.US.rifle", ["US.rifle"], ["US.rifle"], "portrait", "portraits/US.rifle"]
    ]) {
      const art2 = new ArtLibrary(), requests = [];
      art2.index = index([...portraits], [...builds]);
      art2.image = async (url) => {
        requests.push(url);
        return { naturalWidth: 40, naturalHeight: 40 };
      };
      assert.ok(await art2.cameo(id, "#f00", "idle", 0, purpose));
      assert.deepEqual(requests, ["beauty", "team"].map((layer) => `/art/ui/${wanted}@2x.${layer}.png`));
    }
  } finally {
    globalThis.document = prior;
  }
});
test("an advertised illustration load failure retains the existing missing-art result without unadvertised retries", async () => {
  const art2 = new ArtLibrary(), requests = [];
  art2.index = index(["building.US.barracks"], ["US.barracks"]);
  art2.image = async (url) => {
    requests.push(url);
    throw Error("Missing frozen file");
  };
  assert.equal(await art2.cameo("building.US.barracks", "#f00"), void 0);
  assert.deepEqual(requests, ["beauty", "team"].map((layer) => `/art/ui/portraits/building.US.barracks@2x.${layer}.png`));
});
test("resolver prefers exact advertised keys independently and never guesses absent UI", () => {
  assert.deepEqual(artUIKeys(index(["US.rifle", "unit.US.rifle"], ["US.rifle"]), "unit.US.rifle"), { portrait: "unit.US.rifle", build: "US.rifle" });
  assert.deepEqual(artUIKeys(index(["US.barracks"], ["building.US.barracks", "US.barracks"]), "building.US.barracks"), { portrait: "US.barracks", build: "building.US.barracks" });
  assert.deepEqual(artUIKeys(index([], ["building.US.barracks"]), "building.US.barracks"), { portrait: void 0, build: "building.US.barracks" });
  assert.deepEqual(artUIKeys(index(["US.other"]), "unit.US.rifle"), { portrait: void 0, build: void 0 });
});
test("resolver rejects path traversal and URL syntax even when the malformed key is advertised", () => {
  for (const id of ["", "building../US.hq", "unit.US/rig", "unit.US\\rig", "unit.US%2frig", "unit.US.rig?x", "unit.US.rig#x", "x".repeat(240)]) {
    assert.throws(() => artUIKeys(index([id], [id]), id), /Invalid battlefield UI asset/);
  }
});
