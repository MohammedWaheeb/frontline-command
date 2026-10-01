// tests/runtime/audio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";

// src/audio/index.ts
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

// src/audio/battlefield-sound.ts
function ambienceFor(map) {
  const label = `${map.id} ${map.title}`.toLowerCase();
  if (/coast|port/.test(label)) return "sfx.ambient_coastal";
  if (/river/.test(label)) return "sfx.ambient_river";
  if (/highland|ridge|mountain/.test(label)) return "sfx.ambient_highland";
  if (/depot/.test(label)) return "sfx.ambient_depot";
  if (/industrial|factory/.test(label)) return "sfx.ambient_industrial";
  const wet = map.tiles.filter((tile) => tile.terrain === "water").length;
  if (wet > map.tiles.length * 0.08) return "sfx.ambient_river";
  if (map.tiles.filter((tile) => (tile.height ?? 0) > 0).length > map.tiles.length * 0.4) return "sfx.ambient_highland";
  if (map.tiles.filter((tile) => tile.terrain === "urban").length > map.tiles.length * 0.15) return "sfx.ambient_industrial";
  return "sfx.ambient_desert_wind";
}
var overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function battlefieldSounds(snapshot2, catalog, view, ambient, paused = false) {
  if (paused || snapshot2.outcome?.finished || snapshot2.countdown) return [];
  const width = view.viewport.right - view.viewport.left, height = view.viewport.bottom - view.viewport.top;
  if (width <= 0 || height <= 0) return [];
  const cx = (view.viewport.left + view.viewport.right) / 2, cy = (view.viewport.top + view.viewport.bottom) / 2;
  const candidates = snapshot2.entities.flatMap((entity) => {
    const unit = catalog.units.get(entity.type);
    if (!unit || entity.health <= 0 || entity.private?.container || !entity.position) return [];
    const rect = view.bounds(entity);
    if (!rect || !Object.values(rect).every(Number.isFinite) || !overlap(rect, view.viewport)) return [];
    const air = unit.armor === "air" && !entity.landed, moving = ["moving", "turning", "returning_cargo"].includes(entity.state);
    let id;
    if (air) {
      id = ["IR", "SY"].includes(unit.faction) ? "sfx.drone_prop_loop" : ["gunship", "airlift"].includes(unit.role) ? "sfx.rotor_loop" : "sfx.jet_pass";
    } else if (moving) {
      id = unit.armor === "infantry" ? "sfx.footsteps_squad" : unit.role === "rig" ? "sfx.engine_rig" : unit.role === "hauler" ? "sfx.engine_hauler" : unit.role === "tank" || unit.armor === "heavy" ? "sfx.engine_tracked_heavy" : unit.faction === "SY" ? "sfx.engine_technical" : unit.faction === "SA" ? "sfx.engine_8x8" : "sfx.engine_wheeled_light";
    }
    if (!id) return [];
    const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2, distance = Math.hypot((x - cx) / (width * 0.5), (y - cy) / (height * 0.5));
    return [{ key: `actor:${entity.id}`, id, gain: Math.max(0.06, 0.18 - distance * 0.07), pan: Math.max(-0.8, Math.min(0.8, (x - cx) / (width * 0.5))), repeatMs: id === "sfx.jet_pass" ? 8e3 : 0, distance }];
  }).sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key)).slice(0, 3);
  return [{ key: "map", id: ambient, gain: 0.07, pan: 0 }, ...candidates.map(({ distance, ...request }) => request)];
}
function impactSound(target, catalog) {
  if (!target || !catalog) return "sfx.impact_ground";
  if (catalog.buildings.has(target.type) || target.mapObject) return "sfx.impact_structure";
  const unit = catalog.units.get(target.type);
  if (!unit || unit.armor === "infantry") return "sfx.impact_ground";
  return unit.armor === "heavy" || unit.role === "tank" ? "sfx.impact_metal_heavy" : "sfx.impact_metal_light";
}

// src/content/catalog.ts
var CatalogIndex = class {
  constructor(raw) {
    this.raw = raw;
    for (const u of raw.units ?? []) this.units.set(u.id, u);
    for (const b of raw.buildings ?? []) this.buildings.set(b.id, b);
    for (const u of raw.upgrades ?? []) this.upgrades.set(u.id, u);
    for (const w of raw.weapons ?? []) this.weapons.set(w.id, w);
    for (const object of raw.object_classes ?? []) this.objects.set(object.id, object);
  }
  raw;
  units = /* @__PURE__ */ new Map();
  buildings = /* @__PURE__ */ new Map();
  upgrades = /* @__PURE__ */ new Map();
  weapons = /* @__PURE__ */ new Map();
  objects = /* @__PURE__ */ new Map();
  name(type) {
    return this.units.get(type)?.name ?? this.buildings.get(type)?.name ?? this.upgrades.get(type)?.name ?? mapObjectName(type) ?? type;
  }
  isBuilding(type) {
    return this.buildings.has(type);
  }
  unitClass(type) {
    const u = this.units.get(type);
    return u ? classify(u) : "vehicle";
  }
  cost(type) {
    return this.units.get(type)?.cost ?? this.buildings.get(type)?.cost ?? this.upgrades.get(type)?.cost;
  }
  buildTicks(type) {
    return this.units.get(type)?.build_ticks ?? this.buildings.get(type)?.build_ticks ?? this.upgrades.get(type)?.build_ticks;
  }
};
function mapObjectName(type) {
  if (type.startsWith("map.")) return type.slice(4).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return void 0;
}
var AIR_ROLES = /* @__PURE__ */ new Set(["fighter", "strike", "gunship", "airlift", "isr", "scout_drone"]);
function classify(u) {
  if (u.armor === "infantry") return "infantry";
  if (AIR_ROLES.has(u.role)) return u.faction === "IR" || u.role === "scout_drone" ? "drone" : u.role === "gunship" || u.role === "airlift" ? "rotor" : "aircraft";
  if (u.role === "tank") return "tank";
  if (["rig", "hauler", "repair"].includes(u.role)) return "support";
  return "vehicle";
}

// src/app/combat-feedback.ts
var ARMOR = /* @__PURE__ */ new Set(["infantry", "light", "heavy", "structure", "air"]);
var special = (id) => id === "SATURATION" || id === "SKYBREAKER";
function soldDestruction(event, snapshot2) {
  return event.kind === "destroyed" && event.owner === snapshot2.player && Number.isSafeInteger(event.entity) && event.entity > 0 && snapshot2.events.some((sale) => sale.kind === "building_sold" && sale.scope === "owner" && sale.owner === snapshot2.player && sale.entity === event.entity && sale.tick === event.tick && Number.isSafeInteger(sale.id) && sale.id > 0);
}
function combatFacts(event, snapshot2, catalog) {
  const raw = event.combat;
  const out = { metadata: raw === void 0 || raw === null ? "absent" : "invalid", hit: false, coverMitigated: false };
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !["weapon_fired", "impact"].includes(event.kind)) return out;
  const c = raw;
  if (typeof c.weapon !== "string") return out;
  const weapon = catalog.weapons.get(c.weapon);
  if (!weapon && !special(c.weapon)) return out;
  out.metadata = "known";
  out.weapon = c.weapon;
  out.weaponKind = special(c.weapon) ? "strategic" : weapon?.kind;
  if (event.kind !== "impact" || c.outcome !== "hit" || typeof c.targetArmor !== "string" || !ARMOR.has(c.targetArmor) || !Number.isInteger(event.entity) || event.entity <= 0) return out;
  if (special(c.weapon) || weapon?.kind === "tactical" || typeof weapon?.splash === "number" && weapon.splash > 0) return out;
  const target = snapshot2.entities.find((entity) => entity.id === event.entity);
  if (!target || target.state === "destroyed" || target.health <= 0 || target.private?.container) return out;
  out.hit = true;
  out.target = target.id;
  out.targetArmor = c.targetArmor;
  out.coverMitigated = c.coverMitigated === true && c.targetArmor === "infantry" && ["small", "auto"].includes(weapon?.kind ?? "");
  return out;
}

// src/audio/combat-sound.ts
function combatSound(event, snapshot2, previous, catalog) {
  if (event.kind === "missile_intercepted") return { kind: "intercept", sound: "sfx.intercept_burst", cooldown: 100 };
  if (event.kind === "decoy_triggered") return { kind: "decoy", caption: "Decoy defeated an incoming shot.", cooldown: 0 };
  if (event.kind !== "weapon_fired" && event.kind !== "impact") return;
  const facts = catalog ? combatFacts(event, snapshot2, catalog) : void 0;
  const extension = event.combat, legacy = facts?.metadata === "absent" || !catalog && extension == null;
  const entity = legacy ? snapshot2.entities.find((value) => value.id === event.entity) ?? previous.entities.find((value) => value.id === event.entity) : void 0;
  if (event.kind === "weapon_fired") {
    const weapon = facts?.weapon ?? (legacy && entity ? catalog?.units.get(entity.type)?.weapon ?? catalog?.buildings.get(entity.type)?.weapon : void 0);
    return { kind: "weapon", sound: weapon && !["SATURATION", "SKYBREAKER"].includes(weapon) ? `sfx.weapon.${weapon}` : void 0, cooldown: 60 };
  }
  let sound = "sfx.impact_ground";
  if (legacy) sound = impactSound(entity, catalog);
  else if (facts?.hit) {
    if (facts.targetArmor === "structure") sound = "sfx.impact_structure";
    else if (facts.targetArmor === "heavy") sound = "sfx.impact_metal_heavy";
    else if (facts.targetArmor === "light" || facts.targetArmor === "air") sound = "sfx.impact_metal_light";
  }
  return { kind: "impact", sound, cooldown: 70 };
}

// src/audio/director.ts
var title = (text) => text.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
var OWN_EVENTS = /* @__PURE__ */ new Set(["construction_complete", "unit_ready", "research_complete", "aircraft_returning", "capture_interrupted", "building_captured", "transfer_canceled"]);
var AudioDirector = class {
  constructor(mixer, catalog) {
    this.mixer = mixer;
    this.catalog = catalog;
  }
  mixer;
  catalog;
  viewport;
  ambience = "";
  paused = false;
  suspended = false;
  loopTimer;
  battlefieldToken = 0;
  advancedAt = 0;
  enduranceLost = /* @__PURE__ */ new Map();
  previous;
  lastEvent = 0;
  scene = "";
  faction = "US";
  combatUntil = 0;
  tensionUntil = 0;
  scope = "";
  connectionPhase = "";
  teammates = /* @__PURE__ */ new Map();
  attachBattlefield(map, viewport) {
    const token = ++this.battlefieldToken;
    this.viewport = viewport;
    this.ambience = ambienceFor(map);
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = setInterval(() => this.refreshContinuous(), 150);
    this.refreshContinuous();
    return () => {
      if (token !== this.battlefieldToken) return;
      this.viewport = void 0;
      if (this.loopTimer) clearInterval(this.loopTimer);
      this.loopTimer = void 0;
      this.mixer.continuous([]);
    };
  }
  setPaused(paused) {
    this.paused = paused;
    this.refreshContinuous();
  }
  refreshContinuous() {
    const catalog = this.catalog();
    if (!this.previous || !catalog || !this.viewport || this.suspended || performance.now() - this.advancedAt > 1e3) {
      this.mixer.continuous([]);
      return;
    }
    this.mixer.continuous(battlefieldSounds(this.previous, catalog, this.viewport(), this.ambience, this.paused));
  }
  dispose() {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.viewport = void 0;
    this.mixer.continuous([]);
  }
  operation(scope) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.connectionPhase = "";
    this.suspended = false;
    this.enduranceLost.clear();
    this.teammates.clear();
    this.previous = void 0;
    this.lastEvent = 0;
    this.combatUntil = 0;
    this.tensionUntil = 0;
    this.scene = "";
    this.mixer.reset();
    this.mixer.music([]);
  }
  discontinuity() {
    this.enduranceLost.clear();
    this.teammates.clear();
    this.previous = void 0;
    this.lastEvent = 0;
    this.mixer.reset();
    this.mixer.music([]);
    this.scene = "";
  }
  page(page, briefing) {
    if (this.scope) return;
    const scene = briefing ? `briefing:${briefing}` : page === "editor" ? "editor" : page === "network" ? "lobby" : "menu";
    if (this.scene === scene) return;
    this.scene = scene;
    this.mixer.reset();
    this.mixer.music([`music.${briefing ? "briefing_bed" : page === "editor" ? "editor_ambient" : page === "network" ? "lobby_loop" : "menu_theme"}`]);
  }
  briefing(id, faction) {
    this.mixer.stopTransient();
    this.mixer.clearCaptions();
    this.mixer.play(`vo.briefing.${id}${faction ? `.${faction}` : ""}`);
  }
  connection(phase) {
    if (phase === this.connectionPhase) return;
    this.connectionPhase = phase;
    if (phase === "reconnecting") {
      this.suspended = true;
      this.discontinuity();
      this.announce("reconnecting", void 0, 100);
    } else if (phase === "connected") {
      this.suspended = false;
      this.discontinuity();
    }
  }
  status(status) {
    for (const teammate of status.teammates) {
      if (this.teammates.get(teammate.player) === true && !teammate.connected) this.announce("teammate_disconnected", void 0, 100);
      this.teammates.set(teammate.player, teammate.connected);
    }
  }
  selection(entities, player) {
    const entity = entities.find((entity2) => entity2.owner === player && this.catalog()?.units.has(entity2.type));
    if (entity) this.unit(entity, "select");
  }
  receipt(kind, accepted, entity, code) {
    if (!accepted) {
      this.mixer.play("sfx.ui_error", { cooldown: 300 });
      if (code === "insufficient_credits") this.announce("insufficient_funds");
      else if (entity) this.unit(entity, "unavailable");
      return;
    }
    const event = ["move", "attack_move", "guard", "escort", "board", "unload", "capture", "rally", "harvest", "return_aircraft"].includes(kind) ? "move" : ["attack", "force_fire"].includes(kind) ? "attack" : ["stop", "hold"].includes(kind) ? "stop" : kind === "repair" ? "repair" : kind === "retreat" ? "retreat" : void 0;
    if (event && entity) this.unit(entity, event);
    else this.mixer.play(["train", "research", "build"].includes(kind) ? "sfx.ui_queue_add" : "sfx.ui_confirm", { cooldown: 200 });
  }
  unit(entity, event, key) {
    const unit = this.catalog()?.units.get(entity.type);
    if (!unit) return;
    const unitClass = classify(unit), family = unitClass === "infantry" ? "infantry" : ["aircraft", "rotor", "drone"].includes(unitClass) ? ["IR", "SY"].includes(unit.faction) ? "drone_operator" : "pilot" : "vehicle_crew";
    this.mixer.play(`vo.unit.${unit.faction}.${family}.${event}`, { key: key ?? `unit:${event}`, cooldown: event === "under_fire" ? 6e3 : event === "select" ? 2500 : 800, caption: `${unit.name}: ${title(event)}.`, priority: 10 });
  }
  announce(event, position, priority = 50, caption) {
    const location = position ? `${Math.floor(position.x / 1e4)},${Math.floor(position.y / 1e4)}` : "global";
    this.mixer.play(`vo.announcer.${this.faction}.${event}`, { key: `alert:${event}:${location}`, cooldown: 6e3, priority, caption: caption ?? title(event) });
  }
  snapshot(snapshot2) {
    const previous = this.previous;
    this.faction = snapshot2.players.find((player) => player.id === snapshot2.player)?.faction ?? "US";
    const boundary = !previous || snapshot2.player !== previous.player || snapshot2.tick < previous.tick || snapshot2.tick - previous.tick > 100;
    if (boundary && previous) this.discontinuity();
    if (!previous || snapshot2.tick !== previous.tick || snapshot2.player !== previous.player) this.advancedAt = performance.now();
    this.previous = snapshot2;
    this.refreshContinuous();
    if (boundary) {
      this.lastEvent = Math.max(0, ...snapshot2.events.filter((event) => event.tick <= snapshot2.tick).map((event) => event.id));
      this.battleMusic(snapshot2);
      return;
    }
    const seen = /* @__PURE__ */ new Set(), events = snapshot2.events.filter((event) => {
      if (event.id <= this.lastEvent || event.tick < previous.tick - 2 || event.tick > snapshot2.tick || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
    this.lastEvent = Math.max(this.lastEvent, ...snapshot2.events.filter((event) => event.tick <= snapshot2.tick).map((event) => event.id));
    for (const event of events) if (event.kind === "aircraft_endurance_lost" && event.owner === snapshot2.player) this.enduranceLost.set(event.entity, event.tick);
    for (const [id, tick] of this.enduranceLost) if (snapshot2.tick - tick > 100) this.enduranceLost.delete(id);
    const ownPlayer = snapshot2.players.find((player) => player.id === snapshot2.player);
    for (const player of snapshot2.players) {
      const old = previous.players.find((value) => value.id === player.id);
      if (old && player.id !== snapshot2.player && player.team !== ownPlayer?.team && !player.defeated && old.strategicProgress < 1e3 && player.strategicProgress >= 1e3) this.announce("enemy_strategic_ready", void 0, 100);
    }
    for (const event of events) this.event(event, snapshot2, previous);
    if (snapshot2.economy && previous.economy) {
      const low = snapshot2.economy.powerDemand > snapshot2.economy.powerCapacity, wasLow = previous.economy.powerDemand > previous.economy.powerCapacity;
      if (low && !wasLow) {
        this.announce("low_power");
        this.mixer.play("sfx.power_down");
      } else if (!low && wasLow) this.mixer.play("sfx.power_up");
    }
    if (!previous.indicators.length && snapshot2.indicators.length) this.announce("endgame_reveal");
    for (const entity of snapshot2.entities) {
      if (entity.owner !== snapshot2.player || !entity.private) continue;
      const old = previous.entities.find((value) => value.id === entity.id)?.private;
      if (!old) continue;
      const role = this.catalog()?.units.get(entity.type)?.role ?? this.catalog()?.buildings.get(entity.type)?.role;
      if ((role === "abm" || entity.type === "SA.mobile_abm") && old.charges > 0 && entity.private.charges === 0) this.announce("interceptor_depleted", entity.position, 100);
      if (role === "strategic" && old.charges === 0 && entity.private.charges > 0) this.announce("our_strategic_ready", entity.position, 50);
      if (role === "strategic" && old.chargeWork === 0 && entity.private.chargeWork > 0) this.announce("strategic_site_charging", entity.position, 50);
      if (old.cooldowns.some((cooldown) => cooldown.until > previous.tick && cooldown.until <= snapshot2.tick)) this.unit(entity, "ability_ready");
    }
    for (const field of snapshot2.fields) if (field.remaining === 0n && previous.fields.some((old) => old.id === field.id && old.remaining > 0n)) this.announce("field_depleted", field.position);
    if (snapshot2.outcome?.finished && !previous.outcome?.finished) {
      const own = snapshot2.players.find((player) => player.id === snapshot2.player), victory = !snapshot2.outcome.draw && snapshot2.outcome.winningTeam === own?.team;
      this.mixer.play(`music.stinger_${victory ? "victory" : "defeat"}`);
      this.announce(victory ? "mission_accomplished" : "mission_failed", void 0, 100, snapshot2.outcome.draw ? "Operation ended in a draw." : void 0);
      if (snapshot2.mission) this.mixer.afterSpeech(`vo.debrief.${snapshot2.mission.id}`);
    }
    this.battleMusic(snapshot2);
  }
  battleMusic(snapshot2) {
    const finished = snapshot2.outcome?.finished, key = finished ? "debrief" : `battle:${this.faction}`;
    if (this.scene !== key) {
      this.scene = key;
      if (finished) this.mixer.music(["music.debrief_bed"]);
      else this.mixer.music(["calm", "tension", "combat"].map((layer) => `music.battle_${this.faction}_${layer}`));
    }
    if (!finished) {
      const now = performance.now(), layer = now < this.combatUntil ? 2 : now < this.tensionUntil ? 1 : 0;
      this.mixer.music(["calm", "tension", "combat"].map((value) => `music.battle_${this.faction}_${value}`), [0, 1, 2].map((index) => index === layer ? 1 : 0));
    }
  }
  event(event, snapshot2, previous) {
    if (soldDestruction(event, snapshot2)) return;
    const entity = snapshot2.entities.find((entity2) => entity2.id === event.entity) ?? previous.entities.find((entity2) => entity2.id === event.entity), own = event.owner === snapshot2.player, catalog = this.catalog();
    const combat = combatSound(event, snapshot2, previous, catalog);
    if (combat) {
      if (combat.sound) this.mixer.play(combat.sound, { cooldown: combat.cooldown });
      if (combat.caption) this.mixer.caption(combat.caption, 70);
      if (combat.kind === "weapon" || combat.kind === "impact") this.combatUntil = performance.now() + 8e3;
      return;
    }
    if (event.kind === "under_attack" && own) {
      this.combatUntil = performance.now() + 8e3;
      if (entity && catalog?.buildings.has(entity.type)) this.announce("base_attacked", event.position, 100);
      else if (entity && catalog?.units.get(entity.type)?.role === "hauler") this.announce("hauler_attacked", event.position, 100);
      else if (entity) {
        const p = event.position;
        this.unit(entity, "under_fire", `attack:${p ? `${Math.floor(p.x / 1e4)},${Math.floor(p.y / 1e4)}` : "unknown"}`);
      }
      return;
    }
    if (event.kind === "destroyed") {
      const building = !!entity && !!catalog?.buildings.has(entity.type);
      this.mixer.play(building ? "sfx.explosion_building" : "sfx.explosion_small", { cooldown: 100 });
      if (own && !this.enduranceLost.has(event.entity)) this.announce(building ? "building_lost" : "unit_lost", event.position, 50);
      return;
    }
    if (OWN_EVENTS.has(event.kind) && own) {
      this.announce(event.kind === "transfer_canceled" ? "safehouse_transfer_canceled" : event.kind, event.position);
      if (event.kind === "construction_complete") this.mixer.play("sfx.construct_complete");
      return;
    }
    if (["missile_warning", "airstrike_warning", "raid_warning"].includes(event.kind)) {
      this.tensionUntil = performance.now() + 15e3;
      if (event.kind === "missile_warning") this.announce("missile_warning", event.position, 100);
      else this.mixer.caption(title(event.kind), 100);
      this.mixer.play("sfx.missile_warning_tone", { cooldown: 6e3 });
      return;
    }
    if (event.kind === "defeat_countdown" && own) {
      this.announce("defeat_countdown", void 0, 100);
      return;
    }
    if (event.kind === "objective_complete") {
      this.announce("objective_updated", void 0, 50, event.text ? `Objective complete: ${event.text}` : void 0);
      this.mixer.play("music.stinger_objective", { cooldown: 3e3 });
      return;
    }
    if (event.kind === "mission_warning" && event.text) {
      const prefix = `vo.warning.${snapshot2.mission?.id}.`, entry = Object.entries(this.mixer.manifest?.entries ?? {}).sort(([a], [b]) => Number(b.startsWith(prefix + this.faction + ".")) - Number(a.startsWith(prefix + this.faction + "."))).find(([id, value]) => id.startsWith(prefix) && value.variants.some((variant2) => (variant2.display_caption ?? variant2.caption) === event.text));
      if (entry) this.mixer.play(entry[0], { cooldown: 6e3, priority: 100 });
      else this.mixer.caption(event.text, 100);
      return;
    }
    if (event.kind === "aircraft_endurance_lost" && own) this.announce("aircraft_lost_emergency", event.position, 100);
    if (event.kind === "shipment_arrived") this.announce("shipment_arrived", event.position);
    if (event.kind === "service_lost" && own) {
      const current = snapshot2.entities.find((value) => value.id === event.entity && value.owner === snapshot2.player && value.health > 0 && value.state !== "destroyed");
      if (current?.private?.home === 0 && catalog?.units.get(current.type)?.armor === "air") this.announce("no_landing_slot", event.position);
    }
    if (event.kind === "building_sold" && own) this.mixer.play("sfx.sell");
    if (event.kind === "tactical_ping") this.mixer.play("sfx.ui_ping", { cooldown: 300 });
  }
};

// src/protocol/frontline_pb.ts
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
var file_frontline = /* @__PURE__ */ fileDesc("Cg9mcm9udGxpbmUucHJvdG8SDGZyb250bGluZS52MSKFBAoIRW52ZWxvcGUSKgoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG9IABIqCgZvcmRlcnMYAiABKAsyGC5mcm9udGxpbmUudjEuT3JkZXJCYXRjaEgAEjEKDG9yZGVyX3Jlc3VsdBgDIAEoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdEgAEjAKCHNuYXBzaG90GAQgASgLMhwuZnJvbnRsaW5lLnYxLlBsYXllclNuYXBzaG90SAASKQoFZGVsdGEYBSABKAsyGC5mcm9udGxpbmUudjEuU3RhdGVEZWx0YUgAEisKBnJlc3VtZRgGIAEoCzIZLmZyb250bGluZS52MS5SZXN1bWVNYXRjaEgAEisKBnJlc3VsdBgHIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFJlc3VsdEgAEiwKBWVycm9yGAggASgLMhsuZnJvbnRsaW5lLnYxLlByb3RvY29sRXJyb3JIABIiCgRwaW5nGAkgASgLMhIuZnJvbnRsaW5lLnYxLlBpbmdIABItCgdjb250cm9sGAogASgLMhouZnJvbnRsaW5lLnYxLk1hdGNoQ29udHJvbEgAEisKBnN0YXR1cxgLIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFN0YXR1c0gAQgkKB21lc3NhZ2UiagoLQ2xpZW50SGVsbG8SEAoIcHJvdG9jb2wYASABKA0SEgoKc2ltdWxhdGlvbhgCIAEoCRIUCgxjb250ZW50X2hhc2gYAyABKAkSDQoFdG9rZW4YBCABKAkSEAoIbWF0Y2hfaWQYBSABKAkiSgoLUmVzdW1lTWF0Y2gSKAoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG8SEQoJbGFzdF90aWNrGAIgASgNIh4KDE1hdGNoQ29udHJvbBIOCgZhY3Rpb24YASABKAkiVAoPQ29ubmVjdGlvblN0YXRlEg4KBnBsYXllchgBIAEoDRIRCgljb25uZWN0ZWQYAiABKAgSHgoWcmVjb25uZWN0X3JlbWFpbmluZ19tcxgDIAEoDSKYAQoLTWF0Y2hTdGF0dXMSFQoNcGF1c2VfZW5hYmxlZBgBIAEoCBIOCgZwYXVzZWQYAiABKAgSEwoLcGF1c2Vfdm90ZXMYAyADKA0SMAoJdGVhbW1hdGVzGAQgAygLMh0uZnJvbnRsaW5lLnYxLkNvbm5lY3Rpb25TdGF0ZRIbChN3YWl0aW5nX2Zvcl9wbGF5ZXJzGAUgASgIIhUKBFBpbmcSDQoFbm9uY2UYASABKA0iQwoNUHJvdG9jb2xFcnJvchIMCgRjb2RlGAEgASgJEg8KB21lc3NhZ2UYAiABKAkSEwoLcmVjb3ZlcmFibGUYAyABKAgiGwoDVmVjEgkKAXgYASABKBESCQoBeRgCIAEoESKsAQoFT3JkZXISDAoEa2luZBgBIAEoCRIQCghlbnRpdGllcxgCIAMoDRIOCgZ0YXJnZXQYAyABKA0SIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEgwKBHR5cGUYBSABKAkSDgoGcXVldWVkGAYgASgIEg0KBWluZGV4GAcgASgFEiEKBnBvaW50cxgIIAMoCzIRLmZyb250bGluZS52MS5WZWMiQwoKT3JkZXJCYXRjaBIQCghzZXF1ZW5jZRgBIAEoDRIjCgZvcmRlcnMYAiADKAsyEy5mcm9udGxpbmUudjEuT3JkZXIibAoLT3JkZXJSZXN1bHQSDgoGcGxheWVyGAEgASgNEhAKCHNlcXVlbmNlGAIgASgNEg0KBWluZGV4GAMgASgFEhAKCGFjY2VwdGVkGAQgASgIEgwKBGNvZGUYBSABKAkSDAoEdGljaxgGIAEoDSJ6CghNZXRhZGF0YRISCgpzaW11bGF0aW9uGAEgASgJEhAKCHByb3RvY29sGAIgASgNEhQKDGNvbnRlbnRfaGFzaBgDIAEoCRITCgttYXBfdmVyc2lvbhgEIAEoCRIPCgdydWxlc2V0GAUgASgJEgwKBHNlZWQYBiABKAQiJQoIQ29vbGRvd24SCgoCaWQYASABKAkSDQoFdW50aWwYAiABKA0imAEKA0pvYhIMCgR0eXBlGAEgASgJEhAKCHJlc2VhcmNoGAIgASgIEgwKBHBhaWQYAyABKAMSDAoEd29yaxgEIAEoDRIQCghyZXF1aXJlZBgFIAEoDRIOCgZzdXBwbHkYBiABKAUSDwoHc2VydmljZRgHIAEoDRIPCgdzdGFydGVkGAggASgIEhEKCWVtZXJnZW5jeRgJIAEoCCKLAgoHRWNvbm9teRIPCgdjcmVkaXRzGAEgASgDEg4KBmVuZXJneRgCIAEoAxIOCgZzdXBwbHkYAyABKAUSFwoPcmVzZXJ2ZWRfc3VwcGx5GAQgASgFEhYKDnBvd2VyX2NhcGFjaXR5GAUgASgFEhQKDHBvd2VyX2RlbWFuZBgGIAEoBRIMCgR0aWVyGAcgASgFEg4KBmluY29tZRgIIAEoAxIWCg5yZXBhaXJfcmVzZXJ2ZRgJIAEoAxIQCgh1cGdyYWRlcxgKIAMoCRIpCgljb29sZG93bnMYCyADKAsyFi5mcm9udGxpbmUudjEuQ29vbGRvd24SFQoNbGFzdF9zZXF1ZW5jZRgMIAEoDSK4AwoNRW50aXR5UHJpdmF0ZRIKCgJocBgBIAEoAxIOCgZtYXhfaHAYAiABKAMSHwoEam9icxgDIAMoCzIRLmZyb250bGluZS52MS5Kb2ISIwoGb3JkZXJzGAQgAygLMhMuZnJvbnRsaW5lLnYxLk9yZGVyEiAKBXJhbGx5GAUgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgVjYXJnbxgGIAEoAxIMCgRob21lGAcgASgNEgwKBGFtbW8YCCABKAUSEQoJZW5kdXJhbmNlGAkgASgNEg8KB2NoYXJnZXMYCiABKAUSEwoLY2hhcmdlX3dvcmsYCyABKA0SFAoMc2VydmljZV93b3JrGAwgASgNEhIKCmV4cGVyaWVuY2UYDSABKAMSKQoJY29vbGRvd25zGA4gAygLMhYuZnJvbnRsaW5lLnYxLkNvb2xkb3duEhIKCnBhc3NlbmdlcnMYDyADKA0SEQoJY29udGFpbmVyGBAgASgNEhUKDXJlcGVhdF9zb3J0aWUYESABKAgSFAoMYW1idXNoX3JlYWR5GBIgASgIEhYKDm1pc3Npb25fb3JpZ2luGBMgASgJIrgDCgZFbnRpdHkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDgoGZmFjaW5nGAUgASgFEg4KBmhlYWx0aBgGIAEoBRINCgVzdGF0ZRgHIAEoCRIQCghjb21wbGV0ZRgIIAEoCBIPCgdlbmFibGVkGAkgASgIEg4KBmxhbmRlZBgKIAEoCBIQCghkZXBsb3llZBgLIAEoCBIRCgljb25jZWFsZWQYDCABKAgSEAoIcHJvZ3Jlc3MYDSABKAUSDAoEcmFuaxgOIAEoDRIsCgdwcml2YXRlGA8gASgLMhsuZnJvbnRsaW5lLnYxLkVudGl0eVByaXZhdGUSFQoNdHVycmV0X2ZhY2luZxgQIAEoBRIVCg1jaGFubmVsX3VudGlsGBEgASgNEhIKCm1hcF9vYmplY3QYEiABKA0SFwoPZm9vdHByaW50X3dpZHRoGBMgASgFEhgKEGZvb3RwcmludF9oZWlnaHQYFCABKAUSFgoOZm9vdHByaW50X3R5cGUYFSABKAkisAEKDVBsYXllclN1bW1hcnkSCgoCaWQYASABKA0SDAoEbmFtZRgCIAEoCRIPCgdmYWN0aW9uGAMgASgJEgwKBHRlYW0YBCABKA0SEAoIZGVmZWF0ZWQYBSABKAgSEQoJZGVmZWF0X2F0GAYgASgNEhoKEnN0cmF0ZWdpY19wcm9ncmVzcxgHIAEoBRIWCg5zdXJyZW5kZXJfdm90ZRgIIAEoCBINCgVjb2xvchgJIAEoDSK6AQoKUHJvamVjdGlsZRIKCgJpZBgBIAEoDRINCgVvd25lchgCIAEoDRIOCgZ3ZWFwb24YAyABKAkSIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEiEKBmltcGFjdBgFIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJaW1wYWN0X2F0GAYgASgNEhUKDWludGVyY2VwdGFibGUYByABKAgSDwoHd2FybmluZxgIIAEoCCJLCgVGaWVsZBIKCgJpZBgBIAEoDRIjCghwb3NpdGlvbhgCIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJcmVtYWluaW5nGAMgASgDIkkKB1N0YXRpb24SCgoCaWQYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjEg0KBW93bmVyGAMgASgNIq8BCgZNZW1vcnkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDAoEc2VlbhgFIAEoDRIXCg9mb290cHJpbnRfd2lkdGgYBiABKAUSGAoQZm9vdHByaW50X2hlaWdodBgHIAEoBRIWCg5mb290cHJpbnRfdHlwZRgIIAEoCSKfAQoFRXZlbnQSCgoCaWQYASABKA0SDAoEdGljaxgCIAEoDRIMCgRraW5kGAMgASgJEg0KBW93bmVyGAQgASgNEg4KBmVudGl0eRgFIAEoDRIjCghwb3NpdGlvbhgGIAEoCzIRLmZyb250bGluZS52MS5WZWMSDQoFdmFsdWUYByABKAMSDQoFc2NvcGUYCCABKAkSDAoEdGV4dBgJIAEoCSJdCgdPdXRjb21lEhAKCGZpbmlzaGVkGAEgASgIEgwKBGRyYXcYAiABKAgSFAoMd2lubmluZ190ZWFtGAMgASgNEg4KBnJlYXNvbhgEIAEoCRIMCgR0aWNrGAUgASgNIuAGCg5QbGF5ZXJTbmFwc2hvdBIoCghtZXRhZGF0YRgBIAEoCzIWLmZyb250bGluZS52MS5NZXRhZGF0YRIMCgR0aWNrGAIgASgNEhEKCWNvdW50ZG93bhgDIAEoDRIOCgZwbGF5ZXIYBCABKA0SJgoHZWNvbm9teRgFIAEoCzIVLmZyb250bGluZS52MS5FY29ub215EiwKB3BsYXllcnMYBiADKAsyGy5mcm9udGxpbmUudjEuUGxheWVyU3VtbWFyeRImCghlbnRpdGllcxgHIAMoCzIULmZyb250bGluZS52MS5FbnRpdHkSLQoLcHJvamVjdGlsZXMYCCADKAsyGC5mcm9udGxpbmUudjEuUHJvamVjdGlsZRIjCgZmaWVsZHMYCSADKAsyEy5mcm9udGxpbmUudjEuRmllbGQSJwoIc3RhdGlvbnMYCiADKAsyFS5mcm9udGxpbmUudjEuU3RhdGlvbhIUCghleHBsb3JlZBgLIAMoCEICEAESEwoHdmlzaWJsZRgMIAMoCEICEAESJAoGbWVtb3J5GA0gAygLMhQuZnJvbnRsaW5lLnYxLk1lbW9yeRIjCgZldmVudHMYDiADKAsyEy5mcm9udGxpbmUudjEuRXZlbnQSKgoHcmVzdWx0cxgPIAMoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdBITCgtzaGlwbWVudF9hdBgQIAEoDRImCgdvdXRjb21lGBEgASgLMhUuZnJvbnRsaW5lLnYxLk91dGNvbWUSJgoHc2FsdmFnZRgSIAMoCzIVLmZyb250bGluZS52MS5TYWx2YWdlEiEKBXpvbmVzGBMgAygLMhIuZnJvbnRsaW5lLnYxLlpvbmUSNAoKaW5kaWNhdG9ycxgUIAMoCzIgLmZyb250bGluZS52MS5TdHJ1Y3R1cmVJbmRpY2F0b3ISLgoHbWlzc2lvbhgVIAEoCzIdLmZyb250bGluZS52MS5NaXNzaW9uUHJvZ3Jlc3MSDgoGcnViYmxlGBYgAygNEjAKCHdhcm5pbmdzGBcgAygLMh4uZnJvbnRsaW5lLnYxLk9wZXJhdGlvbldhcm5pbmcSJgoHZGVicmllZhgYIAEoCzIVLmZyb250bGluZS52MS5EZWJyaWVmImoKClN0YXRlRGVsdGESFQoNYmFzZWxpbmVfdGljaxgBIAEoDRIrCgVzdGF0ZRgCIAEoCzIcLmZyb250bGluZS52MS5QbGF5ZXJTbmFwc2hvdBIYChByZW1vdmVkX2VudGl0aWVzGAMgAygNImgKC01hdGNoUmVzdWx0EhAKCG1hdGNoX2lkGAEgASgJEiYKB291dGNvbWUYAiABKAsyFS5mcm9udGxpbmUudjEuT3V0Y29tZRIRCgljb21taXR0ZWQYAyABKAgSDAoEdm9pZBgEIAEoCCJnCgdTYWx2YWdlEgoKAmlkGAEgASgNEg0KBW93bmVyGAIgASgNEiMKCHBvc2l0aW9uGAMgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgV2YWx1ZRgEIAEoAxINCgV1bnRpbBgFIAEoDSJ2CgRab25lEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEg4KBnJhZGl1cxgEIAEoBRINCgVzdGFydBgFIAEoDRINCgV1bnRpbBgGIAEoDSJIChJTdHJ1Y3R1cmVJbmRpY2F0b3ISDQoFb3duZXIYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjIoYBChFPYmplY3RpdmVQcm9ncmVzcxIKCgJpZBgBIAEoCRIMCgR0ZXh0GAIgASgJEhAKCG9wdGlvbmFsGAMgASgIEg8KB2ZhaWx1cmUYBCABKAgSEAoIY29tcGxldGUYBSABKAgSEAoIcHJvZ3Jlc3MYBiABKA0SEAoIcmVxdWlyZWQYByABKA0i4gEKD01pc3Npb25Qcm9ncmVzcxIKCgJpZBgBIAEoCRINCgV0aXRsZRgCIAEoCRISCgpkaWZmaWN1bHR5GAMgASgJEhIKCmNoZWNrcG9pbnQYBCABKAkSFwoPY2hlY2twb2ludF90aWNrGAUgASgNEjMKCm9iamVjdGl2ZXMYBiADKAsyHy5mcm9udGxpbmUudjEuT2JqZWN0aXZlUHJvZ3Jlc3MSLQoHY29udm95cxgHIAMoCzIcLmZyb250bGluZS52MS5Db252b3lQcm9ncmVzcxIPCgd2ZXJzaW9uGAggASgJIpIBChBPcGVyYXRpb25XYXJuaW5nEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEgoKAmF0GAQgASgNEg4KBnNvdXJjZRgFIAEoDRIgCgVleGl0cxgGIAMoCzIRLmZyb250bGluZS52MS5WZWMiqQEKDkNvbnZveVByb2dyZXNzEgoKAmlkGAEgASgJEg4KBmFjdGl2ZRgCIAEoCBIRCgljb21wbGV0ZWQYAyABKAgSDAoEaGVsZBgEIAEoCBIOCgZtb3ZpbmcYBSABKAgSDQoFcm91dGUYBiABKA0SEAoId2F5cG9pbnQYByABKA0SFwoPY291bnRkb3duX3VudGlsGAggASgNEhAKCGFwcHJvdmVkGAkgAygNIm8KDUVjb25vbXlTYW1wbGUSDAoEdGljaxgBIAEoDRIPCgdjcmVkaXRzGAIgASgDEg4KBmluY29tZRgDIAEoAxINCgVzcGVudBgEIAEoAxIOCgZzdXBwbHkYBSABKAUSEAoIc3RhdGlvbnMYBiABKA0iLgoPUHJvZHVjdGlvbkNvdW50EgwKBHR5cGUYASABKAkSDQoFY291bnQYAiABKA0i2QIKD1BsYXllclRlbGVtZXRyeRIOCgZwbGF5ZXIYASABKA0SNQoOdW5pdHNfcHJvZHVjZWQYAiADKAsyHS5mcm9udGxpbmUudjEuUHJvZHVjdGlvbkNvdW50EjwKFWJ1aWxkaW5nc19jb25zdHJ1Y3RlZBgDIAMoCzIdLmZyb250bGluZS52MS5Qcm9kdWN0aW9uQ291bnQSEgoKdW5pdHNfbG9zdBgEIAEoDRIWCg5idWlsZGluZ3NfbG9zdBgFIAEoDRIUCgxyZXBhaXJfc3BlbnQYBiABKAMSFQoNbWlzc2lsZV9zcGVudBgHIAEoAxIaChJpbnRlcmNlcHRvcnNfZmlyZWQYCCABKA0SHQoVc3RhdGlvbl9jb250cm9sX3RpY2tzGAkgASgNEi0KCHRpbWVsaW5lGAogAygLMhsuZnJvbnRsaW5lLnYxLkVjb25vbXlTYW1wbGUisAIKDURlYnJpZWZQbGF5ZXISDgoGcGxheWVyGAEgASgNEgwKBG5hbWUYAiABKAkSDwoHZmFjdGlvbhgDIAEoCRIMCgR0ZWFtGAQgASgNEg0KBWNvbG9yGAUgASgNEhAKCGRlZmVhdGVkGAYgASgIEg8KB2NyZWRpdHMYByABKAMSDgoGaW5jb21lGAggASgDEg0KBXNwZW50GAkgASgDEhIKCmxvc3RfdmFsdWUYCiABKAMSFwoPdW5pdHNfc3Vydml2aW5nGAsgASgNEhwKFHN0cnVjdHVyZXNfc3Vydml2aW5nGAwgASgNEhYKDmV4cGxvcmVkX3RpbGVzGA0gASgNEi4KB21ldHJpY3MYDiABKAsyHS5mcm9udGxpbmUudjEuUGxheWVyVGVsZW1ldHJ5IlYKDERlYnJpZWZFdmVudBIMCgR0aWNrGAEgASgNEgwKBGtpbmQYAiABKAkSDgoGcGxheWVyGAMgASgNEgwKBHR5cGUYBCABKAkSDAoEdGV4dBgFIAEoCSJ7CgdEZWJyaWVmEiwKB3BsYXllcnMYASADKAsyGy5mcm9udGxpbmUudjEuRGVicmllZlBsYXllchIqCgZldmVudHMYAiADKAsyGi5mcm9udGxpbmUudjEuRGVicmllZkV2ZW50EhYKDm9taXR0ZWRfZXZlbnRzGAMgASgNQiRaImZyb250bGluZWNvbW1hbmQvcHJvdG9jb2w7cHJvdG9jb2xiBnByb3RvMw");
var EntitySchema = /* @__PURE__ */ messageDesc(file_frontline, 17);
var EventSchema = /* @__PURE__ */ messageDesc(file_frontline, 23);
var PlayerSnapshotSchema = /* @__PURE__ */ messageDesc(file_frontline, 25);

// tests/runtime/audio.test.ts
var variant = { url: "/art/audio/test.wav", caption: "Ready.", duration: 1, bytes: 100, sha256: "a".repeat(64) };
var manifest = () => ({ format: 1, sample_rate: 24e3, entries: { "vo.unit.US.infantry.select": { bus: "voice", priority: 10, variants: [{ ...variant }] } } });
test("audio manifest rejects unsafe URLs, malformed bounds and partial codec fallbacks", () => {
  assert.equal(parseAudioIndex(manifest()).entries["vo.unit.US.infantry.select"].loop, false);
  for (const patch of [{ url: "https://other/audio.wav" }, { url: "/art/audio/../private.wav" }, { url: "/art/audio/a%2fb.wav" }, { bytes: 0 }, { bytes: 16 * 1024 ** 2 + 1 }, { duration: Infinity }, { sha256: "x" }, { caption: "" }, { mp3_url: "/art/audio/test.mp3" }]) {
    const value2 = manifest();
    Object.assign(value2.entries["vo.unit.US.infantry.select"].variants[0], patch);
    assert.throws(() => parseAudioIndex(value2));
  }
  const value = manifest();
  Object.assign(value.entries["vo.unit.US.infantry.select"].variants[0], { display_caption: "Control: Ready.", mp3_url: "/art/audio/test.mp3", mp3_bytes: 123, mp3_sha256: "b".repeat(64) });
  assert.equal(parseAudioIndex(value).entries["vo.unit.US.infantry.select"].variants[0].display_caption, "Control: Ready.");
});
test("audio byte read bounds hold without length headers", async () => {
  assert.deepEqual(await boundedAudioBytes(new Response(new Uint8Array([1, 2])), 2), new Uint8Array([1, 2]));
  await assert.rejects(boundedAudioBytes(new Response(new Uint8Array(3)), 2), /declared size/);
  await assert.rejects(boundedAudioBytes(new Response("missing", { status: 404 }), 20), /unavailable/);
});
test("warning bundles and selection cooldowns are location specific and resettable", () => {
  const gate = new AudioCooldowns();
  assert.equal(gate.admit("attack:0,0", 0, 6e3), true);
  assert.equal(gate.admit("attack:0,0", 5999, 6e3), false);
  assert.equal(gate.admit("attack:1,0", 100, 6e3), true);
  assert.equal(gate.admit("attack:0,0", 6e3, 6e3), true);
  gate.clear();
  assert.equal(gate.admit("attack:0,0", 6001, 6e3), true);
});
function harness() {
  const calls = [], captions = [];
  let resets = 0;
  const mixer = { play: (id, options) => calls.push({ id, options }), music: () => {
  }, continuous: () => {
  }, caption: (text) => captions.push(text), reset: () => resets++, stopTransient: () => {
  }, clearCaptions: () => {
  }, afterSpeech: () => {
  }, manifest: void 0 };
  const catalog = new CatalogIndex({ units: [{ id: "US.rifle", name: "Ranger", faction: "US", role: "rifle", armor: "infantry", weapon: "RIF" }], weapons: [], buildings: [], upgrades: [] });
  return { calls, captions, director: new AudioDirector(mixer, () => catalog), resets: () => resets };
}
var snapshot = (tick, events = []) => create(PlayerSnapshotSchema, { tick, player: 1, players: [{ id: 1, faction: "US", team: 1 }, { id: 2, faction: "IR", team: 2 }], entities: [{ id: 1, type: "US.rifle", owner: 1 }, { id: 2, type: "US.rifle", owner: 2 }], events });
test("director consumes only new permitted events; rewind/reconnect/new perspective never burst old sound", () => {
  const h = harness(), fire = (id, tick) => create(EventSchema, { id, tick, kind: "weapon_fired", entity: 1, owner: 1 });
  h.director.snapshot(snapshot(100, [fire(1, 100)]));
  assert.equal(h.calls.length, 0);
  h.director.snapshot(snapshot(101, [fire(1, 100), fire(2, 101)]));
  assert.deepEqual(h.calls.map((x) => x.id), ["sfx.weapon.RIF"]);
  h.director.snapshot(snapshot(102, [fire(2, 101)]));
  assert.equal(h.calls.length, 1);
  h.director.snapshot(snapshot(50, [fire(1, 50)]));
  assert.equal(h.calls.length, 1);
  h.director.connection("connected");
  h.director.snapshot(snapshot(103, [fire(3, 103)]));
  assert.equal(h.calls.length, 1);
  const other = snapshot(104, [fire(4, 104)]);
  other.player = 2;
  h.director.snapshot(other);
  assert.equal(h.calls.length, 1);
  assert.ok(h.resets() >= 3);
});
test("selection and command acknowledgment require owned actors or actual receipt; lost vision is not death", () => {
  const h = harness(), enemy = create(EntitySchema, { id: 2, type: "US.rifle", owner: 2 }), own = create(EntitySchema, { id: 1, type: "US.rifle", owner: 1 });
  h.director.selection([enemy], 1);
  assert.equal(h.calls.length, 0);
  h.director.selection([own], 1);
  assert.equal(h.calls[0].id, "vo.unit.US.infantry.select");
  h.director.receipt("move", false, own, "blocked");
  assert.equal(h.calls.at(-1)?.id, "vo.unit.US.infantry.unavailable");
  h.director.receipt("move", true, own);
  assert.equal(h.calls.at(-1)?.id, "vo.unit.US.infantry.move");
  h.director.snapshot(snapshot(1));
  const next = snapshot(2);
  next.entities = [];
  h.director.snapshot(next);
  assert.equal(h.calls.some((call) => call.id.includes("explosion")), false);
});
test("owner economy, teammate and public endgame transitions produce captions without inventing hidden readiness", () => {
  const h = harness(), before = snapshot(100);
  before.economy = { ...create(PlayerSnapshotSchema, { economy: { powerCapacity: 10, powerDemand: 5 } }).economy };
  h.director.snapshot(before);
  const after = snapshot(101);
  after.economy = { ...before.economy, powerDemand: 20 };
  after.indicators = [{ ...create(PlayerSnapshotSchema, { indicators: [{ owner: 2, position: { x: 5e3, y: 5e3 } }] }).indicators[0] }];
  h.director.snapshot(after);
  assert.ok(h.calls.some((call) => call.id === "vo.announcer.US.low_power"));
  assert.ok(h.calls.some((call) => call.id === "vo.announcer.US.endgame_reveal"));
  assert.equal(h.calls.some((call) => call.id.includes("enemy_strategic_ready")), false);
  h.director.status({ teammates: [{ player: 2, connected: true }] });
  h.director.status({ teammates: [{ player: 2, connected: false }] });
  assert.equal(h.calls.at(-1)?.id, "vo.announcer.US.teammate_disconnected");
  h.director.discontinuity();
  const count = h.calls.length;
  h.director.status({ teammates: [{ player: 2, connected: false }] });
  assert.equal(h.calls.length, count);
});
function serviceHarness() {
  const calls = [], catalog = new CatalogIndex({ units: [{ id: "US.fighter", name: "Interceptor", faction: "US", role: "fighter", armor: "air" }], weapons: [], buildings: [], upgrades: [] });
  const mixer = { play: (id) => calls.push(id), music: () => {
  }, continuous: () => {
  }, caption: () => {
  }, reset: () => {
  } };
  const director = new AudioDirector(mixer, () => catalog), aircraft = create(EntitySchema, { id: 9, type: "US.fighter", owner: 1, health: 1e3, private: { home: 4 } });
  const before = snapshot(100);
  before.entities = [aircraft];
  director.snapshot(before);
  const loss = create(EventSchema, { id: 1, tick: 101, kind: "service_lost", owner: 1, entity: 9, scope: "owner" }), after = snapshot(101, [loss]);
  after.entities = [{ ...aircraft, private: { ...aircraft.private, home: 0 } }];
  return { calls, director, aircraft, after, loss };
}
test("service-loss audio warns only when the current living owned aircraft has no replacement home", () => {
  const h = serviceHarness();
  h.director.snapshot(h.after);
  assert.deepEqual(h.calls, ["vo.announcer.US.no_landing_slot"]);
  const rebased = serviceHarness();
  rebased.after.entities[0].private.home = 7;
  rebased.director.snapshot(rebased.after);
  assert.deepEqual(rebased.calls, []);
  for (const kind of ["absent", "foreign", "dead", "destroyed", "missing-private", "ground"]) {
    const x = serviceHarness(), e = x.after.entities[0];
    if (kind === "absent") x.after.entities = [];
    if (kind === "foreign") e.owner = 2;
    if (kind === "dead") e.health = 0;
    if (kind === "destroyed") e.state = "destroyed";
    if (kind === "missing-private") e.private = void 0;
    if (kind === "ground") e.type = "US.rifle";
    x.director.snapshot(x.after);
    assert.deepEqual(x.calls, [], kind);
  }
});
test("service-loss warning does not repeat across duplicate IDs, reset, rewind or foreign perspective", () => {
  const h = serviceHarness();
  h.director.snapshot(h.after);
  assert.equal(h.calls.length, 1);
  h.director.snapshot({ ...h.after, tick: 102 });
  assert.equal(h.calls.length, 1);
  h.director.discontinuity();
  h.director.snapshot(h.after);
  assert.equal(h.calls.length, 1);
  h.director.snapshot({ ...h.after, tick: 50, events: [{ ...h.loss, tick: 50 }] });
  assert.equal(h.calls.length, 1);
  h.director.snapshot({ ...h.after, player: 2 });
  assert.equal(h.calls.length, 1);
});
