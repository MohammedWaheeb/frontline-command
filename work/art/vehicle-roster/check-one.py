"""Run the shared integrity rules (read-only import) for one vehicle/aircraft asset.
Writes results into this lane's evidence directory; never touches shared reports."""
import importlib.util
import json
import pathlib
import sys

repo = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo / 'assets/pipeline/tools'))
aid = sys.argv[1]
lane = 'aircraft-roster' if any(k in aid for k in ('fighter', 'strike', 'gunship', 'airlift', 'isr', 'scout_drone')) else 'vehicle-roster'
spec = importlib.util.spec_from_file_location('fc_checks', repo / 'assets/pipeline/tools/check_assets.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
checks.check_spec(str(repo / 'assets/pipeline/specs' / f'{aid}.json'))
failed = [r for r in checks.results if not r['ok']]
out = repo / 'work/art' / lane / 'checks'
out.mkdir(parents=True, exist_ok=True)
(out / f'check-{aid}.json').write_text(json.dumps({'checks': len(checks.results), 'failures': len(failed), 'results': checks.results}, indent=2) + '\n')
print(aid, len(checks.results), 'checks;', len(failed), 'failures')
for r in failed:
    print('  FAIL', r['check'], r['detail'])
raise SystemExit(bool(failed))
