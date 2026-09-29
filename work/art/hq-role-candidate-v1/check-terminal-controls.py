"""Measure controls without changing the original strict equality result."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image
B = Path(__file__).resolve().parent
O = B / 'terminal-controls-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
render = json.loads((O / 'render.json').read_text())
for row in render['records']:
    for rel, want in row['files'].items():
        assert sha(O / rel) == want
def compare(a, b):
    x, y = [np.asarray(Image.open(p).convert('RGBA'), dtype=np.int16) for p in (a, b)]
    d = np.abs(x - y)
    with Image.open(a) as first, Image.open(b) as second:
        metadata_changed = sorted(k for k in set(first.info) | set(second.info) if first.info.get(k) != second.info.get(k))
    return {'left_sha256': sha(a), 'right_sha256': sha(b), 'byte_exact': sha(a) == sha(b), 'pixel_exact': bool(np.array_equal(x, y)), 'changed_pixels': int(np.any(d, axis=2).sum()), 'max_channel_delta': int(d.max()), 'changed_alpha_pixels': int((d[:, :, 3] != 0).sum()), 'max_alpha_delta': int(d[:, :, 3].max()), 'png_metadata_changed_fields': metadata_changed}
rows = []
for aid in ['building.SY.hq', 'building.SA.hq']:
    for state in ['foundation', 'rubble']:
        for layer in ['beauty', 'team', 'shadow']:
            rel = Path(layer) / state / 'd00_f00.png'
            if not (O / aid / 'old-a' / rel).exists():
                continue
            comparisons = {}
            for left, right in [('old-a', 'old-b'), ('candidate-a', 'candidate-b'), ('old-a', 'candidate-a')]:
                comparisons[left + '/' + right] = compare(O / aid / left / rel, O / aid / right / rel)
            comparisons['historical/old-a'] = compare(B / 'references-v1' / aid / 'raw' / rel, O / aid / 'old-a' / rel)
            comparisons['historical/pilot'] = compare(B / 'references-v1' / aid / 'raw' / rel, B / 'pilot-v1' / aid / rel)
            rows.append({'id': aid, 'state': state, 'layer': layer, 'comparisons': comparisons})
result = {'scope': 'Measured per-layer repeat drift only. Original strict pixel gate remains FAIL where unequal; no universal tolerance or byte-equivalence claim. Geometry/material proof is separate. Exact original terminal PNG reuse remains an independent possible production path after configuration equivalence.', 'render_sha256': sha(O / 'render.json'), 'script_sha256': sha(Path(__file__)), 'rows': rows}
(O / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print('FC_HQ_TERMINAL_MEASUREMENTS', len(rows))
for row in rows:
    print(row['id'], row['state'], row['layer'], {k: (v['changed_pixels'], v['max_channel_delta']) for k, v in row['comparisons'].items()})
