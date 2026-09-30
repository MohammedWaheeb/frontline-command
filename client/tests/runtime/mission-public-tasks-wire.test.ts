import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {create, fromBinary, toBinary} from '@bufbuild/protobuf';
import {
  PlayerSnapshotSchema, StateDeltaSchema,
  type FieldObservation, type MissionPublicTask, type PlayerSnapshot,
} from '../../src/protocol/frontline_pb';
import {applyDelta} from '../../src/runtime/snapshot';

// Additive test; the objective19 native test and earlier TS test remain intact.
// Root must generate matching bindings and retain its four actual Go
// PlayerView/Snapshot .pb + .view.json pairs in a fresh evidence directory.
// Those pairs are canonical Twin initial views after 100 Advance calls, with
// human/human or human/Normal-AI configuration. The constructed deltas below
// are synthetic wire/merge variations, not Go-produced gameplay updates.
// This does not prove AI competence, a live match, harvesting, nonzero endpoint
// pins/retreat/queue behavior, mission completion, or later observation history.
const nativeDirectory = process.env.FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE;
const missingEvidence = !nativeDirectory
  ? 'Root native evidence absent: cross-language acceptance is unrun.'
  : false;
type JsonObject = Record<string, unknown>;
type KnownFieldShape = {id: number; position: {x: number; y: number}; remaining: bigint; seen: number};

function object(value: unknown, label: string): JsonObject {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), label);
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), label);
  return value as unknown[];
}
function integer(value: unknown, label: string): number {
  assert.equal(typeof value, 'number', label);
  assert.ok(Number.isSafeInteger(value), label);
  return value as number;
}
function int64(value: unknown, label: string): bigint {
  if (typeof value === 'string') {
    assert.match(value, /^-?\d+$/, label);
    return BigInt(value);
  }
  // A lossy JSON number cannot independently verify a native int64.
  return BigInt(integer(value, label));
}
function point(value: unknown, label: string) {
  const p = object(value, label);
  return {x: integer(p.x, label + '.x'), y: integer(p.y, label + '.y')};
}
function jsonTasks(view: JsonObject) {
  const mission = object(view.mission, 'authorized mission');
  return array(mission.public_tasks, 'authorized public_tasks').map((value, index) => {
    const task = object(value, 'public task ' + index);
    assert.deepEqual(Object.keys(task).sort(), ['id', 'kind', 'marker', 'max', 'min', 'objective', 'region', 'team']);
    for (const key of ['id', 'objective', 'kind', 'marker', 'region']) assert.equal(typeof task[key], 'string');
    return {
      id: task.id, objective: task.objective, kind: task.kind,
      marker: task.marker, region: task.region, team: integer(task.team, 'task team'),
      min: point(task.min, 'task min'), max: point(task.max, 'task max'),
    };
  });
}
function wireTasks(tasks: MissionPublicTask[]) {
  return tasks.map(task => ({
    id: task.id, objective: task.objective, kind: task.kind,
    marker: task.marker, region: task.region, team: task.team,
    min: point(task.min, 'decoded task min'), max: point(task.max, 'decoded task max'),
  }));
}
function jsonKnownFields(view: JsonObject): KnownFieldShape[] {
  return array(view.known_fields, 'authorized known_fields').map((value, index) => {
    const field = object(value, 'known field ' + index);
    return {
      id: integer(field.id, 'field ID'), position: point(field.position, 'field position'),
      remaining: int64(field.remaining, 'field remaining'), seen: integer(field.seen, 'field seen'),
    };
  });
}
function wireKnownFields(fields: FieldObservation[]): KnownFieldShape[] {
  return fields.map(field => ({
    id: field.id, position: point(field.position, 'decoded field position'),
    remaining: field.remaining, seen: field.seen,
  }));
}
function assertPrivacyAndOwnedHaulers(snapshot: PlayerSnapshot, view: JsonObject) {
  const actors = array(view.entities, 'authorized entities').map(value => object(value, 'authorized actor'));
  const expectedByID = new Map(actors.map(actor => [integer(actor.id, 'actor ID'), actor]));
  assert.equal(expectedByID.size, actors.length, 'fixture has duplicate actors');
  assert.deepEqual(snapshot.entities.map(actor => actor.id).sort((a, b) => a - b), [...expectedByID.keys()].sort((a, b) => a - b));
  const numeric = [
    ['field', 'field'], ['depot', 'depot'], ['pinnedField', 'pinned_field'], ['pinnedDepot', 'pinned_depot'],
    ['harvestQueuePosition', 'harvest_queue_position'], ['harvestQueueLength', 'harvest_queue_length'],
  ] as const;
  const flags = [['retreatWhenAttacked', 'retreat_when_attacked'], ['retreating', 'retreating']] as const;
  let haulers = 0;
  for (const actor of snapshot.entities) {
    const expected = expectedByID.get(actor.id);
    assert.ok(expected);
    assert.equal(actor.owner, integer(expected.owner, 'actor owner'));
    assert.equal(actor.type, expected.type);
    if (actor.owner !== snapshot.player) {
      assert.ok(expected.private === undefined || expected.private === null, 'authorized JSON exposed foreign private state');
      assert.equal(actor.private, undefined, 'native decoder or delta exposed foreign private state');
    }
    if (actor.owner !== snapshot.player || !actor.type.endsWith('.hauler')) continue;
    haulers++;
    const own = object(expected.private, 'authorized own hauler private');
    assert.ok(actor.private, 'decoded own hauler private data missing');
    for (const [wireName, jsonName] of numeric) assert.equal(actor.private[wireName], integer(own[jsonName], 'hauler ' + jsonName));
    for (const [wireName, jsonName] of flags) {
      assert.equal(typeof own[jsonName], 'boolean');
      assert.equal(actor.private[wireName], own[jsonName]);
    }
  }
  assert.ok(haulers > 0, 'initial fixture must contain actual own haulers; no vacuous preservation pass');
}
function decodedSnapshotRoundTrip(snapshot: PlayerSnapshot) {
  return fromBinary(PlayerSnapshotSchema, toBinary(PlayerSnapshotSchema, snapshot));
}

for (const controller of ['human', 'normal'] as const) {
  for (const owner of [1, 2] as const) {
    test(`actual native ${controller}-${owner} full public task/field/hauler data and serialized delta replacement`, {skip: missingEvidence}, () => {
      assert.ok(nativeDirectory);
      assert.ok(isAbsolute(nativeDirectory), 'explicit absolute root native evidence directory required');
      const name = `${controller}-${owner}.player-snapshot`;
      const bytes = readFileSync(join(nativeDirectory, name + '.pb'));
      const jsonBytes = readFileSync(join(nativeDirectory, name + '.view.json'));
      assert.ok(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024, 'bounded actual native snapshot bytes required');
      assert.ok(jsonBytes.length > 0 && jsonBytes.length <= 16 * 1024 * 1024, 'bounded authorized JSON required');
      const view = object(JSON.parse(jsonBytes.toString('utf8')), 'authorized native view');
      const initial = fromBinary(PlayerSnapshotSchema, bytes);
      assert.equal(initial.player, owner);
      assert.equal(initial.player, integer(view.player, 'view player'));
      assert.equal(initial.tick, integer(view.tick, 'view tick'));
      assert.equal(initial.countdown, integer(view.countdown, 'view countdown'));
      const metadata = object(view.metadata, 'authorized metadata');
      assert.ok(initial.metadata);
      assert.deepEqual({
        simulation: initial.metadata.simulation, protocol: initial.metadata.protocol,
        content_hash: initial.metadata.contentHash, map_version: initial.metadata.mapVersion,
        ruleset: initial.metadata.ruleset, seed: initial.metadata.seed,
      }, {
        simulation: metadata.simulation, protocol: metadata.protocol,
        content_hash: metadata.content_hash, map_version: metadata.map_version,
        ruleset: metadata.ruleset, seed: int64(metadata.seed, 'seed'),
      });
      const originalMission = initial.mission;
      assert.ok(originalMission);
      const expectedTasks = jsonTasks(view), expectedFields = jsonKnownFields(view);
      assert.equal(expectedTasks.length, 1, 'canonical native fixture must publish its actual task');
      assert.ok(expectedFields.length > 0, 'no vacuous real-field comparison; root must retain a view with observed fields');
      assert.deepEqual(wireTasks(originalMission.publicTasks), expectedTasks);
      assert.deepEqual(wireKnownFields(initial.knownFields), expectedFields);
      assertPrivacyAndOwnedHaulers(initial, view);
      const roundTripped = decodedSnapshotRoundTrip(initial);
      assert.deepEqual(wireTasks(roundTripped.mission!.publicTasks), expectedTasks);
      assert.deepEqual(wireKnownFields(roundTripped.knownFields), expectedFields);
      assertPrivacyAndOwnedHaulers(roundTripped, view);
      const unchangedOriginal = toBinary(PlayerSnapshotSchema, initial);

      // Removal exercises replacement of both nonentity lists, with zero changed
      // entities. The source Go snapshot/private hauler data must remain intact.
      const removing = create(PlayerSnapshotSchema, {
        ...initial, tick: initial.tick + 1, entities: [],
        mission: {...originalMission, publicTasks: []}, knownFields: [],
      });
      const removal = fromBinary(StateDeltaSchema, toBinary(StateDeltaSchema,
        create(StateDeltaSchema, {baselineTick: initial.tick, state: removing})));
      assert.ok(removal.state);
      assert.equal(removal.state.mission!.publicTasks.length, 0);
      assert.equal(removal.state.knownFields.length, 0);
      const cleared = applyDelta(initial, removal);
      assert.equal(cleared.mission!.publicTasks.length, 0, 'old tasks survived replacement');
      assert.equal(cleared.knownFields.length, 0, 'old observed fields survived replacement');
      assertPrivacyAndOwnedHaulers(cleared, view);
      const unchangedCleared = toBinary(PlayerSnapshotSchema, cleared);

      // Addition restores the actual published task and one actual field ID /
      // position with varied stock/seen values. This is a synthetic codec and
      // merge fixture, not a claimed legitimate Go observation transition.
      const first = initial.knownFields[0];
      assert.ok(first && first.position);
      assert.ok(first.remaining >= 0n);
      assert.ok(first.seen <= initial.tick);
      const changedFields = [{...first, remaining: first.remaining > 0n ? first.remaining - 1n : 1n, seen: initial.tick + 2}];
      assert.notEqual(changedFields[0].remaining, first.remaining, 'synthetic stock must change even for a zero-stock source field');
      assert.ok(changedFields[0].seen > first.seen, 'synthetic observation tick must change');
      const expectedChanged = wireKnownFields(changedFields);
      const adding = create(PlayerSnapshotSchema, {
        ...initial, tick: initial.tick + 2, entities: [],
        mission: {...originalMission, publicTasks: originalMission.publicTasks}, knownFields: changedFields,
      });
      const addition = fromBinary(StateDeltaSchema, toBinary(StateDeltaSchema,
        create(StateDeltaSchema, {baselineTick: cleared.tick, state: adding})));
      assert.ok(addition.state);
      assert.deepEqual(wireTasks(addition.state.mission!.publicTasks), expectedTasks);
      assert.deepEqual(wireKnownFields(addition.state.knownFields), expectedChanged);
      const restored = applyDelta(cleared, addition);
      assert.deepEqual(wireTasks(restored.mission!.publicTasks), expectedTasks, 'added task lost on decoded delta');
      assert.deepEqual(wireKnownFields(restored.knownFields), expectedChanged, 'observed fields were retained or merged instead of replaced');
      assertPrivacyAndOwnedHaulers(restored, view);
      assert.deepEqual(toBinary(PlayerSnapshotSchema, initial), unchangedOriginal, 'initial snapshot was mutated');
      assert.deepEqual(toBinary(PlayerSnapshotSchema, cleared), unchangedCleared, 'earlier delta result was mutated');
      assert.deepEqual(wireKnownFields(initial.knownFields), expectedFields);
      assert.deepEqual(wireTasks(initial.mission!.publicTasks), expectedTasks);
    });
  }
}
