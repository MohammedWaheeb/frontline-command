import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create, fromBinary, toBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema, StateDeltaSchema} from '../../src/protocol/frontline_pb';
import type {PlayerSnapshot} from '../../src/protocol/frontline_pb';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {applyDelta} from '../../src/runtime/snapshot';

// Requires root-generated matching TypeScript binding. This checks the human
// decoder contract; native runtime/client availability still needs root's run.
test('team public mission task survives generated human snapshot decoding', () => {
  const source = create(PlayerSnapshotSchema, {
    player: 1,
    mission: {id: 'twin-outposts', version: '1', publicTasks: [{
      id: 'central-reconnection-hold', objective: 'reconnection', kind: 'hold_region',
      marker: 'central-connection', region: 'central-connection', team: 1,
      min: {x: 56000, y: 61000}, max: {x: 73999, y: 73999},
    }]},
    knownFields: [{id: 7, position: {x: 500, y: 500}, remaining: 123n, seen: 11}],
  });
  const decoded = fromBinary(PlayerSnapshotSchema, toBinary(PlayerSnapshotSchema, source));
  assert.deepEqual(decoded.mission?.publicTasks, source.mission?.publicTasks);
  assert.equal(decoded.mission?.publicTasks[0].objective, 'reconnection');
  assert.equal(decoded.mission?.publicTasks[0].min?.x, 56000);
  assert.equal(decoded.knownFields[0].remaining, 123n);
});

// This must execute with root-retained real Go PlayerView/Snapshot bytes for a
// cross-language claim; the ordinary unit run may explicitly skip that gate.
const nativeDirectory = process.env.FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE;
test('actual human1/human2 and AI ally views decode through the generated client and delta path', {skip: !nativeDirectory}, () => {
  assert.ok(nativeDirectory);
  for (const controller of ['human', 'normal']) {
    for (const owner of [1, 2]) {
      const name = `${controller}-${owner}.player-snapshot`;
      const view = JSON.parse(readFileSync(join(nativeDirectory, `${name}.view.json`), 'utf8'));
      const decoded: PlayerSnapshot = fromBinary(PlayerSnapshotSchema, readFileSync(join(nativeDirectory, `${name}.pb`)));
      assert.equal(decoded.player, owner);
      assert.equal(decoded.mission?.publicTasks.length, 1);
      const task = decoded.mission?.publicTasks[0];
      assert.equal(task?.objective, view.mission.public_tasks[0].objective);
      assert.equal(task?.marker, view.mission.public_tasks[0].marker);
      assert.equal(task?.region, view.mission.public_tasks[0].region);
      assert.equal(task?.team, 1);
      assert.equal(task?.min?.x, view.mission.public_tasks[0].min.x);
      assert.equal(task?.max?.y, view.mission.public_tasks[0].max.y);
      assert.equal(decoded.knownFields.length, (view.known_fields ?? []).length);
      for (const actor of decoded.entities) {
        if (actor.owner !== owner) assert.equal(actor.private, undefined);
      }
      const next = create(PlayerSnapshotSchema, {...decoded, tick: decoded.tick + 1});
      const delta = create(StateDeltaSchema, {baselineTick: decoded.tick, state: next});
      const merged = applyDelta(decoded, delta);
      assert.deepEqual(merged.mission?.publicTasks, decoded.mission?.publicTasks);
      assert.deepEqual(merged.knownFields, decoded.knownFields);
      assert.ok(next.mission);
      const completedView = create(PlayerSnapshotSchema, {...next, tick: next.tick + 1,
        mission: {...next.mission, publicTasks: []}});
      const cleared = applyDelta(merged, create(StateDeltaSchema, {baselineTick: merged.tick, state: completedView}));
      assert.equal(cleared.mission?.publicTasks.length, 0);
      assert.equal(decoded.mission?.publicTasks.length, 1, 'prior snapshot remains immutable');
    }
  }
});
