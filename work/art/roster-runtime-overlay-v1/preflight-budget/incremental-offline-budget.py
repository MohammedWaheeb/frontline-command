"""Replace bounded old estimates with exact completed handoff closure counts.

This never builds a product, changes an installer limit, or promotes candidate
art. The original full-roster/fixed-v25 projection remains immutable.
"""
from pathlib import Path
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
original = HERE / 'offline-pack-v1/result.json'
baseline = json.loads(original.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
out = HERE / sys.argv[1]
assert out.parent == HERE and not out.exists()
old = {row['id']: row for row in baseline['assets']}
changes = []
for name in sys.argv[2:]:
    path = REPO / name
    h = json.loads(path.read_text())
    aid = h['id']
    assert aid in old and aid not in {x['id'] for x in changes}
    files = h['files']
    for key, record in files.items():
        p = REPO / record['source']
        assert p.stat().st_size == record['bytes'] and sha(p) == record['sha256'], key
    side_key = f'sprites/{aid}/{aid}.sprite.json'
    side = json.loads((REPO / files[side_key]['source']).read_text())
    required = {side_key}
    for layers in side['atlases'].values():
        for names in layers.values():
            for name in names:
                key = f'sprites/{aid}/{name}'
                atlas = json.loads((REPO / files[key]['source']).read_text())
                required.update([key, f'sprites/{aid}/{atlas["meta"]["image"]}'])
    assert required == {p for p in files if p.startswith('sprites/')}
    assert len(files) - len(required) == 8
    changes.append({'id': aid, 'handoff': str(path.relative_to(REPO)),
        'handoff_sha256': sha(path), 'poses': side['frame_count'],
        'actual_sprite_files': len(required),
        'actual_sprite_bytes': sum(files[p]['bytes'] for p in required),
        'actual_ui_files': 8,
        'actual_ui_bytes': sum(r['bytes'] for p, r in files.items() if p not in required),
        'baseline_was_complete': old[aid]['complete'],
        'baseline_sprite_files_for_upper': old[aid]['sprite_files_for_upper'],
        'baseline_estimated_sprite_files': old[aid]['estimated_sprite_files'],
        'baseline_estimated_sprite_bytes': old[aid]['estimated_sprite_bytes']})

# Keep both dimensions distinct: ordinary sealed roster versus the isolated
# charge-scope proposal. Only candidate charge rows replace its larger ceiling.
charge_rows = {x['id']: x for x in baseline['with_isolated_launcher_charge_candidate']['assets']}
non_charge = [x for x in changes if x['id'] not in charge_rows]
charge = [x for x in changes if x['id'] in charge_rows]
base_upper = baseline['baseline_sealed_roster']['installer_pack_files_hybrid_upper']
candidate_upper = baseline['with_isolated_launcher_charge_candidate']['installer_pack_files_hybrid_upper']
normal_delta = sum(x['actual_sprite_files'] - x['baseline_sprite_files_for_upper'] for x in non_charge)
charge_delta = sum(x['actual_sprite_files'] - charge_rows[x['id']]['candidate_whole_sheet_untrimmed_upper'] for x in charge)
result = {'scope': 'Read-only incremental file-count projection. Exact new handoff bytes replace only listed rows; fixed v25 entries and every unlisted estimate remain unchanged. Candidate charge art is not promoted. No new encoded-byte guarantee or limit change.',
    'original_projection': str(original.relative_to(REPO)),
    'original_projection_sha256': sha(original),
    'installer_files_limit_unchanged': 16000,
    'installer_encoded_bytes_limit_unchanged': 2147483648,
    'exact_handoff_updates': changes,
    'baseline_without_charge_changes_hybrid_file_upper': base_upper + normal_delta,
    'with_isolated_charge_scope_hybrid_file_upper': candidate_upper + normal_delta + charge_delta,
    'limitations': ['A conservative ceiling above the installer limit is not proof of actual overflow.',
        'All unlisted pending assets, later authored geometry and any future fixed-pack additions remain uncertain.',
        'Final actual full packaging must enforce file and encoded-byte limits; no runtime or final visual acceptance follows from counts.']}
out.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['baseline_without_charge_changes_hybrid_file_upper', 'with_isolated_charge_scope_hybrid_file_upper']}))
