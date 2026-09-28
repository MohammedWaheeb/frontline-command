import {publicMissionLocations} from './presentation-locations.mjs';
import {publicMissionActors, publicTutorialFactionActors} from './presentation-actors.mjs';
// Declarative mission helpers matching pkg/content/mission.go exactly.
// Times: sec() gives ABSOLUTE ticks including the 100-tick opening countdown;
// dur() gives a duration in ticks (hold_ticks). Credits are milli-credits.
export const TICKS = 20;
export const COUNTDOWN = 100;
export const sec = (s) => COUNTDOWN + Math.round(s * TICKS);
export const min = (m) => sec(m * 60);
export const dur = (s) => Math.round(s * TICKS);
export const cr = (c) => c * 1000;
export const tile = (x, y) => ({x: x * 1000 + 500, y: y * 1000 + 500});

// ---- conditions ---------------------------------------------------------
const hold = (c, h) => (h ? {...c, hold_ticks: h} : c);
export const all = (...children) => ({kind: 'all', children});
export const any = (...children) => ({kind: 'any', children});
export const atLeast = (count, ...children) => ({kind: 'at_least', count, children});
export const holdFor = (c, seconds) => ({...c, hold_ticks: dur(seconds)});
export const timer = (tick) => ({kind: 'timer', tick});
export const waveTimer = (tick) => ({kind: 'timer', tick, wave: true});
export const tagAlive = (tag, o = {}) => hold({kind: 'tag_alive', tag, ...(o.owner ? {owner: o.owner} : {}), ...(o.count ? {count: o.count} : {})}, o.hold);
export const tagDestroyed = (tag) => ({kind: 'tag_destroyed', tag});
export const tagOwned = (tag, owner, count = 1) => ({kind: 'tag_owned', tag, owner, count});
export const tagOperational = (tag, o = {}) => ({kind: 'tag_operational', tag, ...(o.owner ? {owner: o.owner} : {}), ...(o.count ? {count: o.count} : {})});
export const tagInRegion = (tag, region, o = {}) => hold({kind: 'tag_in_region', tag, region, ...(o.owner ? {owner: o.owner} : {}), ...(o.count ? {count: o.count} : {})}, o.hold);
export const tagConcealed = (tag, o = {}) => ({kind: 'tag_concealed', tag, ...(o.owner ? {owner: o.owner} : {}), ...(o.count ? {count: o.count} : {})});
export const tagStationary = (tag, seconds, o = {}) => ({kind: 'tag_stationary', tag, tick: dur(seconds), ...(o.owner ? {owner: o.owner} : {}), ...(o.count ? {count: o.count} : {})});
export const countType = (type, owner, count, compare) => ({kind: 'count_type', type, ...(owner ? {owner} : {}), ...(count ? {count} : {}), ...(compare ? {compare} : {})});
export const noneOf = (type, owner) => ({kind: 'count_type', type, owner, count: 0, compare: 'at_most'});
export const regionEntered = (region, owner, count = 1) => ({kind: 'region_entered', region, owner, count});
export const regionHeld = (region, owner, count = 1, seconds = 0) => hold({kind: 'region_held', region, owner, count}, seconds ? dur(seconds) : 0);
export const credits = (owner, amount, compare) => ({kind: 'resource_threshold', owner, amount, ...(compare ? {compare} : {})});
export const stat = (owner, type, amount, compare) => ({kind: 'stat_threshold', owner, type, amount, ...(compare ? {compare} : {})});
export const upgrade = (owner, type) => ({kind: 'upgrade_owned', owner, type});
export const stations = (owner, count = 1, region) => ({kind: 'stations_owned', owner, count, ...(region ? {region} : {})});
export const fieldRemaining = (field, amount, compare) => ({kind: 'field_remaining', field, amount, ...(compare ? {compare} : {})});
export const objectiveDone = (objective) => ({kind: 'objective_complete', objective});
export const eventCount = (event, o = {}) => ({kind: 'event_count', event, ...(o.owner ? {owner: o.owner} : {}), ...(o.tag ? {tag: o.tag} : {}), ...(o.type ? {type: o.type} : {}), ...(o.count !== undefined ? {count: o.count} : {}), ...(o.compare ? {compare: o.compare} : {})});
export const eventValue = (event, o = {}) => ({kind: 'event_value', event, ...(o.owner ? {owner: o.owner} : {}), ...(o.tag ? {tag: o.tag} : {}), ...(o.type ? {type: o.type} : {}), amount: o.amount, ...(o.compare ? {compare: o.compare} : {})});
export const convoyDone = (convoy) => ({kind: 'convoy_completed', convoy});
// "Destroyed or captured" for disable-style objectives on enemy structures.
export const neutralized = (tag, human) => any(tagDestroyed(tag), tagOwned(tag, human));

// ---- actions ------------------------------------------------------------
export const spawn = (tag, type, owner, pos, count = 1, difficulties) => ({kind: 'spawn', spawn: {tag, type, owner, position: pos, count, ...(difficulties ? {difficulties} : {})}});
export const grant = (owner, amount) => ({kind: 'credits', owner, amount});
export const complete = (objective) => ({kind: 'complete_objective', objective});
export const warn = (text, owner) => ({kind: 'warning', text, ...(owner ? {owner} : {})});
export const checkpoint = (text) => ({kind: 'checkpoint', text});
export const attack = (owner, region) => ({kind: 'attack_region', owner, region});
export const recover = (tag, owner) => ({kind: 'recover_tag', tag, owner});
export const startConvoy = (convoy) => ({kind: 'start_convoy', convoy});
export const initial = (tag, type, owner, pos, count = 1, difficulties) => ({tag, type, owner, position: pos, count, ...(difficulties ? {difficulties} : {})});

export const DIFFICULTY = [
  {id: 'easy', enemy_credits_multiplier: 700, wave_time_multiplier: 1300},
  {id: 'normal', enemy_credits_multiplier: 1000, wave_time_multiplier: 1000},
  {id: 'hard', enemy_credits_multiplier: 1400, wave_time_multiplier: 800},
];
export const HARD = ['hard'];
export const NORMAL_UP = ['normal', 'hard'];
export const EASY_ONLY = ['easy'];

// Mission builder. Presentation/subtitle records are collected alongside the
// declarative definition so every spoken or displayed line has a transcript.
export class MissionBuilder {
  constructor(meta) {
    this.meta = meta; // id, title, map_id, faction, mode, version
    this.players = []; this.initial = []; this.objectives = []; this.triggers = []; this.convoys = [];
    this.lines = []; this.markers = []; this.exceptions = []; this.notes = [];
  }
  player(p) { this.players.push({controller: p.controller, id: p.id, faction: p.faction, name: p.name, team: p.team, ai: p.ai || '', credits: p.credits ?? 0}); return this; }
  spawnInitial(...list) { this.initial.push(...list.flat()); return this; }
  objective(o) {
    this.objectives.push({...(o.atEnd ? {at_end: true} : {}), id: o.id, text: o.text, optional: !!o.optional, failure: !!o.failure, condition: o.condition});
    return this;
  }
  // speaker is used for subtitle/voice records keyed by trigger ID.
  trigger(t) {
    const actions = t.actions.map((a) => {
      if (a.kind === 'warning' && t.speaker) return {...a, text: `${t.speaker.toUpperCase()}: ${a.text}`};
      return a;
    });
    this.triggers.push({id: t.id, condition: t.condition, actions, repeat: t.repeat || 0, interval: t.interval || 0});
    for (const a of t.actions) {
      if (a.kind === 'warning') this.lines.push({key: `trigger:${t.id}`, speaker: t.speaker || 'Command', text: a.text, voice: `vo.${this.meta.id}.${t.id}`});
      if (a.kind === 'checkpoint') this.lines.push({key: `checkpoint:${a.text}`, speaker: 'System', text: t.checkpointCaption || `Checkpoint reached: ${a.text}.`, voice: null});
    }
    if (t.wave) this.exceptions.push({trigger: t.id, kind: 'scripted_reinforcement', detail: t.wave});
    return this;
  }
  convoy(c) { this.convoys.push({id: c.id, tag: c.tag, routes: c.routes, countdown_ticks: c.countdown}); return this; }
  marker(m) { this.markers.push(m); return this; }
  exception(text) { this.exceptions.push({kind: 'scenario_rule', detail: text}); return this; }
  build() {
    const m = this.meta;
    return {
      id: m.id, version: m.version || '1', title: m.title, map_id: m.map_id, faction: m.faction, mode: m.mode,
      briefing: m.briefing, debrief: m.debrief, rules_notice: m.rules_notice || '', default_bases: !!m.default_bases,
      players: this.players, initial: this.initial, objectives: this.objectives, triggers: this.triggers,
      difficulty: m.difficulty || DIFFICULTY, ...(this.convoys.length ? {convoys: this.convoys} : {}),
      ...(this.variants ? {tutorial_variants: this.variants} : {}),
    };
  }
  presentation(extra = {}) {
    const m = this.meta;
    const brief = (m.briefingLines || []).map((l, i) => ({key: `briefing:${i + 1}`, speaker: l[0], text: l[1], voice: `vo.${m.id}.briefing.${String(i + 1).padStart(2, '0')}`}));
    const win = (m.victoryLines || []).map((l, i) => ({key: `debrief_victory:${i + 1}`, speaker: l[0], text: l[1], voice: `vo.${m.id}.victory.${String(i + 1).padStart(2, '0')}`}));
    const loss = (m.defeatLines || []).map((l, i) => ({key: `debrief_defeat:${i + 1}`, speaker: l[0], text: l[1], voice: `vo.${m.id}.defeat.${String(i + 1).padStart(2, '0')}`}));
    return {
      format_version: 1, mission_id: m.id, mission_version: m.version || '1', title: m.title, mode: m.mode, faction: m.faction,
      operation: m.operation || null, theater: m.theater || null, order: m.order,
      lesson: m.lesson, design_reference: m.designRef,
      art: {briefing: `briefing/${m.id}`, loading: `loading/${m.id}`, palette: m.palette || 'warm-gunmetal'},
      music: {briefing: `music.briefing.${m.faction.toLowerCase()}`, battle: m.music || `music.battle.${m.faction.toLowerCase()}`, victory: 'music.stinger.victory', defeat: 'music.stinger.defeat'},
      camera_start: m.camera || null,
      objectives: this.objectives.map((o) => ({id: o.id, kind: o.failure ? 'failure' : o.optional ? 'optional' : 'primary', at_end: !!o.at_end, text: o.text})),
      markers: publicMissionLocations(m.id, this.markers),
      scenario_exceptions: this.exceptions,
      subtitles: [...brief, ...this.lines, ...win, ...loss],
      audio_status: 'Mission audio is bundled through /art/audio/index.json. Per-line voice keys are authoring references; captions do not require audio. Listening review is tracked separately.',
      ...extra,
      actor_groups: publicMissionActors(this.build()),
      ...(extra.tutorial_factions?.length ? {tutorial_factions: extra.tutorial_factions.map(entry => ({...entry, actor_groups: publicTutorialFactionActors(this.build(), entry.faction)}))} : {}),
    };
  }
}
