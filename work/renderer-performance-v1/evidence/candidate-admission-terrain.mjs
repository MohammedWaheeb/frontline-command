// work/renderer-performance-v1/baseline/client/src/render/terrain.ts
import { Texture, Mesh, MeshGeometry } from "/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/client/node_modules/pixi.js/lib/index.mjs";

// work/renderer-performance-v1/baseline/client/src/render/iso.ts
var HALF_W = 32;
var HALF_H = 16;
var LEVEL_PX = 10;
function toScreen(xMt, yMt) {
  const x = xMt / 1e3, y = yMt / 1e3;
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

// work/renderer-performance-v1/baseline/client/src/render/terrain-materials.ts
var MATERIALS = ["sand", "packed_earth", "gravel_wash", "scrub_ground", "gravel", "rubble_ground", "asphalt", "shallow_water", "deep_water", "coast_sand", "ramp"];
var heightAt = (map, x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height ? 0 : map.tiles[y * map.width + x]?.height ?? 0;
var terrainAt = (map, x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height ? "blocked" : map.tiles[y * map.width + x]?.terrain ?? "open";
var adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function hash(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041 | 0;
  h = (h ^ h >>> 13) * 1274126177 | 0;
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function smoothNoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, s = (t) => t * t * (3 - 2 * t);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
}
function materialFor(map, x, y) {
  switch (terrainAt(map, x, y)) {
    case "road":
      return "asphalt";
    case "rubble":
      return "rubble_ground";
    case "cover":
      return "scrub_ground";
    case "water":
      return adjacent.some(([dx, dy]) => terrainAt(map, x + dx, y + dy) !== "water") ? "shallow_water" : "deep_water";
    case "cliff":
    case "blocked":
      return "gravel";
    case "ramp":
      return "ramp";
  }
  if (adjacent.some(([dx, dy]) => terrainAt(map, x + dx, y + dy) === "water")) return "coast_sand";
  if (terrainAt(map, x, y) === "open" && adjacent.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height && ["cliff", "blocked"].includes(terrainAt(map, x + dx, y + dy)))) return "gravel_wash";
  return smoothNoise(x, y, 24, 11) * 0.8 + smoothNoise(x, y, 9, 5) * 0.2 < 0.44 ? "packed_earth" : "sand";
}

// work/renderer-performance-v1/baseline/client/src/render/terrain-surface.ts
function projectSurfaceVertex(vertex) {
  const p = toScreen(vertex.x, vertex.y);
  return { x: p.x, y: p.y - vertex.height * LEVEL_PX };
}
function compareSurfaceTriangles(a, b) {
  return a.depth - b.depth || a.tile - b.tile || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function surfaceFogOpacity(triangle, visible, explored) {
  const opacity = (tile) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
  return Math.max(opacity(triangle.tile), triangle.neighbor === void 0 ? 0 : opacity(triangle.neighbor));
}

// work/renderer-performance-v1/baseline/client/src/render/terrain.ts
var CHUNK = 16;
var BLEED = 2;
function pointFogTiles(x, y, width, height) {
  const tx = x / 1e3, ty = y / 1e3, x0 = Math.max(0, Number.isInteger(tx) ? tx - 1 : Math.floor(tx)), x1 = Math.min(width - 1, Math.floor(tx)), y0 = Math.max(0, Number.isInteger(ty) ? ty - 1 : Math.floor(ty)), y1 = Math.min(height - 1, Math.floor(ty));
  const tiles = [];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) tiles.push(j * width + i);
  return tiles;
}
var tileFogOpacity = (tile, visible, explored) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
var indexArray = (values) => values.every((n) => n < 65536) ? new Uint16Array(values) : new Uint32Array(values);
function fogTopology(triangles, width, height) {
  const slotOf = /* @__PURE__ */ new Map(), pointOf = /* @__PURE__ */ new Map(), tileList = [], pointStart = [0], pointSlots = [], vertexPoints = [], fanCorners = [];
  const slot = (tile) => {
    let s = slotOf.get(tile);
    if (s === void 0) {
      s = tileList.length;
      slotOf.set(tile, s);
      tileList.push(tile);
    }
    return s;
  };
  const pointAt = (x, y) => {
    const key = `${x},${y}`;
    let point = pointOf.get(key);
    if (point === void 0) {
      point = pointStart.length - 1;
      pointOf.set(key, point);
      for (const tile of pointFogTiles(x, y, width, height)) pointSlots.push(slot(tile));
      pointStart.push(pointSlots.length);
    }
    return point;
  };
  for (const triangle of triangles) {
    slot(triangle.tile);
    if (triangle.neighbor !== void 0) slot(triangle.neighbor);
    for (const v of triangle.vertices) vertexPoints.push(pointAt(v.x, v.y));
    if (triangle.kind === "top") {
      const x = triangle.tile % width, y = Math.floor(triangle.tile / width);
      for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) fanCorners.push(pointAt((x + dx) * 1e3, (y + dy) * 1e3));
    } else fanCorners.push(0, 0, 0, 0);
  }
  return { fogTiles: Int32Array.from(tileList), fogPoints: indexArray(vertexPoints), fogPointStart: indexArray(pointStart), fogPointSlots: indexArray(pointSlots), fogFanCorners: indexArray(fanCorners) };
}
var FOG_FAN_CENTRE_CAP = 128;
function fogVertexAlphas(triangles, topology, opacity, visible, explored, out) {
  const { fogPoints, fogPointStart, fogPointSlots, fogFanCorners } = topology;
  const pointAlpha = (point) => {
    let alpha = 0;
    for (let s = fogPointStart[point]; s < fogPointStart[point + 1]; s++) alpha = Math.max(alpha, opacity[fogPointSlots[s]]);
    return alpha;
  };
  let any = false;
  for (let i = 0; i < triangles.length; i++) {
    const base = surfaceFogOpacity(triangles[i], visible, explored);
    let centre = 0;
    if (base === 0 && triangles[i].kind === "top") {
      let sum = 0;
      for (let c = 0; c < 4; c++) sum += pointAlpha(fogFanCorners[i * 4 + c]);
      centre = Math.min(FOG_FAN_CENTRE_CAP, sum / 4);
    }
    for (let j = 0; j < 3; j++) {
      let alpha = base;
      if (base === 0) {
        alpha = pointAlpha(fogPoints[i * 3 + j]);
        if (j === 0) alpha = Math.max(alpha, centre);
      }
      out[i * 3 + j] = alpha;
      any ||= alpha !== 0;
    }
  }
  return any;
}
var FLAT = { sand: "#b59a6a", packed_earth: "#8f7852", gravel_wash: "#998c72", scrub_ground: "#7c7448", gravel: "#8a8272", rubble_ground: "#6f675c", asphalt: "#4a4843", shallow_water: "#64847b", deep_water: "#305e64", coast_sand: "#cbbb8e", ramp: "#937c59" };
var TerrainBaker = class {
  constructor(map, art, resolution = 1) {
    this.map = map;
    this.art = art;
    this.resolution = resolution;
  }
  map;
  art;
  resolution;
  patterns = /* @__PURE__ */ new Map();
  faceTextures = /* @__PURE__ */ new Map();
  fogRamp;
  async load() {
    await Promise.all([...MATERIALS, "ground_macro", "road_asphalt_decal", "cliff_face_tier1", "cliff_face_tier2"].map(async (m) => {
      try {
        this.patterns.set(m, await this.art.terrain(m));
      } catch {
        this.patterns.set(m, void 0);
      }
    }));
  }
  chunkOrigin(cx, cy) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    return { x: (x0 - (y0 + CHUNK)) * HALF_W - BLEED, y: (x0 + y0) * HALF_H - BLEED };
  }
  get chunksX() {
    return Math.ceil(this.map.width / CHUNK);
  }
  get chunksY() {
    return Math.ceil(this.map.height / CHUNK);
  }
  /** Projected envelope of the chunk's owned geometry, including any public
   * height from zero through maxHeight. Partial edge chunks use their true tile
   * extent. Texture bleed cannot extend the triangle-clipped geometry. */
  chunkBounds(cx, cy, maxHeight) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(x0 + CHUNK, this.map.width), y1 = Math.min(y0 + CHUNK, this.map.height);
    return { left: (x0 - y1) * HALF_W, top: (x0 + y0) * HALF_H - maxHeight * LEVEL_PX, right: (x1 - y0) * HALF_W, bottom: (x1 + y1) * HALF_H };
  }
  /** Returns a texture whose top-left sits at chunkOrigin(cx,cy) in world px. */
  bake(cx, cy, raised = false) {
    const r = this.resolution, W = CHUNK * 2 * HALF_W + 2 * BLEED, H = CHUNK * 2 * HALF_H + 4 * LEVEL_PX + 2 * BLEED;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(W * r);
    canvas.height = Math.ceil(H * r);
    const ctx = canvas.getContext("2d");
    const x0 = cx * CHUNK, y0 = cy * CHUNK, origin = this.chunkOrigin(cx, cy);
    const iso = (c) => c.setTransform(HALF_W * r, HALF_H * r, -HALF_W * r, HALF_H * r, -origin.x * r, -origin.y * r);
    const used = /* @__PURE__ */ new Set();
    for (let y = y0 - 1; y <= y0 + CHUNK; y++) for (let x = x0 - 1; x <= x0 + CHUNK; x++) if (x >= 0 && y >= 0 && x < this.map.width && y < this.map.height) used.add(materialFor(this.map, x, y));
    const order = MATERIALS.filter((m) => used.has(m));
    for (const [i, m] of order.entries()) {
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lc = layer.getContext("2d");
      iso(lc);
      this.fillMaterial(lc, m, x0 - 1, y0 - 1, CHUNK + 2);
      if (i > 0) {
        const mask = document.createElement("canvas");
        mask.width = CHUNK + 4;
        mask.height = CHUNK + 4;
        const mc = mask.getContext("2d");
        const img = mc.createImageData(CHUNK + 4, CHUNK + 4);
        for (let ty = 0; ty < CHUNK + 4; ty++) for (let tx = 0; tx < CHUNK + 4; tx++) {
          const x = x0 - 2 + tx, y = y0 - 2 + ty;
          const on = x >= 0 && y >= 0 && x < this.map.width && y < this.map.height && materialFor(this.map, x, y) === m;
          img.data[(ty * (CHUNK + 4) + tx) * 4 + 3] = on ? 255 : 0;
        }
        mc.putImageData(img, 0, 0);
        lc.globalCompositeOperation = "destination-in";
        lc.imageSmoothingEnabled = true;
        lc.imageSmoothingQuality = "high";
        lc.drawImage(mask, x0 - 2.5 + 0.5, y0 - 2.5 + 0.5, CHUNK + 4, CHUNK + 4);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
    }
    iso(ctx);
    const macro = this.patterns.get("ground_macro");
    if (macro) {
      const pattern = ctx.createPattern(macro, "repeat");
      pattern.setTransform(new DOMMatrix([32 / macro.naturalWidth, 0, 0, 32 / macro.naturalHeight, 0, 0]));
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = pattern;
      ctx.fillRect(x0 - 1, y0 - 1, CHUNK + 2, CHUNK + 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    for (let y = Math.max(0, y0 - 1); y <= y0 + CHUNK && y < this.map.height; y++) for (let x = Math.max(0, x0 - 1); x <= x0 + CHUNK && x < this.map.width; x++) {
      const h = heightAt(this.map, x, y), terrain = terrainAt(this.map, x, y);
      if (h > 0) {
        ctx.fillStyle = `rgba(255,236,196,${Math.min(0.2, h * 0.05)})`;
        ctx.fillRect(x, y, 1, 1);
      }
      if (terrain === "cliff" || terrain === "blocked") {
        ctx.fillStyle = "rgba(40,34,26,0.45)";
        ctx.fillRect(x, y, 1, 1);
      }
      if (terrain === "road") this.roadEdges(ctx, x, y);
      for (const [dx, dy] of raised ? [] : [[1, 0], [0, 1]]) {
        const hn = heightAt(this.map, x + dx, y + dy);
        if (hn >= h) continue;
        const drop = (h - hn) * LEVEL_PX / HALF_H;
        ctx.fillStyle = "rgba(28,22,16,0.55)";
        if (dx) ctx.fillRect(x + 1, y, Math.min(0.6, drop * 0.35), 1);
        else ctx.fillRect(x, y + 1, 1, Math.min(0.6, drop * 0.35));
        ctx.strokeStyle = "rgba(255,236,196,0.35)";
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        if (dx) {
          ctx.moveTo(x + 1, y);
          ctx.lineTo(x + 1, y + 1);
        } else {
          ctx.moveTo(x, y + 1);
          ctx.lineTo(x + 1, y + 1);
        }
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    if (x0 + CHUNK >= this.map.width) ctx.fillRect(this.map.width - 0.15, y0, 0.15, CHUNK);
    if (y0 + CHUNK >= this.map.height) ctx.fillRect(x0, this.map.height - 0.15, CHUNK, 0.15);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "linear";
    return texture;
  }
  /** Two triangles own exactly this chunk's map tiles. The padded texture stays
   * opaque across shared edges; alpha-clipped rectangular sprites create seams
   * and camera-order-dependent overlaps when neighbouring chunks are blended. */
  mesh(cx, cy, texture) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(x0 + CHUNK, this.map.width), y1 = Math.min(y0 + CHUNK, this.map.height), origin = this.chunkOrigin(cx, cy);
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], positions = new Float32Array(corners.flatMap(([x, y]) => [(x - y) * HALF_W - origin.x, (x + y) * HALF_H - origin.y]));
    const uvs = new Float32Array(positions.map((value, i) => value * this.resolution / (i % 2 ? texture.height : texture.width)));
    const mesh = new Mesh({ texture, geometry: new MeshGeometry({ positions, uvs, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }) });
    mesh.position.set(origin.x, origin.y);
    return mesh;
  }
  /** Additive stage-2 API. Flat product mesh stays available until projection,
   * actor anchors, picking and fog are switched together by the integration owner. */
  surfaceFragments(cx, cy, texture, surface) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(x0 + CHUNK, this.map.width), y1 = Math.min(y0 + CHUNK, this.map.height), origin = this.chunkOrigin(cx, cy);
    if (x0 < 0 || y0 < 0 || x0 >= this.map.width || y0 >= this.map.height || surface.width !== this.map.width || surface.height !== this.map.height) throw new Error("Invalid surface chunk");
    const groups = /* @__PURE__ */ new Map();
    for (const triangle of surface.triangles({ left: x0 * 1e3, top: y0 * 1e3, right: x1 * 1e3, bottom: y1 * 1e3 })) {
      if (!triangle.frontFacing) continue;
      const tier = triangle.kind === "face" && Math.max(...triangle.vertices.map((v) => v.height)) - Math.min(...triangle.vertices.map((v) => v.height)) > 1 ? "cliff_face_tier2" : "cliff_face_tier1";
      const key = `${triangle.depth.toFixed(6)}:${triangle.kind}:${tier}`;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(triangle);
    }
    if (!this.fogRamp) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 1;
      const ctx = canvas.getContext("2d"), pixels = ctx.createImageData(256, 1);
      for (let alpha = 0; alpha < 256; alpha++) pixels.data.set([8, 9, 7, alpha], alpha * 4);
      ctx.putImageData(pixels, 0, 0);
      this.fogRamp = Texture.from(canvas);
      this.fogRamp.source.scaleMode = "linear";
    }
    return [...groups.values()].sort((a, b) => compareSurfaceTriangles(a[0], b[0])).map((triangles) => {
      triangles.sort(compareSurfaceTriangles);
      const first = triangles[0], positions = [], uvs = [], indices = [], fogUVs = new Float32Array(triangles.length * 6);
      const face = first.kind === "face", tier = Math.max(...first.vertices.map((v) => v.height)) - Math.min(...first.vertices.map((v) => v.height)) > 1 ? "cliff_face_tier2" : "cliff_face_tier1";
      for (const triangle of triangles) for (const vertex of triangle.vertices) {
        const p = projectSurfaceVertex(vertex), flatX = (vertex.x - vertex.y) / 1e3 * HALF_W, flatY = (vertex.x + vertex.y) / 1e3 * HALF_H;
        positions.push(p.x - origin.x, p.y - origin.y);
        indices.push(indices.length);
        if (face) uvs.push((vertex.x + vertex.y) / 4e3, (4 - vertex.height) / 4);
        else uvs.push((flatX - origin.x) * this.resolution / texture.width, (flatY - origin.y) * this.resolution / texture.height);
      }
      let material = texture;
      if (face) {
        let cached = this.faceTextures.get(tier);
        if (!cached) {
          const image = this.patterns.get(tier);
          if (image) {
            cached = Texture.from(image);
            cached.source.addressMode = "repeat";
            cached.source.scaleMode = "linear";
          } else {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 2;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#665342";
            ctx.fillRect(0, 0, 2, 2);
            cached = Texture.from(canvas);
          }
          this.faceTextures.set(tier, cached);
        }
        material = cached;
      }
      const geometry = new MeshGeometry({ positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) });
      geometry.batchMode = "batch";
      const mesh = new Mesh({ texture: material, geometry });
      mesh.position.set(origin.x, origin.y);
      mesh.zIndex = first.depth;
      if (face) mesh.tint = first.vertices[0].x === first.vertices[1].x && first.vertices[1].x === first.vertices[2].x ? 12103839 : 10064259;
      const fogGeometry = new MeshGeometry({ positions: new Float32Array(positions), uvs: fogUVs, indices: new Uint32Array(indices) });
      fogGeometry.batchMode = "batch";
      const fog = new Mesh({ texture: this.fogRamp, geometry: fogGeometry });
      fog.position.copyFrom(mesh.position);
      fog.zIndex = first.depth + 1e-4;
      const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (let i = 0; i < positions.length; i += 2) {
        bounds.left = Math.min(bounds.left, positions[i] + origin.x);
        bounds.right = Math.max(bounds.right, positions[i] + origin.x);
        bounds.top = Math.min(bounds.top, positions[i + 1] + origin.y);
        bounds.bottom = Math.max(bounds.bottom, positions[i + 1] + origin.y);
      }
      const topology = fogTopology(triangles, this.map.width, this.map.height), { fogTiles } = topology;
      const lastOpacity = new Uint8Array(fogTiles.length).fill(1), alphas = new Float32Array(triangles.length * 3);
      let shown = true, fogNeeded = true;
      const setFog = (visible, explored) => {
        let changed = false;
        for (let k = 0; k < fogTiles.length; k++) {
          const opacity = tileFogOpacity(fogTiles[k], visible, explored);
          if (opacity !== lastOpacity[k]) {
            lastOpacity[k] = opacity;
            changed = true;
          }
        }
        if (!changed) {
          fog.visible = shown && fogNeeded;
          return;
        }
        const any = fogVertexAlphas(triangles, topology, lastOpacity, visible, explored, alphas);
        for (let v = 0; v < alphas.length; v++) {
          const alpha = alphas[v];
          fogUVs[v * 2] = alpha === 0 ? 0 : (alpha + 0.75) / 256;
          fogUVs[v * 2 + 1] = 0.5;
        }
        fogNeeded = any;
        fog.visible = shown && any;
        fogGeometry.attributes.aUV.buffer.update();
      };
      setFog([], []);
      return { mesh, fog, triangles, depth: first.depth, bounds, setFog, setVisible(visible) {
        shown = visible;
        mesh.visible = visible;
        fog.visible = visible && fogNeeded;
      }, dispose() {
        geometry.destroy();
        fogGeometry.destroy();
        mesh.destroy();
        fog.destroy();
      } };
    });
  }
  /** Only after all raised fragments have been detached/disposed. */
  disposeSurfaceResources() {
    for (const texture of this.faceTextures.values()) texture.destroy(true);
    this.faceTextures.clear();
    this.fogRamp?.destroy(true);
    this.fogRamp = void 0;
  }
  roadEdges(ctx, x, y) {
    const image = this.patterns.get("road_asphalt_decal");
    if (!image) return;
    for (const [dx, dy, angle] of [[0, -1, Math.PI], [1, 0, -Math.PI / 2], [0, 1, 0], [-1, 0, Math.PI / 2]]) {
      const next = terrainAt(this.map, x + dx, y + dy);
      if (!["open", "rubble", "cover", "ramp"].includes(next)) continue;
      const phase = ((dx ? y : x) % 4 + 4) % 4;
      ctx.save();
      ctx.translate(x + 0.5, y + 0.5);
      ctx.rotate(angle);
      ctx.drawImage(image, phase * image.naturalWidth / 4, 0, image.naturalWidth / 4, image.naturalHeight, -0.5, 0.2, 1, 0.3);
      ctx.restore();
    }
  }
  fillMaterial(ctx, m, x, y, size) {
    const img = this.patterns.get(m);
    if (img) {
      const pattern = ctx.createPattern(img, "repeat");
      pattern.setTransform(new DOMMatrix([1 / 128, 0, 0, 1 / 128, 0, 0]));
      ctx.fillStyle = pattern;
    } else ctx.fillStyle = FLAT[m];
    ctx.fillRect(x, y, size, size);
  }
  /** Minimap colour per tile, from the same materials. */
  static minimapColor(map, x, y) {
    const t = terrainAt(map, x, y), h = heightAt(map, x, y);
    const base = { open: [128, 110, 76], road: [74, 72, 66], rubble: [98, 90, 80], cover: [104, 100, 62], water: [44, 62, 60], cliff: [70, 62, 50], blocked: [58, 52, 44], ramp: [120, 102, 72] };
    const [r, g, b] = base[t] ?? base.open;
    const k = 1 + h * 0.07;
    return [Math.min(255, r * k) | 0, Math.min(255, g * k) | 0, Math.min(255, b * k) | 0];
  }
};
export {
  CHUNK,
  FOG_FAN_CENTRE_CAP,
  TerrainBaker,
  fogTopology,
  fogVertexAlphas,
  heightAt,
  materialFor,
  terrainAt
};
