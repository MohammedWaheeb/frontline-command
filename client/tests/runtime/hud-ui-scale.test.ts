import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Regression for bug-hunt B-6: HUD labels must scale with --fc-ui-scale
// (interface scale 85%-150%), never sit at a fixed pixel size. The check
// resolves the winning font/font-size declaration per selector by
// (specificity, source order), ignoring @media conditions, which is the
// conservative reading: a media rule only wins if it would win unmediated.

// game.css plus the revamp HUD sheets (styles/hud.css, hud-sidebar lane; styles/hud-tray.css, hud-tray lane). The
// revamp rules are scoped more specifically, so they win wherever both match.
const styles = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/styles');
const css = ['game.css', 'hud.css', 'hud-tray.css'].map((file) => readFileSync(path.join(styles, file), 'utf8')).join('\n');

type Rule = { selectors: string[]; font: string | undefined; order: number };
const rules: Rule[] = [];
for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selectors = match[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
  let font: string | undefined;
  for (const decl of match[2]!.split(';')) {
    const m = /^\s*(font|font-size)\s*:\s*(.+)$/.exec(decl);
    if (m && /\d+(?:\.\d+)?px/.test(m[2]!)) font = m[2]!.trim();
  }
  if (font !== undefined) rules.push({ selectors, font, order: rules.length });
}

function specificity(sel: string): number {
  const ids = (sel.match(/#/g) ?? []).length;
  const classes = (sel.match(/\.|:is\(|:has\(|\[/g) ?? []).length;
  const elements = (sel.match(/(^|[ >+~])([a-z][a-z0-9]*)/g) ?? []).length;
  return ids * 100 + classes * 10 + elements;
}

function winningFont(target: string): string | undefined {
  let best: { font: string; spec: number; order: number } | undefined;
  for (const rule of rules) {
    for (const sel of rule.selectors) {
      const flat = sel.replace(/\s*>\s*/g, '>').replace(/\s+/g, ' ');
      const want = target.replace(/\s*>\s*/g, '>').replace(/\s+/g, ' ');
      if (flat === want || flat.endsWith(' ' + want)) {
        const spec = specificity(sel);
        if (!best || spec > best.spec || (spec === best.spec && rule.order > best.order)) {
          best = { font: rule.font!, spec, order: rule.order };
        }
      }
    }
  }
  return best?.font;
}

// Retired with the revamp (no longer rendered; game.css rules removed 2026-10-31):
// .minimap-label, .power-gauge parts, .resource-shoulder small, .production-heading span.
const HUD_LABELS = [
  '.live-led',
  '.cameo-price',
  '.strategic-panel>b',
  '.unit-telemetry',
  '.objective-locations button',
  '.mission-force-groups small',
  '.mission-force-groups summary',
  '.tutorial-guide>span',
  '.tutorial-guide small',
  '.tutorial-guide button',
  // Revamped command sidebar (styles/hud.css).
  '.hud-credits-value',
  '.hud-income',
  '.hud-reserve',
  '.hud-clock',
  '.hud-status',
  '.hud-status small',
  '.production-tabs .tab-label',
  '.production-tabs .tab-count',
  '.production-tabs .tab-key',
  '.production-source select',
  '.production-heading',
  '.cameo-queue',
  '.cameo-pct',
  '.production-cameo .cameo-key',
  '.production-cameo .disabled-reason',
  '.production-queue .queue-items small',
  '.strategic-panel strong',
  '.hud-objective-go strong',
  '.hud-tip-head strong',
  '.hud-tip-stats',
];

test('every named HUD/minimap/power label scales with --fc-ui-scale', () => {
  for (const sel of HUD_LABELS) {
    const font = winningFont(sel);
    assert.ok(font !== undefined, `${sel}: no font declaration found`);
    assert.ok(font.includes('var(--fc-ui-scale)'), `${sel}: winning font "${font}" ignores --fc-ui-scale`);
  }
});
