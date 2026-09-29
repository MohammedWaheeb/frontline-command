// source/work/claude/fog-spur-max-v1/fog-spur.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// source/work/renderer-performance-v1/candidate/client/src/render/iso.ts
var HALF_W = 32;
var HALF_H = 16;
var LEVEL_PX = 10;
function toScreen(xMt, yMt) {
  const x = xMt / 1e3, y = yMt / 1e3;
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}
function toWorld(sx, sy) {
  const a = sx / HALF_W, b = sy / HALF_H;
  return { x: (a + b) / 2 * 1e3, y: (b - a) / 2 * 1e3 };
}

// source/work/renderer-performance-v1/candidate/client/src/render/terrain-surface.ts
var EPS = 1e-7;
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
var blocked = (terrain) => terrain === "cliff" || terrain === "water" || terrain === "blocked";
var mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, height: a.height + (b.height - a.height) * t });
function projectSurfaceVertex(vertex) {
  const p = toScreen(vertex.x, vertex.y);
  return { x: p.x, y: p.y - vertex.height * LEVEL_PX };
}
function compareSurfaceTriangles(a, b) {
  return a.depth - b.depth || a.tile - b.tile || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function surfaceFogOpacity(triangle, visible, explored) {
  const opacity2 = (tile) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
  return Math.max(opacity2(triangle.tile), triangle.neighbor === void 0 ? 0 : opacity2(triangle.neighbor));
}
function weights(p, a, b, c) {
  const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(det) < EPS) return;
  const u = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det, v = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
  if (u < -EPS || v < -EPS || u + v > 1 + EPS) return;
  return [u, v, 1 - u - v];
}
function interpolate(vertices, w) {
  return { x: vertices.reduce((n, v, i) => n + v.x * w[i], 0), y: vertices.reduce((n, v, i) => n + v.y * w[i], 0), height: vertices.reduce((n, v, i) => n + v.height * w[i], 0) };
}
function clip(poly, axis, value, greater) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = greater ? a[axis] >= value : a[axis] <= value, inb = greater ? b[axis] >= value : b[axis] <= value;
    if (ina) out.push(a);
    if (ina !== inb) out.push(mix(a, b, (value - a[axis]) / (b[axis] - a[axis])));
  }
  return out;
}
var TerrainSurface = class {
  width;
  height;
  maxHeight;
  levels;
  walkable;
  /** NW, NE, SE, SW heights for each tile. Unrelated sectors never share a corner. */
  corners;
  constructor(map2) {
    const { width, height, tiles } = map2;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256 || tiles.length !== width * height) throw new Error("Invalid public surface dimensions");
    this.width = width;
    this.height = height;
    this.levels = new Float64Array(tiles.length);
    this.walkable = new Uint8Array(tiles.length);
    this.corners = new Float64Array(tiles.length * 4);
    let max = 0;
    for (let i = 0; i < tiles.length; i++) {
      const level = tiles[i].height ?? 0;
      if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error("Invalid public surface height");
      this.levels[i] = level;
      this.walkable[i] = blocked(tiles[i].terrain) ? 0 : 1;
      max = Math.max(max, level);
    }
    this.maxHeight = max;
    for (let gy = 0; gy <= height; gy++) for (let gx = 0; gx <= width; gx++) {
      const incident = [{ x: gx - 1, y: gy - 1, corner: 2 }, { x: gx, y: gy - 1, corner: 3 }, { x: gx, y: gy, corner: 0 }, { x: gx - 1, y: gy, corner: 1 }].filter((p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height);
      const done = /* @__PURE__ */ new Set();
      for (let start = 0; start < incident.length; start++) {
        if (done.has(start)) continue;
        done.add(start);
        const group = [start], first = incident[start], firstID = first.y * width + first.x;
        if (this.walkable[firstID]) for (let n = 0; n < group.length; n++) for (let j = 0; j < incident.length; j++) {
          if (done.has(j)) continue;
          const a = incident[group[n]], b = incident[j];
          if (this.walkable[b.y * width + b.x] && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1) {
            done.add(j);
            group.push(j);
          }
        }
        const level = group.reduce((sum, j) => {
          const p = incident[j];
          return sum + this.levels[p.y * width + p.x];
        }, 0) / group.length;
        for (const j of group) {
          const p = incident[j];
          this.corners[(p.y * width + p.x) * 4 + p.corner] = level;
        }
      }
    }
  }
  valid(tile) {
    return Number.isInteger(tile) && tile >= 0 && tile < this.levels.length;
  }
  vertex(tile, corner) {
    const x = tile % this.width, y = Math.floor(tile / this.width);
    return { x: (x + (corner === 1 || corner === 2 ? 1 : 0)) * 1e3, y: (y + (corner >= 2 ? 1 : 0)) * 1e3, height: this.corners[tile * 4 + corner] };
  }
  triangle(id, tile, vertices, rest = {}) {
    return { id, tile, vertices, kind: "top", depth: vertices.reduce((sum, p) => sum + p.x + p.y, 0) / 3, frontFacing: true, ...rest };
  }
  topTriangles(tile) {
    if (!this.valid(tile)) return [];
    const x = tile % this.width, y = Math.floor(tile / this.width), center = { x: (x + 0.5) * 1e3, y: (y + 0.5) * 1e3, height: this.levels[tile] };
    return Array.from({ length: 4 }, (_, i) => this.triangle(`t${tile}.${i}`, tile, [center, this.vertex(tile, i), this.vertex(tile, (i + 1) % 4)]));
  }
  /** Each edge has exactly one owner (east/south, plus exterior north/west). */
  edgeFaces(tile) {
    if (!this.valid(tile)) return [];
    const x = tile % this.width, y = Math.floor(tile / this.width), out = [];
    const edges = [
      { edge: 1, neighbor: x + 1 < this.width ? tile + 1 : void 0, a: 1, b: 2, na: 0, nb: 3, front: true },
      { edge: 2, neighbor: y + 1 < this.height ? tile + this.width : void 0, a: 3, b: 2, na: 0, nb: 1, front: true }
    ];
    if (x === 0) edges.push({ edge: 3, a: 0, b: 3, na: 0, nb: 0, front: false });
    if (y === 0) edges.push({ edge: 0, a: 0, b: 1, na: 0, nb: 0, front: false });
    for (const edge of edges) {
      const neighbor = edge.neighbor;
      if (neighbor !== void 0 && this.walkable[tile] && this.walkable[neighbor]) continue;
      const a0 = this.vertex(tile, edge.a), a1 = this.vertex(tile, edge.b), b0 = neighbor === void 0 ? { ...a0, height: 0 } : this.vertex(neighbor, edge.na), b1 = neighbor === void 0 ? { ...a1, height: 0 } : this.vertex(neighbor, edge.nb);
      const d0 = a0.height - b0.height, d1 = a1.height - b1.height, breaks = [0, 1];
      if (d0 * d1 < 0) breaks.splice(1, 0, d0 / (d0 - d1));
      for (let i = 0; i < breaks.length - 1; i++) {
        const lo = breaks[i], hi = breaks[i + 1], aa = mix(a0, a1, lo), ab = mix(a0, a1, hi), ba = mix(b0, b1, lo), bb = mix(b0, b1, hi), difference = (aa.height + ab.height - ba.height - bb.height) / 2;
        if (Math.abs(difference) < EPS) continue;
        const frontFacing = difference > 0 === edge.front, blockedTile = !this.walkable[tile] ? tile : neighbor !== void 0 && !this.walkable[neighbor] ? neighbor : tile;
        const rest = { kind: "face", neighbor, frontFacing, blockedTile };
        for (const [n, v] of [[0, [aa, ba, ab]], [1, [ba, bb, ab]]]) {
          const p = v.map(projectSurfaceVertex);
          const area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y);
          if (Math.abs(area) > EPS) out.push(this.triangle(`f${tile}.${edge.edge}.${i}.${n}`, tile, [...v], rest));
        }
      }
    }
    return out;
  }
  *triangles(rect = { left: 0, top: 0, right: this.width * 1e3, bottom: this.height * 1e3 }) {
    const x0 = clamp(Math.floor(rect.left / 1e3), 0, this.width - 1), y0 = clamp(Math.floor(rect.top / 1e3), 0, this.height - 1), x1 = clamp(Math.ceil(rect.right / 1e3) - 1, 0, this.width - 1), y1 = clamp(Math.ceil(rect.bottom / 1e3) - 1, 0, this.height - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tile = y * this.width + x;
      yield* this.topTriangles(tile);
      yield* this.edgeFaces(tile);
    }
  }
  sampleGround(point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Invalid public surface point");
    const x = clamp(point.x / 1e3, 0, this.width - EPS), y = clamp(point.y / 1e3, 0, this.height - EPS), ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, tile = iy * this.width + ix, h = this.levels[tile], k = tile * 4, c = this.corners;
    if (fy <= fx && fy <= 1 - fx) return 2 * fy * h + (1 - fx - fy) * c[k] + (fx - fy) * c[k + 1];
    if (fx >= fy && fx >= 1 - fy) return 2 * (1 - fx) * h + (fx - fy) * c[k + 1] + (fx + fy - 1) * c[k + 2];
    if (fy >= fx && fy >= 1 - fx) return 2 * (1 - fy) * h + (fx + fy - 1) * c[k + 2] + (fy - fx) * c[k + 3];
    return 2 * fx * h + (fy - fx) * c[k + 3] + (1 - fx - fy) * c[k];
  }
  projectGround(point) {
    return projectSurfaceVertex({ ...point, height: this.sampleGround(point) });
  }
  /** Candidate intersections use the same actual triangles as drawing/fog. */
  pickSurface(screen) {
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const flat = toWorld(screen.x, screen.y), radius = Math.ceil(this.maxHeight * LEVEL_PX / (2 * HALF_H)) + 1;
    const rect = { left: flat.x - radius * 1e3, top: flat.y - radius * 1e3, right: flat.x + (radius + 1) * 1e3, bottom: flat.y + (radius + 1) * 1e3 };
    let best, bestDepth = -Infinity;
    for (const triangle of this.triangles(rect)) {
      if (!triangle.frontFacing) continue;
      const projected = triangle.vertices.map(projectSurfaceVertex), w = weights(screen, projected[0], projected[1], projected[2]);
      if (!w) continue;
      const point = interpolate(triangle.vertices, w), depth = point.x + point.y;
      if (depth < bestDepth - EPS || Math.abs(depth - bestDepth) <= EPS && best && compareSurfaceTriangles(triangle, best.triangle) <= 0) continue;
      const blockedTile = triangle.blockedTile;
      best = { triangle, point, screen: { ...screen }, commandPoint: triangle.kind === "face" && blockedTile !== void 0 ? { x: (blockedTile % this.width + 0.5) * 1e3, y: (Math.floor(blockedTile / this.width) + 0.5) * 1e3 } : { x: point.x, y: point.y } };
      bestDepth = depth;
    }
    return best;
  }
  projectedBounds(rect) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const triangle of this.triangles(rect)) for (const vertex of triangle.vertices) {
      const p = projectSurfaceVertex(vertex);
      left = Math.min(left, p.x);
      top = Math.min(top, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
    return { left, top, right, bottom };
  }
  /** Rigid support plane and exact clipped perimeter; does not flatten the map. */
  footprintSurface(center, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 256 || height > 256) throw new Error("Invalid visual footprint");
    const rect = { left: center.x - width * 500, top: center.y - height * 500, right: center.x + width * 500, bottom: center.y + height * 500 }, perimeter = [];
    let maximum = 0;
    for (const triangle of this.triangles(rect)) {
      if (triangle.kind !== "top") continue;
      let polygon = [...triangle.vertices];
      for (const [axis, value, greater] of [["x", rect.left, true], ["x", rect.right, false], ["y", rect.top, true], ["y", rect.bottom, false]]) polygon = clip(polygon, axis, value, greater);
      for (const p of polygon) {
        maximum = Math.max(maximum, p.height);
        if (Math.abs(p.x - rect.left) < EPS || Math.abs(p.x - rect.right) < EPS || Math.abs(p.y - rect.top) < EPS || Math.abs(p.y - rect.bottom) < EPS) perimeter.push(p);
      }
    }
    const unique = /* @__PURE__ */ new Map();
    for (const p of perimeter) {
      const key = `${p.x.toFixed(6)}:${p.y.toFixed(6)}`, old = unique.get(key);
      if (!old || p.height > old.height) unique.set(key, p);
    }
    const boundary = [...unique.values()].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
    return { height: maximum, top: [{ x: rect.left, y: rect.top, height: maximum }, { x: rect.right, y: rect.top, height: maximum }, { x: rect.right, y: rect.bottom, height: maximum }, { x: rect.left, y: rect.bottom, height: maximum }], boundary };
  }
};

// source/work/claude/fog-spur-max-v1/candidate-terrain.ts
import { Texture, Mesh, MeshGeometry } from "pixi.js";

// source/work/claude/fog-spur-max-v1/terrain-surface.ts
function surfaceFogOpacity2(triangle, visible, explored) {
  const opacity2 = (tile) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
  return Math.max(opacity2(triangle.tile), triangle.neighbor === void 0 ? 0 : opacity2(triangle.neighbor));
}

// source/work/claude/fog-spur-max-v1/candidate-terrain.ts
var CHUNK = 16;
function pointFogTiles(x, y, width, height) {
  const tx = x / 1e3, ty = y / 1e3, x0 = Math.max(0, Number.isInteger(tx) ? tx - 1 : Math.floor(tx)), x1 = Math.min(width - 1, Math.floor(tx)), y0 = Math.max(0, Number.isInteger(ty) ? ty - 1 : Math.floor(ty)), y1 = Math.min(height - 1, Math.floor(ty));
  const tiles = [];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) tiles.push(j * width + i);
  return tiles;
}
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
  return { fogTiles: Int32Array.from(tileList), fogPoints: indexArray(vertexPoints), fogPointStart: indexArray(pointStart), fogPointSlots: indexArray(pointSlots), fogFanCorners: indexArray(fanCorners), fogWidth: width, fogHeight: height };
}
var FOG_FAN_CENTRE_CAP = 128;
function fogVertexAlphas(triangles, topology, opacity2, visible, explored, out) {
  const { fogPoints, fogPointStart, fogPointSlots, fogFanCorners, fogWidth: width, fogHeight: height } = topology;
  const pointAlpha = (point) => {
    let alpha = 0;
    for (let s = fogPointStart[point]; s < fogPointStart[point + 1]; s++) alpha = Math.max(alpha, opacity2[fogPointSlots[s]]);
    return alpha;
  };
  const joined = (tile) => {
    const x = tile % width, y = Math.floor(tile / width);
    return x > 0 && !!visible[tile - 1] || x + 1 < width && !!visible[tile + 1] || y > 0 && !!visible[tile - width] || y + 1 < height && !!visible[tile + width];
  };
  let any = false;
  for (let i = 0; i < triangles.length; i++) {
    const base = surfaceFogOpacity2(triangles[i], visible, explored);
    let centre = 0, fill = 0;
    if (base === 0 && triangles[i].kind === "top") {
      let sum = 0, low = 255, high = 0;
      for (let c = 0; c < 4; c++) {
        const alpha = pointAlpha(fogFanCorners[i * 4 + c]);
        sum += alpha;
        low = Math.min(low, alpha);
        high = Math.max(high, alpha);
      }
      centre = Math.min(FOG_FAN_CENTRE_CAP, sum / 4);
      if (low > 0 && joined(triangles[i].tile)) fill = high;
    }
    for (let j = 0; j < 3; j++) {
      let alpha = base;
      if (fill) alpha = fill;
      else if (base === 0) {
        alpha = pointAlpha(fogPoints[i * 3 + j]);
        if (j === 0) alpha = Math.max(alpha, centre);
      }
      out[i * 3 + j] = alpha;
      any ||= alpha !== 0;
    }
  }
  return any;
}

// source/work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts
import { Texture as Texture2, Mesh as Mesh2, MeshGeometry as MeshGeometry2 } from "pixi.js";

// source/work/renderer-performance-v1/combined-candidate/client/src/render/terrain-surface.ts
function surfaceFogOpacity3(triangle, visible, explored) {
  const opacity2 = (tile) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
  return Math.max(opacity2(triangle.tile), triangle.neighbor === void 0 ? 0 : opacity2(triangle.neighbor));
}

// source/work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts
function pointFogTiles2(x, y, width, height) {
  const tx = x / 1e3, ty = y / 1e3, x0 = Math.max(0, Number.isInteger(tx) ? tx - 1 : Math.floor(tx)), x1 = Math.min(width - 1, Math.floor(tx)), y0 = Math.max(0, Number.isInteger(ty) ? ty - 1 : Math.floor(ty)), y1 = Math.min(height - 1, Math.floor(ty));
  const tiles = [];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) tiles.push(j * width + i);
  return tiles;
}
var indexArray2 = (values) => values.every((n) => n < 65536) ? new Uint16Array(values) : new Uint32Array(values);
function fogTopology2(triangles, width, height) {
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
      for (const tile of pointFogTiles2(x, y, width, height)) pointSlots.push(slot(tile));
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
  return { fogTiles: Int32Array.from(tileList), fogPoints: indexArray2(vertexPoints), fogPointStart: indexArray2(pointStart), fogPointSlots: indexArray2(pointSlots), fogFanCorners: indexArray2(fanCorners) };
}
var FOG_FAN_CENTRE_CAP2 = 128;
function fogVertexAlphas2(triangles, topology, opacity2, visible, explored, out) {
  const { fogPoints, fogPointStart, fogPointSlots, fogFanCorners } = topology;
  const pointAlpha = (point) => {
    let alpha = 0;
    for (let s = fogPointStart[point]; s < fogPointStart[point + 1]; s++) alpha = Math.max(alpha, opacity2[fogPointSlots[s]]);
    return alpha;
  };
  let any = false;
  for (let i = 0; i < triangles.length; i++) {
    const base = surfaceFogOpacity3(triangles[i], visible, explored);
    let centre = 0;
    if (base === 0 && triangles[i].kind === "top") {
      let sum = 0;
      for (let c = 0; c < 4; c++) sum += pointAlpha(fogFanCorners[i * 4 + c]);
      centre = Math.min(FOG_FAN_CENTRE_CAP2, sum / 4);
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

// source/work/claude/fog-spur-max-v1/fog-spur.test.ts
var map = (width, height, tile = () => ({ terrain: "open", height: 0 })) => ({ width, height, tiles: Array.from({ length: width * height }, (_, i) => tile(i % width, Math.floor(i / width))) });
var opacity = (tile, visible, explored) => visible[tile] ? 0 : explored[tile] ? 175 : 255;
var lcg = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
var CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
var CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
function pointTiles(x, y, width, height) {
  const tx = x / 1e3, ty = y / 1e3, x0 = Math.max(0, Number.isInteger(tx) ? tx - 1 : Math.floor(tx)), x1 = Math.min(width - 1, Math.floor(tx)), y0 = Math.max(0, Number.isInteger(ty) ? ty - 1 : Math.floor(ty)), y1 = Math.min(height - 1, Math.floor(ty)), out = [];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) out.push(j * width + i);
  return out;
}
function bakerFragments(surface) {
  const out = [];
  for (let cy = 0; cy * CHUNK < surface.height; cy++) for (let cx = 0; cx * CHUNK < surface.width; cx++) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(x0 + CHUNK, surface.width), y1 = Math.min(y0 + CHUNK, surface.height), groups = /* @__PURE__ */ new Map();
    for (const t of surface.triangles({ left: x0 * 1e3, top: y0 * 1e3, right: x1 * 1e3, bottom: y1 * 1e3 })) {
      if (!t.frontFacing) continue;
      const tier = t.kind === "face" && Math.max(...t.vertices.map((v) => v.height)) - Math.min(...t.vertices.map((v) => v.height)) > 1 ? 2 : 1;
      const key = `${t.depth.toFixed(6)}:${t.kind}:${tier}`;
      let g = groups.get(key);
      if (!g) {
        g = [];
        groups.set(key, g);
      }
      g.push(t);
    }
    for (const g of [...groups.values()].sort((a, b) => compareSurfaceTriangles(a[0], b[0]))) out.push(g.sort(compareSurfaceTriangles));
  }
  return out;
}
function prepare(surface) {
  return bakerFragments(surface).map((triangles) => ({ triangles, candidate: fogTopology(triangles, surface.width, surface.height), frozen: fogTopology2(triangles, surface.width, surface.height) }));
}
function evaluate(prepared, visible, explored) {
  const byId = /* @__PURE__ */ new Map();
  for (const { triangles, candidate, frozen } of prepared) {
    const out = new Float32Array(triangles.length * 3), old = new Float32Array(triangles.length * 3);
    fogVertexAlphas(triangles, candidate, Array.from(candidate.fogTiles, (t) => opacity(t, visible, explored)), visible, explored, out);
    fogVertexAlphas2(triangles, frozen, Array.from(frozen.fogTiles, (t) => opacity(t, visible, explored)), visible, explored, old);
    triangles.forEach((t, i) => byId.set(t.id, { triangle: t, alpha: [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]], frozen: [old[i * 3], old[i * 3 + 1], old[i * 3 + 2]] }));
  }
  return byId;
}
function spur(tile, width, height, visible, explored) {
  const x = tile % width, y = Math.floor(tile / width);
  const corners = CORNERS.map(([dx, dy]) => Math.max(0, ...pointTiles((x + dx) * 1e3, (y + dy) * 1e3, width, height).map((t) => opacity(t, visible, explored))));
  const joined = CARDINAL.some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < width && ny < height && visible[ny * width + nx];
  });
  return { corners, joined, filled: !!visible[tile] && Math.min(...corners) > 0 && joined, fill: Math.max(...corners) };
}
function checkAll(byId, width, height, visible, explored, label) {
  let fills = 0;
  for (const { triangle, alpha, frozen } of byId.values()) {
    const base = surfaceFogOpacity(triangle, visible, explored), id = `${label} ${triangle.id}`;
    alpha.forEach((a, j) => assert(a >= frozen[j], `${id} vertex ${j} reduced ${frozen[j]} -> ${a}`));
    if (base !== 0 || triangle.kind === "face") {
      assert.deepEqual(alpha, frozen, `${id}: protected triangle changed`);
      continue;
    }
    const s = spur(triangle.tile, width, height, visible, explored);
    if (s.filled) {
      assert.deepEqual(alpha, [s.fill, s.fill, s.fill], `${id}: spur not MAX-filled`);
      assert(s.fill === 175 || s.fill === 255);
      fills++;
    } else assert.deepEqual(alpha, frozen, `${id}: non-spur triangle changed`);
  }
  return fills;
}
var disk = (w, h, cx, cy, r) => Array.from({ length: w * h }, (_, i) => {
  const dx = i % w - cx, dy = Math.floor(i / w) - cy;
  return r >= 0 && dx * dx + dy * dy <= r * r;
});
test("S0 the recorded MIN-fill counterexample is preserved: MIN lowers vertices and an interior sample, MAX does not", () => {
  const rows = ["E V E", "E V E", "U U E"].map((r) => r.split(" ")), w = 3, h = 3, surface = new TerrainSurface(map(w, h));
  const visible = rows.flat().map((c) => c === "V"), explored = rows.flat().map((c) => c !== "U"), byId = evaluate(prepare(surface), visible, explored);
  const recorded = [128, 175, 175, 128, 175, 255, 128, 255, 255, 128, 255, 175];
  assert.deepEqual([0, 1, 2, 3].flatMap((i) => byId.get(`t4.${i}`).frozen), recorded, "frozen fog reproduces the recorded actual alphas");
  const s = spur(4, w, h, visible, explored);
  assert.deepEqual(s.corners, [175, 175, 255, 255]);
  assert(s.joined && s.filled);
  const min = Math.min(...s.corners);
  assert(recorded.some((a) => a > min), "MIN fill would lower a 255 vertex to 175");
  for (let i = 0; i < 4; i++) assert.deepEqual(byId.get(`t4.${i}`).alpha, [255, 255, 255]);
  const weights2 = [0.25, 0.25, 0.5], east = byId.get("t4.1"), sample = (a) => a.reduce((n, v, j) => n + v * weights2[j], 0);
  assert.equal(sample(east.frozen), 203.25);
  assert(min < sample(east.frozen));
  assert.equal(sample(east.alpha), 255);
  checkAll(byId, w, h, visible, explored, "counterexample");
});
test("S1 all 19683 public 3x3 masks, flat and raised: exact oracle, protected triangles equal, no vertex drops", () => {
  for (const raised of [false, true]) {
    const w = 3, h = 3, surface = new TerrainSurface(map(w, h, (x, y) => ({ terrain: "open", height: raised && x === 1 && y === 1 ? 1 : raised && x === 2 ? 2 : 0 }))), prepared = prepare(surface);
    if (raised) assert(prepared.some((p) => p.triangles[0].kind === "face"), "raised fixture has face triangles");
    let centreVisible = 0, filled = 0, solitary = 0;
    for (let mask = 0; mask < 19683; mask++) {
      const state = [];
      for (let k = 0, m = mask; k < 9; k++, m = Math.floor(m / 3)) state.push(m % 3);
      const visible = state.map((s2) => s2 === 2), explored = state.map((s2) => s2 >= 1), byId = evaluate(prepared, visible, explored);
      checkAll(byId, w, h, visible, explored, `mask ${state.join("")}`);
      if (!visible[4]) continue;
      centreVisible++;
      const s = spur(4, w, h, visible, explored), fan = [0, 1, 2, 3].map((i) => byId.get(`t4.${i}`));
      if (s.filled) {
        filled++;
        for (const { alpha } of fan) for (const c of s.corners) assert(alpha[0] >= c);
      } else if (!s.joined) {
        solitary++;
        for (const { alpha, frozen } of fan) assert.deepEqual(alpha, frozen, "solitary sighting unchanged");
      }
    }
    assert.equal(centreVisible, 6561);
    assert(filled > 0 && solitary > 0, "both branches exercised");
  }
});
test("S2 solitary sightings keep the capped centre in both fragments; diagonal-only contact is solitary", () => {
  const w = 7, h = 7, surface = new TerrainSurface(map(w, h)), prepared = prepare(surface), tile = 3 * w + 3;
  for (const remembered of [false, true]) {
    const visible2 = Array.from({ length: w * h }, (_, i) => i === tile), explored2 = visible2.map((v) => v || remembered), byId2 = evaluate(prepared, visible2, explored2), edge = remembered ? 175 : 255;
    assert.notEqual(byId2.get(`t${tile}.0`).triangle.depth, byId2.get(`t${tile}.1`).triangle.depth);
    for (let i = 0; i < 4; i++) assert.deepEqual(byId2.get(`t${tile}.${i}`).alpha, [FOG_FAN_CENTRE_CAP, edge, edge]);
    checkAll(byId2, w, h, visible2, explored2, "lone");
  }
  const visible = Array.from({ length: w * h }, (_, i) => (i % w + Math.floor(i / w)) % 2 === 0), explored = [...visible], byId = evaluate(prepared, visible, explored);
  assert.equal(checkAll(byId, w, h, visible, explored, "checkerboard"), 0);
  for (const e of byId.values()) assert.deepEqual(e.alpha, e.frozen);
  for (const t of [0, w - 1, (h - 1) * w + 3]) {
    const v = Array.from({ length: w * h }, (_, i) => i === t), b = evaluate(prepared, v, [...v]);
    for (const e of b.values()) assert.deepEqual(e.alpha, e.frozen, `lone ${t}`);
  }
});
test("S3 existing straight-edge coplanarity and interior-clear cases are exactly the frozen alphas", () => {
  const w = 8, h = 8, surface = new TerrainSurface(map(w, h)), prepared = prepare(surface);
  for (const remembered of [false, true]) for (const vertical of [false, true]) {
    const visible2 = Array.from({ length: w * h }, (_, i) => (vertical ? i % w : Math.floor(i / w)) >= 3), explored = visible2.map((v) => v || remembered), byId2 = evaluate(prepared, visible2, explored);
    for (const e of byId2.values()) assert.deepEqual(e.alpha, e.frozen, `${e.triangle.id} straight edge changed`);
    if (!vertical) for (let x = 1; x < w - 1; x++) assert.equal(byId2.get(`t${3 * w + x}.0`).alpha[0], (remembered ? 175 : 255) / 2);
  }
  const n = 9, square = new TerrainSurface(map(n, n)), visible = Array.from({ length: n * n }, (_, i) => {
    const x = i % n, y = Math.floor(i / n);
    return x >= 2 && x <= 6 && y >= 2 && y <= 6;
  }), byId = evaluate(prepare(square), visible, [...visible]);
  for (const e of byId.values()) assert.deepEqual(e.alpha, e.frozen);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) for (let i = 0; i < 4; i++) assert.deepEqual(byId.get(`t${y * n + x}.${i}`).alpha, [0, 0, 0]);
});
test("S4 raised/cliff random views: remembered, unknown and face vertices exact; only spur fans change", () => {
  const w = 37, h = 21, rand = lcg(11), m = map(w, h, (x, y) => ({ terrain: (x * 7 + y * 3) % 11 === 0 ? "cliff" : "open", height: x > 18 && y > 6 ? 2 : (x + y) % 9 === 0 ? 1 : 0 })), surface = new TerrainSurface(m), prepared = prepare(surface);
  let fills = 0;
  for (let round = 0; round < 8; round++) {
    const p = [0.2, 0.45, 0.7, 0.9][round % 4], visible = Array.from({ length: w * h }, () => rand() < p), explored = visible.map((v) => v || rand() < 0.5);
    fills += checkAll(evaluate(prepared, visible, explored), w, h, visible, explored, `round ${round}`);
  }
  assert(fills > 0, "the fixture exercises spur fills");
});
test("S5 every cardinal neighbour the fill reads is a fogTiles dependency, at map edges and chunk seams", () => {
  for (const [w2, h2] of [[37, 21], [16, 16], [17, 33], [1, 5], [5, 1]]) {
    const surface2 = new TerrainSurface(map(w2, h2, (x, y) => ({ terrain: "open", height: (x + y) % 5 === 0 ? 1 : 0 }))), prepared2 = prepare(surface2), rand = lcg(w2 * 97 + h2);
    for (const { triangles, candidate, frozen } of prepared2) {
      assert.equal(candidate.fogWidth, w2);
      assert.equal(candidate.fogHeight, h2);
      for (const key of ["fogTiles", "fogPoints", "fogPointStart", "fogPointSlots", "fogFanCorners"]) assert.deepEqual(candidate[key], frozen[key]);
      const deps = new Set(candidate.fogTiles);
      for (const t of triangles) {
        if (t.kind !== "top") continue;
        const x = t.tile % w2, y = Math.floor(t.tile / w2);
        for (const [dx, dy] of CARDINAL) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w2 && ny < h2) assert(deps.has(ny * w2 + nx), `${t.id}: cardinal ${nx},${ny} missing`);
        }
      }
      for (let round = 0; round < 4; round++) {
        const visible = Array.from({ length: w2 * h2 }, () => rand() < 0.5), explored = visible.map((v) => v || rand() < 0.5), out = new Float32Array(triangles.length * 3), again = new Float32Array(triangles.length * 3);
        fogVertexAlphas(triangles, candidate, Array.from(candidate.fogTiles, (t) => opacity(t, visible, explored)), visible, explored, out);
        const v2 = visible.map((v, i) => deps.has(i) ? v : rand() < 0.5), e2 = explored.map((e, i) => deps.has(i) ? e : rand() < 0.5);
        fogVertexAlphas(triangles, candidate, Array.from(candidate.fogTiles, (t) => opacity(t, v2, e2)), v2, e2, again);
        assert.deepEqual(again, out);
      }
    }
  }
  const w = 40, h = 40, surface = new TerrainSurface(map(w, h)), prepared = prepare(surface);
  for (const [a, b] of [[10 * w + 15, 10 * w + 16], [10 * w + 31, 10 * w + 32], [15 * w + 10, 16 * w + 10], [20, w + 20], [20 * w, 20 * w + 1]]) {
    const visible = Array.from({ length: w * h }, (_, i) => i === a || i === b), explored = [...visible], byId = evaluate(prepared, visible, explored);
    checkAll(byId, w, h, visible, explored, `seam ${a}/${b}`);
    for (const t of [a, b]) for (let i = 0; i < 4; i++) assert.deepEqual(byId.get(`t${t}.${i}`).alpha, [255, 255, 255], `tile ${t} fan ${i}`);
  }
  for (const [a, b] of [[39, w + 39], [39 * w + 39, 39 * w + 38]]) {
    const visible = Array.from({ length: w * h }, (_, i) => i === a || i === b), explored = [...visible], byId = evaluate(prepared, visible, explored);
    assert.equal(checkAll(byId, w, h, visible, explored, `corner ${a}/${b}`), 0);
  }
});
test("S6 vision disks r=2..14: poles are MAX-filled and no connected no-clear-corner tile keeps a bright centre", () => {
  const w = 40, h = 40, c = 20, surface = new TerrainSurface(map(w, h)), prepared = prepare(surface);
  for (let r = 2; r <= 14; r++) for (const memory of ["none", "ring", "all"]) {
    const visible = disk(w, h, c, c, r), explored = memory === "all" ? Array(w * h).fill(true) : memory === "ring" ? disk(w, h, c, c, r + 3) : [...visible], byId = evaluate(prepared, visible, explored);
    checkAll(byId, w, h, visible, explored, `r${r} ${memory}`);
    for (let tile = 0; tile < w * h; tile++) {
      if (!visible[tile]) continue;
      const s = spur(tile, w, h, visible, explored);
      if (!s.joined || Math.min(...s.corners) === 0) continue;
      for (let i = 0; i < 4; i++) {
        const a = byId.get(`t${tile}.${i}`).alpha;
        assert(a.every((v) => v === a[0]), `r${r} tile ${tile}: non-constant spur`);
        for (const k of s.corners) assert(a[0] >= k);
      }
    }
    for (const [px, py] of [[c, c - r], [c + r, c], [c, c + r], [c - r, c]]) {
      const pole = py * w + px, e = byId.get(`t${pole}.0`);
      assert(e.frozen[0] < Math.min(e.frozen[1], e.frozen[2]), `r${r} pole had the detached bright centre before`);
      assert.equal(e.alpha[0], memory === "none" ? 255 : 175);
    }
  }
});
test("S7 in-place shrink/regrow through the memoized setFog model matches a fresh recompute", () => {
  const w = 40, h = 40, surface = new TerrainSurface(map(w, h, (x, y) => ({ terrain: "open", height: x >= 16 && x < 24 && y >= 12 ? 1 : 0 }))), fragments = bakerFragments(surface);
  const memo = fragments.map((triangles) => {
    const topology = fogTopology(triangles, w, h), { fogTiles } = topology, lastOpacity = new Uint8Array(fogTiles.length).fill(1), alphas = new Float32Array(triangles.length * 3);
    let needed = true;
    const setFog = (visible2, explored2) => {
      let changed = false;
      for (let k = 0; k < fogTiles.length; k++) {
        const o = opacity(fogTiles[k], visible2, explored2);
        if (o !== lastOpacity[k]) {
          lastOpacity[k] = o;
          changed = true;
        }
      }
      if (changed) needed = fogVertexAlphas(triangles, topology, lastOpacity, visible2, explored2, alphas);
    };
    setFog([], []);
    return { triangles, setFog, alphas, needed: () => needed };
  });
  const visible = Array(w * h).fill(false), explored = Array(w * h).fill(false), rand = lcg(5);
  const step = (label) => {
    for (const f of memo) {
      f.setFog(visible, explored);
      const out = new Float32Array(f.triangles.length * 3), topology = fogTopology(f.triangles, w, h);
      const any = fogVertexAlphas(f.triangles, topology, Array.from(topology.fogTiles, (t) => opacity(t, visible, explored)), visible, explored, out);
      assert.deepEqual(f.alphas, out, `${label}: memoized alphas stale`);
      assert.equal(f.needed(), any, `${label}: fogNeeded stale`);
    }
  };
  const setDisk = (r, cx = 16, cy = 16) => {
    const d = disk(w, h, cx, cy, r);
    for (let i = 0; i < w * h; i++) {
      visible[i] = d[i];
      if (d[i]) explored[i] = true;
    }
  };
  for (const r of [2, 5, 9, 14, 9, 4, 2, -1, 3, 8, 14]) {
    setDisk(r);
    step(`disk ${r}`);
  }
  explored.fill(false);
  setDisk(6);
  step("rewind");
  setDisk(12, 20, 15);
  step("regrow");
  visible.fill(false);
  visible[10 * w + 15] = true;
  step("lone");
  visible[10 * w + 16] = true;
  step("joined");
  visible[10 * w + 16] = false;
  step("split");
  for (let round = 0; round < 12; round++) {
    for (let k = 0; k < 30; k++) {
      const i = Math.floor(rand() * w * h);
      visible[i] = !visible[i];
      if (visible[i]) explored[i] = true;
    }
    step(`sparse ${round}`);
  }
});
test("S8 documented tradeoff: a one-tile-wide visible corridor is filled end to end at its darkest corner", () => {
  const w = 12, h = 7, surface = new TerrainSurface(map(w, h)), visible = Array.from({ length: w * h }, (_, i) => Math.floor(i / w) === 3 && i % w >= 2 && i % w <= 9), explored = [...visible];
  const byId = evaluate(prepare(surface), visible, explored);
  checkAll(byId, w, h, visible, explored, "corridor");
  for (let x = 2; x <= 9; x++) for (let i = 0; i < 4; i++) assert.deepEqual(byId.get(`t${3 * w + x}.${i}`).alpha, [255, 255, 255], `corridor tile ${x}`);
});
//# sourceMappingURL=authored-tests.mjs.map
