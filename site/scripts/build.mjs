#!/usr/bin/env node
// Builds the project site's generated inputs from the repository's real sources:
//   - data/rules.js       from pkg/content/rules.json (fixed-point values converted for display)
//   - img/*.webp          from game key art, rendered sprites and recorded screenshots
//   - inline icon sprite  injected into every page between the ICONS markers
// Unit and building renders come from raw Blender frames when present, otherwise from the
// packed sprite atlases in assets/build/sprites. Requires Node 18+, `cwebp` and `ffmpeg`.
// Run from anywhere: `node site/scripts/build.mjs` (add `--pages` to re-inject partials only).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SITE, "..");
const IMG = join(SITE, "img");
const FRAMES = join(ROOT, "assets/build/frames");
const PAGES_ONLY = process.argv.includes("--pages");
mkdirSync(join(IMG, "units"), { recursive: true });
mkdirSync(join(IMG, "buildings"), { recursive: true });

const TICKS = 20; // simulation ticks per second
const FP = 1000; // fixed-point scale used by rules.json

function webp(src, dest, args = []) {
  const from = join(ROOT, src);
  if (!existsSync(from)) {
    console.warn(`missing source, skipped: ${src}`);
    return false;
  }
  execFileSync("cwebp", ["-quiet", "-q", "82", "-alpha_q", "90", "-m", "6", ...args, from, "-o", join(IMG, dest)]);
  return true;
}

// Sprite frames sit in large transparent canvases; crop to the opaque pixels plus a margin.
function bbox(src) {
  const out = execFileSync(
    "sh",
    ["-c", `ffmpeg -hide_banner -i "$1" -vf alphaextract,bbox=min_val=12 -f null - 2>&1`, "sh", join(ROOT, src)],
  ).toString();
  const m = [...out.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].pop();
  if (!m) return null;
  const [x1, x2, y1, y2] = m.slice(1).map(Number);
  const [W, H] = out.match(/, (\d+)x(\d+)/).slice(1).map(Number);
  const pad = 6;
  const x = Math.max(0, x1 - pad), y = Math.max(0, y1 - pad);
  return [x, y, Math.min(W, x2 + 1 + pad) - x, Math.min(H, y2 + 1 + pad) - y];
}

// `--pages` only re-injects the icon sprite, nav and footer (no image or data work).
if (!PAGES_ONLY) {
// ---- Rules data -----------------------------------------------------------
const rules = JSON.parse(readFileSync(join(ROOT, "pkg/content/rules.json"), "utf8"));
// Ground units have an idle pose; aircraft only have flight poses.
const unitAnim = (id) => ["idle", "fly"].find((a) => existsSync(join(FRAMES, `unit.${id}/beauty/${a}/d04_f00.png`)));

// When the raw Blender frames are absent, cut the same pose out of the packed 2x
// sprite atlases the game ships (assets/build/sprites), using their ink bounds.
const SPRITES = join(ROOT, "assets/build/sprites");
function atlasFrame(sprite, layer, keys) {
  const dir = join(SPRITES, sprite);
  if (!existsSync(dir)) return null;
  for (const file of readdirSync(dir).filter((f) => f.startsWith(`${sprite}@2x.${layer}.`) && f.endsWith(".json")).sort()) {
    const atlas = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const key = keys.find((k) => atlas.frames[k]);
    if (!key) continue;
    const { frame, ink_bounds: ink } = atlas.frames[key];
    const box = ink || { x: 0, y: 0, w: frame.w, h: frame.h };
    return { key, png: `assets/build/sprites/${sprite}/${atlas.meta.image}`, crop: [frame.x + box.x, frame.y + box.y, box.w, box.h] };
  }
  return null;
}

const units = rules.units.map((u) => {
  const anim = unitAnim(u.id);
  const packed = anim ? null : atlasFrame(`unit.${u.id}`, "beauty", ["idle/d04_f00", "fly/d04_f00", "hover/d04_f00"]);
  const art = Boolean(anim || packed);
  if (packed) {
    webp(packed.png, `units/${u.id}.webp`, ["-crop", ...packed.crop.map(String)]);
    const team = atlasFrame(`unit.${u.id}`, "team", [packed.key]);
    if (team) webp(team.png, `units/${u.id}.team.webp`, ["-crop", ...packed.crop.map(String)]);
  } else if (art) {
    const beauty = `assets/build/frames/unit.${u.id}/beauty/${anim}/d04_f00.png`;
    const crop = bbox(beauty);
    const args = crop ? ["-crop", ...crop.map(String)] : [];
    webp(beauty, `units/${u.id}.webp`, args);
    const team = `assets/build/frames/unit.${u.id}/team/${anim}/d04_f00.png`;
    if (existsSync(join(ROOT, team))) webp(team, `units/${u.id}.team.webp`, args);
  }
  return {
    id: u.id, name: u.name, faction: u.faction, role: u.role,
    cost: u.cost / FP, build: u.build_ticks / TICKS, hp: u.hp / FP,
    armor: u.armor, supply: u.supply, tier: u.tier, speed: u.speed / FP,
    weapon: u.weapon || null, producer: u.producer,
    sight: u.sight / FP, detection: u.detection / FP, art,
  };
});

const weapons = rules.weapons.map((w) => ({
  id: w.id, kind: w.kind, damage: w.damage / FP,
  interval: w.interval_ticks / TICKS, min: w.min_range / FP, max: w.max_range / FP,
  ammo: w.ammo, splash: w.splash / FP, volley: w.volley,
}));

const buildings = rules.buildings.map((b) => ({
  id: b.id, name: b.name, faction: b.faction, cost: b.cost / FP,
  build: b.build_ticks / TICKS, hp: b.hp / FP, w: b.width, h: b.height,
  power: b.power_capacity ? `+${b.power_capacity}` : String(b.power_demand),
  slots: b.service_slots, defense: b.defense, qualifying: b.qualifying,
  prerequisites: b.prerequisites,
}));

const upgrades = rules.upgrades.map((u) => ({
  id: u.id, name: u.name, faction: u.faction, cost: u.cost / FP,
  time: u.build_ticks / TICKS, tier: u.tier, producer: u.producer,
}));

const armor = rules.armor.map((a) => ({ weapon: a.weapon, armor: a.armor, mult: a.multiplier / FP }));

const artIds = existsSync(FRAMES) ? readdirSync(FRAMES).filter((d) => d.startsWith("unit.")).length : units.filter((u) => u.art).length;
const data = {
  version: rules.version,
  counts: {
    units: units.length, weapons: weapons.length, buildings: buildings.length,
    upgrades: upgrades.length, unitsWithArt: units.filter((u) => u.art).length,
    unitsWithoutArt: units.filter((u) => !u.art).length, unitFrameSets: artIds,
  },
  units, weapons, buildings, upgrades, armor,
};
writeFileSync(
  join(SITE, "data/rules.js"),
  `// Generated by site/scripts/build.mjs from pkg/content/rules.json. Do not edit by hand.\nwindow.FC_RULES = ${JSON.stringify(data)};\n`,
);
console.log(`rules ${rules.version}: ${units.length} units (${data.counts.unitsWithArt} with rendered art), ${weapons.length} weapons, ${buildings.length} buildings`);

// ---- Building renders used on the factions page ----------------------------
const buildingRenders = [
  "US.hq", "US.airfield", "IR.hq", "IR.drone_hub", "SY.hq", "SY.safehouse", "SY.air_workshop", "SA.hq", "SA.airfield",
  "US.interceptor_battery", "SA.interceptor_battery", "IR.strategic_site", "US.strategic_site",
];
for (const id of buildingRenders) {
  const src = `assets/build/frames/building.${id}/beauty/idle/d00_f00.png`;
  if (!existsSync(join(ROOT, src))) {
    const packed = atlasFrame(`building.${id}`, "beauty", ["idle/d00_f00"]);
    if (packed) webp(packed.png, `buildings/${id}.webp`, ["-crop", ...packed.crop.map(String)]);
    else console.warn(`missing source, skipped: ${src}`);
    continue;
  }
  const crop = bbox(src);
  webp(src, `buildings/${id}.webp`, crop ? ["-crop", ...crop.map(String)] : []);
}

// ---- Key art and recorded screenshots --------------------------------------
webp("assets/build/ui/keyart/main_menu.png", "keyart-1920.webp", ["-resize", "1920", "0"]);
webp("assets/build/ui/keyart/main_menu.png", "keyart-960.webp", ["-resize", "960", "0"]);
// Current-build captures (beta interface, 31 October 2026), recorded by
// work/site-2026-10-31/captures/stage-battle.mjs and the beta capture script.
const CAP = "work/site-2026-10-31/captures";
const shots = {
  "ui-battle-hud.webp": [`${CAP}/battle-hud.png`],
  "ui-main-menu.webp": [`${CAP}/main-menu.png`],
  "ui-skirmish-setup.webp": [`${CAP}/skirmish-setup.png`],
  "ui-campaign.webp": [`${CAP}/campaign.png`],
  "ui-multiplayer.webp": [`${CAP}/multiplayer.png`],
  "ui-practice-range.webp": [`${CAP}/practice-range.png`],
  "ui-opening-fog.webp": [`${CAP}/opening-fog.png`],
  // Missile warning overlay, still drawn the same way; the capture carries a test-harness toolbar in the top 56px.
  "shot-volley.webp": ["work/evidence/tactical-overlay/banked-volley-raised-ground.png", ["-crop", "0", "56", "1600", "844"]],
};
for (const [dest, [src, args = []]] of Object.entries(shots)) webp(src, dest, args);

// ---- Tactical thumbnails of the eight launch maps, drawn from their tile data ----
mkdirSync(join(IMG, "maps"), { recursive: true });
const TERRAIN = {
  open: [46, 42, 34], road: [92, 80, 58], cover: [66, 78, 44], rubble: [78, 64, 50],
  cliff: [112, 94, 64], blocked: [16, 15, 13], water: [34, 46, 52],
};
const launchMaps = JSON.parse(readFileSync(join(ROOT, "content/release.json"), "utf8")).launch_maps;
for (const id of launchMaps) {
  const map = JSON.parse(readFileSync(join(ROOT, `content/maps/${id}.json`), "utf8"));
  const S = 3; // pixels per tile
  const W = map.width * S, H = map.height * S;
  const px = Buffer.alloc(W * H * 3);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b;
  };
  map.tiles.forEach((t, i) => {
    const base = TERRAIN[t.terrain] || TERRAIN.open;
    const lift = Math.min(t.height || 0, 3) * 9; // raised ground reads lighter
    const c = base.map((v) => Math.min(255, v + lift));
    const tx = (i % map.width) * S, ty = Math.floor(i / map.width) * S;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(tx + dx, ty + dy, c);
  });
  const mark = (pos, radius, color, square = false) => {
    const cx = Math.round((pos.x / FP) * S), cy = Math.round((pos.y / FP) * S);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (square || dx * dx + dy * dy <= radius * radius) put(cx + dx, cy + dy, color);
    }
  };
  (map.fields || []).forEach((f) => mark(f.position, 7, [168, 132, 63]));
  (map.stations || []).forEach((s) => mark(s.position, 5, [217, 207, 184], true));
  if (map.shipment?.position) mark(map.shipment.position, 5, [168, 132, 63], true);
  (map.spawns || []).forEach((s) => { mark(s.position, 9, [17, 16, 14], true); mark(s.position, 7, [226, 162, 50], true); });
  const ppm = join(IMG, "maps", `${id}.ppm`);
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), px]));
  execFileSync("cwebp", ["-quiet", "-q", "86", ppm, "-o", join(IMG, "maps", `${id}.webp`)]);
  unlinkSync(ppm);
}
console.log(`map thumbnails: ${launchMaps.length}`);

}

// ---- Inline icon sprite ----------------------------------------------------
const iconDir = join(SITE, "vendor/phosphor");
const symbols = readdirSync(iconDir)
  .filter((f) => f.endsWith(".svg"))
  .map((f) => {
    const svg = readFileSync(join(iconDir, f), "utf8");
    const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return `<symbol id="i-${f.replace(/\.svg$/, "")}" viewBox="0 0 256 256">${inner}</symbol>`;
  })
  .join("");
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`;
// Shared navigation and footer live in partials/ and are injected between markers,
// with the current page marked for assistive technology and the nav underline.
const navPartial = readFileSync(join(SITE, "partials/nav.html"), "utf8").trim();
const footerPartial = readFileSync(join(SITE, "partials/footer.html"), "utf8").trim();
for (const page of readdirSync(SITE).filter((f) => f.endsWith(".html"))) {
  const file = join(SITE, page);
  const html = readFileSync(file, "utf8");
  const nav = navPartial.replace(`<li><a href="${page}">`, `<li><a href="${page}" aria-current="page">`);
  const next = html
    .replace(/<!--ICONS:START-->[\s\S]*?<!--ICONS:END-->/, `<!--ICONS:START-->${sprite}<!--ICONS:END-->`)
    .replace(/<!--NAV:START-->[\s\S]*?<!--NAV:END-->/, `<!--NAV:START-->\n${nav}\n<!--NAV:END-->`)
    .replace(/<!--FOOTER:START-->[\s\S]*?<!--FOOTER:END-->/, `<!--FOOTER:START-->\n${footerPartial}\n<!--FOOTER:END-->`);
  if (next !== html) writeFileSync(file, next);
}
console.log("site build complete");
