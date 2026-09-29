"""Read-only verification of the retained actual-runtime build, no Go process."""
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BUILD = HERE / 'runtime-builds/20260929T182132Z'
LOCK = 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'
HELPER = ROOT / 'work/maximum-server-combined-v1/runner_guard.py'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):
    return json.loads(path.read_text())
assert sha(HELPER) == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
spec = importlib.util.spec_from_file_location('guard', HELPER)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
source = guard.verify_source(ROOT / 'work/maximum-server-combined-v1/clean-source', HERE / 'source-lock.json', LOCK)
receipt = read(BUILD / 'receipt.json')
assert sha(BUILD / 'receipt.json') == '48b920bbeb1ed8096f7c99f964cb3ee5ebff94b1720da5678e44a67732e6731d'
assert receipt['status'] == 'passed' and receipt['source_verified_after']
assert receipt['shipping_unchanged'] and receipt['prior_runtime_unchanged']
assert len(receipt['stages']) == 10 and all(r['exit'] == 0 for r in receipt['stages'])
for name, value in receipt['artifacts'].items():
    assert sha(BUILD / name) == value, name
for group in ('shipping_inputs', 'input_pins'):
    for name, value in receipt[group].items():
        assert sha(ROOT / name) == value, name
for name, item in receipt['files'].items():
    assert sha(BUILD / 'runtime' / name) == item['sha256']
    assert (BUILD / 'runtime' / name).stat().st_size == item['bytes']
proof = read(BUILD / 'parity/production-wasm.json')
assert proof['status'] == 'passed' and proof['goExited'] and proof['unauthorized_view_denied']
assert len(proof['cases']) == 6 and len(proof['checkpoint']) == 3
assert receipt['service_records_equal_original'] == 6
assert len(receipt['oracle_selected_outcomes']) == 8 and set(receipt['oracle_selected_outcomes'].values()) == {'pass'}
assert len(list((BUILD / 'parity/native/checkpoint').glob('*.pb'))) == 12
assert len(list((BUILD / 'parity/native/checkpoint').glob('*.save.json'))) == 3
audit = dict(status='passed', source_guard=source, receipt_sha256=sha(BUILD / 'receipt.json'),
             artifact_files=len(receipt['artifacts']), pinned_inputs=len(receipt['input_pins']),
             runtime_files=len(receipt['files']), produced_runtime_differences=[n for n, r in receipt['files'].items() if not r['equals_prior']],
             native_selected_passes=8, native_selected_skips=0, actual_wasm_service_scenes=6,
             actual_wasm_checkpoint_stages=[600, 601, 620], whole_checkpoint_views=12, whole_checkpoint_saves=3,
             shipping_unchanged=True, scope='Native Session and actual produced WASM parity. No browser, listening host or throughput claim.')
(BUILD / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps(audit, indent=2))
