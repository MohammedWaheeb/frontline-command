// Menu information architecture (beta revamp, menu-shell lane).
import type {Page} from '../../app/application';
import {FACTIONS} from '../../content/labels';
import type {Faction} from '../../runtime';
/** Playable factions in display order. */
export const factions=Object.keys(FACTIONS) as Faction[];

export type MenuGroup='play'|'learn'|'records'|'utility';
export interface MenuEntry{page:Page;label:string;title:string;icon:string;group:MenuGroup}
/**
 * The single menu table. One entry per routed page (tests/runtime/release-scope.test.ts scans the literal
 * `{page:'…',label:'…',title:'…',icon:'i-…',group:'…'}` shape, so keep it on one entry per object).
 * - `label` is the accessible name browser tests click. It equals the visible `title` (label in name,
 *   WCAG 2.5.3); the legacy names Load operation, Replay archive, Editor and Installed content were
 *   retired with their tests on 2026-10-31.
 * - `title` is the visible text in the new IA (Saves, Replays, Map editor, Content & storage).
 * - `icon` is an fc-icons symbol id rendered through the kit (no alias map).
 */
export const menu:MenuEntry[]=[
 {page:'skirmish',label:'Skirmish',title:'Skirmish',icon:'i-skirmish',group:'play'},
 {page:'campaign',label:'Campaign',title:'Campaign',icon:'i-campaign',group:'play'},
 {page:'network',label:'Multiplayer',title:'Multiplayer',icon:'i-network',group:'play'},
 {page:'coop',label:'Co-op',title:'Co-op',icon:'i-users',group:'play'},
 {page:'tutorials',label:'Field training',title:'Field training',icon:'i-tutorial',group:'learn'},
 {page:'practice',label:'Practice range',title:'Practice range',icon:'i-crosshair',group:'learn'},
 {page:'saves',label:'Saves',title:'Saves',icon:'i-save',group:'records'},
 {page:'replays',label:'Replays',title:'Replays',icon:'i-replay',group:'records'},
 {page:'mastery',label:'Command record',title:'Command record',icon:'i-trophy',group:'records'},
 {page:'settings',label:'Options',title:'Options',icon:'i-gear',group:'utility'},
 {page:'help',label:'Help',title:'Help',icon:'i-help',group:'utility'},
 {page:'editor',label:'Map editor',title:'Map editor',icon:'i-editor',group:'utility'},
 {page:'content',label:'Content & storage',title:'Content & storage',icon:'i-download',group:'utility'},
];

/** Group captions shown on home (PLAY / LEARN / RECORDS) and as the screen breadcrumb. */
export const groupTitle:Record<MenuGroup,string>={play:'Play',learn:'Learn',records:'Records',utility:'Command'};
export function menuEntry(page:Page):MenuEntry|undefined{return menu.find(entry=>entry.page===page)}
export function groupEntries(group:MenuGroup):MenuEntry[]{return menu.filter(entry=>entry.group===group)}
