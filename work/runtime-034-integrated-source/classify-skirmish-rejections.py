#!/usr/bin/env python3
"""Classify this exact run using its preserved authorized three-tick views."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('run', type=Path)
args = parser.parse_args()
run = args.run.resolve()
audit = json.loads((run / 'receipt-audit.json').read_text())
inspection = json.loads((run / 'inspection/run.json').read_text())
assert inspection['source_verified_after'] and inspection['binary_verified_after']
catalog = json.loads((ROOT / 'source/pkg/content/rules.json').read_text())
units = {u['id']: u for u in catalog['units']}
buildings = {b['id']: b for b in catalog['buildings']}
result = dict(source_lock_sha256=audit['source_lock_sha256'], binary_sha256=audit['binary_sha256'], rejections=[], categories={})
for case in audit['cases']:
    if not case['rejected']:
        continue
    path = run / case['case'] / 'rejection-context.json'
    contexts = json.loads(path.read_text())
    for rejected in case['rejections']:
        receipt, order = rejected['receipt'], rejected['order']
        stages = {c['stage']: c for c in contexts if c['rejection']['receipt'] == receipt}
        assert set(stages) == {'before_decision_tick', 'after_decision_tick', 'execution_tick'}
        before, after, executed = (stages[k] for k in ('before_decision_tick', 'after_decision_tick', 'execution_tick'))
        assert [before['snapshot_tick'], after['snapshot_tick'], executed['snapshot_tick']] == [receipt['tick']-2, receipt['tick']-1, receipt['tick']]
        row = dict(case=case['case'], receipt=receipt, order=order, context_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        code = receipt['code']
        if code == 'not_owner':
            assert len(order['entities']) == 1
            actor = order['entities'][0]
            source = next(s for s in before['owned_sources'] if s['id'] == actor)
            assert source['health'] > 0 and not after['owned_sources'] and not executed['owned_sources']
            death = next(e for e in after['authorized_relevant_events'] if e['kind'] == 'destroyed' and e['entity'] == actor and e['owner'] == receipt['player'])
            row.update(category='selected_owned_actor_destroyed_before_execution', actor=actor, before_health=source['health'], death_tick=death['tick'])
        elif code == 'survey_drone_required':
            assert order['type'] == 'relay_boost'
            b, a, x = (s['owned_sources'][0] for s in (before, after, executed))
            assert b['type'] == a['type'] == x['type'] == 'IR.isr' and not b['landed'] and a['landed'] and x['landed']
            row.update(category='survey_drone_landed_before_execution', actor=b['id'], before_position=b['position'], landed_position=a['position'])
        elif code == 'player_inactive':
            flags = [next(p['defeated'] for p in s['public_players'] if p['id'] == receipt['player']) for s in (before, after, executed)]
            assert flags == [False, True, True]
            row.update(category='player_defeated_before_execution', public_defeated=flags)
        elif code == 'occupied':
            building = buildings[order['type']]
            def overlap(entity):
                unit = units.get(entity['type'])
                if not unit or unit['armor'] == 'air':
                    return None
                dx = max(0, abs(entity['position']['x']-order['position']['x'])-building['width']*500)
                dy = max(0, abs(entity['position']['y']-order['position']['y'])-building['height']*500)
                return dict(distance_squared=dx*dx+dy*dy, radius=unit['radius'], position=entity['position'])
            b = {e['id']: e for e in before['authorized_build_neighborhood']}
            witnesses = []
            for entity in after['authorized_build_neighborhood']:
                if entity['id'] not in b:
                    continue
                initial, later = overlap(b[entity['id']]), overlap(entity)
                if initial and later and initial['distance_squared'] >= initial['radius']**2 and later['distance_squared'] < later['radius']**2:
                    witnesses.append(dict(actor=entity['id'], type=entity['type'], before=initial, after=later))
            assert witnesses
            row.update(category='visible_ground_actor_entered_planned_building_footprint', witnesses=witnesses)
        else:
            raise AssertionError('Unclassified rejection code: '+code)
        result['rejections'].append(row)
assert len(result['rejections']) == audit['rejected'] == 12
result['categories'] = dict(Counter(r['category'] for r in result['rejections']))
result['claim'] = 'Every rejection retained. Twelve observed decision/execution boundary races; no blanket code exclusion or all-orders-accepted claim. This classifies this run, not all future requests.'
(run / 'rejection-classification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result['categories'], indent=2))
