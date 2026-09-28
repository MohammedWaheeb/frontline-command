"""Reuse the locked Blender-free primitive audit for this isolated prop lane."""
import importlib.util
import json
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
loader = importlib.util.spec_from_file_location('geometry_audit', repo / 'work/art/vehicle-roster/check-source.py')
audit = importlib.util.module_from_spec(loader)
loader.loader.exec_module(audit)
records = []
for path in sorted((repo / 'assets/pipeline/specs').glob('prop.*.json')):
    spec = json.loads(path.read_text())
    if spec.get('model') != 'environment_roster':
        continue
    record = audit.audit(path)
    records.append(record)
    print(record['id'], record['source_poses'], 'poses; margin', record['minimum_margin_2x_px'], flush=True)
report = {'scope': 'Blender-free primitive source audit only; real pixels/placement remain unverified',
          'count': len(records), 'source_poses': sum(r['source_poses'] for r in records),
          'reverse_order_comparisons': sum(r['reverse_order_comparisons'] for r in records),
          'failures': 0, 'entries': records}
(repo / 'work/art/environment-roster/prop-source-check.json').write_text(json.dumps(report, indent=2) + '\n')
print('ENVIRONMENT_SOURCE_DONE', report['count'], report['source_poses'])
