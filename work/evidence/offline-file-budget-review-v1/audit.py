"""Read-only metadata/count audit. Does not assemble a pack or decode images."""
from pathlib import Path
from collections import Counter
import datetime, hashlib, json, math

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
PINS = {}
def read(rel):
    path = ROOT / rel
    data = path.read_bytes()
    PINS[str(path.relative_to(ROOT))] = hashlib.sha256(data).hexdigest()
    return json.loads(data)
def pin(rel):
    PINS[rel] = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()
def ceiling(spec):
    w, h = spec['canvas']
    assert w % 2 == h % 2 == 0 and 0 < w <= 2048 and 0 < h <= 2048
    capacity = (2048 // (w + 2)) * (2048 // (h + 2))
    assert capacity > 0
    counts = Counter()
    for state in spec['states']:
        for layer in state.get('layers', spec['passes']):
            counts[layer] += state['directions'] * state['frames']
    return 1 + 4 * sum(math.ceil(n / capacity) for n in counts.values())

budget = read('work/art/roster-runtime-overlay-v1/preflight-budget/offline-pack-v1/result.json')
incremental = read('work/art/roster-runtime-overlay-v1/preflight-budget/incremental-through-complete-building-handoffs-v1.json')
catalog = read('work/art/roster-runtime-overlay-v1/catalog-v53-v1/result.json')
resolved = read('work/art/roster-runtime-overlay-v1/preflight-budget/catalog-resolution.json')
base = 'work/art/effects-opus-v2/integration-v25/product/'
pack = read(base + 'assets/packs/base.json')
index = read(base + 'art/index.json')
assert PINS[base + 'assets/packs/base.json'] == budget['base_pack_sha256']
assert len(pack['files']) == len({x['path'] for x in pack['files']})
old = {row['id']: row for row in budget['assets']}
handoff_paths, rows, seen_ids = set(), [], set()
for row in catalog['assets']:
    handoff = read(row['handoff'])
    assert PINS[row['handoff']] == row['handoff_sha256']
    aid = row['id']
    assert handoff['id'] == aid and aid not in seen_ids
    seen_ids.add(aid)
    assert not handoff_paths.intersection(handoff['files'])
    handoff_paths.update(handoff['files'])
    side_path = f'sprites/{aid}/{aid}.sprite.json'
    side = read(handoff['files'][side_path]['source'])
    assert PINS[handoff['files'][side_path]['source']] == handoff['files'][side_path]['sha256']
    required = {side_path}
    for layers in side['atlases'].values():
        for names in layers.values():
            for name in names:
                atlas_path = f'sprites/{aid}/{name}'
                atlas = read(handoff['files'][atlas_path]['source'])
                assert PINS[handoff['files'][atlas_path]['source']] == handoff['files'][atlas_path]['sha256']
                required.update((atlas_path, f'sprites/{aid}/{atlas["meta"]["image"]}'))
    assert required == {p for p in handoff['files'] if p.startswith('sprites/')}
    ui = set(handoff['files']) - required
    assert len(ui) == 8 and sum('@1x.' in p for p in ui) == 4
    rows.append({'id': aid, 'basis': 'completed_handoff', 'sprite_files': len(required), 'ui_files': len(ui), 'upper': len(required)})
for aid in catalog['reference_graph_inventory']['base_only_ids']:
    assert aid not in seen_ids
    seen_ids.add(aid)
    side_rel = 'art/' + index['sprites'][aid]
    side = read(base + side_rel)
    required = {side_rel}
    parent = str(Path(side_rel).parent)
    for layers in side['atlases'].values():
        for names in layers.values():
            for name in names:
                atlas_path = parent + '/' + name
                atlas = read(base + atlas_path)
                required.update((atlas_path, parent + '/' + atlas['meta']['image']))
    assert all('/' + p in {x['path'] for x in pack['files']} for p in required)
    rows.append({'id': aid, 'basis': 'older_base_only', 'sprite_files': len(required), 'upper': len(required)})
queue_rows = []
for family in ['aircraft-final-production-v3', 'vehicle-final-production-v1', 'building-final-production-v1']:
    lock = read(f'work/art/{family}/production-lock.json')
    for aid in lock['assets']:
        assert aid not in seen_ids
        seen_ids.add(aid)
        rel = f'{lock["stage"]}/assets/pipeline/specs/{aid}.json'
        spec = read(rel)
        assert PINS[rel] == lock['sources'][f'assets/pipeline/specs/{aid}.json']
        row = {'id': aid, 'basis': 'untrimmed_pending', 'family': family,
               'poses': sum(s['directions'] * s['frames'] for s in spec['states']),
               'upper': ceiling(spec), 'old_upper': old[aid]['sprite_files_for_upper']}
        queue_rows.append(row)
        rows.append(row)
assert seen_ids == set(old)
assert {r['id'] for r in queue_rows} == set(catalog['reference_graph_inventory']['missing_ids'])
assert len(resolved['assets']) == 136 and set(resolved['assets']) <= seen_ids
fixed = sum(c['files'] for c in budget['fixed_categories'].values())
sprite_upper = sum(r['upper'] for r in rows)
all_ui_upper = sprite_upper + fixed + len(resolved['assets']) * 8
runtime_ui_upper = sprite_upper + fixed + len(resolved['assets']) * 4
assert all_ui_upper == incremental['with_isolated_charge_scope_hybrid_file_upper'] == 16033
audio = read(base + 'art/audio/index.json')
references = {v[key] for entry in audio['entries'].values() for v in entry.get('variants', []) for key in ['url', 'mp3_url'] if key in v}
audio_files = [x for x in pack['files'] if x['path'].startswith('/art/audio/')]
extra_audio = [x['path'] for x in audio_files if x['path'] not in references and x['path'] != '/art/audio/index.json']
assert len(extra_audio) == 4 and all(p.startswith('/art/audio/notices/') for p in extra_audio)
for rel in ['client/scripts/ui/art-plugin.mjs', 'client/src/render/art.ts', 'client/src/app/asset-preflight.ts',
            'client/src/content/art-ui.ts', 'client/src/runtime/cache.ts', 'client/src/runtime/asset-generation.ts',
            'client/src/runtime/asset-generation-input.ts', 'work/art/roster-runtime-overlay-v1/overlay-v3.mjs',
            'assets/pipeline/tools/pack_sprites.py']:
    pin(rel)
result = {'scope': 'Metadata/count proof only. No product assembly, image decoding, asset deletion, budget mutation, browser or renderer execution. PNG payload hashes are inherited from handoffs, not rechecked in this metadata-only audit.',
          'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'summary': {'world_ids': len(rows), 'catalog_ids': len(resolved['assets']), 'catalog_building_sheets': sum(x.startswith('building.') for x in resolved['assets']),
                      'completed_handoff_ids': 53, 'base_only_ids': 48, 'pending_ids': len(queue_rows),
                      'handoff_files_unique': len(handoff_paths), 'completed_sprite_files': sum(r['upper'] for r in rows if r['basis'] != 'untrimmed_pending'),
                      'pending_sprite_upper': sum(r['upper'] for r in queue_rows), 'sprite_upper': sprite_upper,
                      'fixed_v25_files': fixed, 'all_eight_ui_files': 1088, 'current_runtime_ui2x_files': 544,
                      'full_export_ui_upper': all_ui_upper, 'runtime_ui2x_upper': runtime_ui_upper,
                      'runtime_ui2x_headroom_to_16000': 16000 - runtime_ui_upper,
                      'changed_pending_ceilings': [r for r in queue_rows if r['upper'] != r['old_upper']]},
          'audio': {'files': len(audio_files), 'index_referenced_media': len(references), 'required_notices': extra_audio},
          'base_pack': {'files': len(pack['files']), 'unique_paths': len({f['path'] for f in pack['files']}), 'bytes': sum(f['bytes'] for f in pack['files'])},
          'assets': rows, 'source_and_metadata_sha256': PINS}
(OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result['summary'], indent=2))
