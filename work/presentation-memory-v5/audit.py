"""Read-only attribution for two unchanged-driver, actual-App visual courses."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BUILD = ROOT / 'work/presentation-fallback-v5/build-01'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
receipt = read(BUILD / 'build.json')
assert sha(BUILD / 'build.json') == 'f9f5befce216281f51d46a180e7764f392119b690e48d85a1f334b924d991f7c'
pack_path = BUILD / 'product/assets/packs/base.json'
assert sha(pack_path) == receipt['product']['packSHA256']
pack = read(pack_path)
descriptors = {row['path'].lstrip('/'): row for row in pack['files']}
descriptors['assets/packs/base.json'] = {'sha256': sha(pack_path), 'bytes': pack_path.stat().st_size}
for rel, digest in receipt['sourceFiles'].items():
    assert sha(BUILD / 'source/client' / rel) == digest, rel

result = {'scope': 'Post-run independent source/served-byte attribution, not new browser execution or raw-request EOF proof.',
          'build_receipt_sha256': sha(BUILD / 'build.json'),
          'source_files_verified': len(receipt['sourceFiles']), 'cases': []}
for name, case in [('chrome-normal-01', '1600x900-scale100'), ('chrome-150-01', '1280x720-scale150')]:
    folder = HERE / name
    run = read(folder / 'browser.json')
    assert run['status'] == 'passed' and len(run['cases']) == 1
    assert run['cases'][0]['id'] == case and run['cases'][0]['status'] == 'passed'
    assert not run['errors'] and not run['httpErrors'] and not run['sourceChanges']
    assert run['identity']['buildReceipt']['sha256'] == result['build_receipt_sha256']
    assert sha(folder / 'driver.mjs') == run['identity']['driverSHA256']
    assert sha(ROOT / 'client/tests/render/battlefield-clarity-product.browser.mjs') == run['identity']['driverSHA256']
    for key, item in run['fixtures'].items():
        assert sha(Path(item['file'])) == sha(Path(item['importFile'])) == item['sha256']
    for rel, item in run['servedFiles'].items():
        expected = descriptors[rel]
        assert item['sha256'] == expected['sha256'] and item['bytes'] == expected['bytes'], rel
        assert sha(BUILD / 'product' / rel) == expected['sha256'], rel
    result['cases'].append({'id': case, 'receipt_sha256': sha(folder / 'browser.json'),
        'functional': 'passed', 'strict_diagnostics': 'failed' if run['requestFailures'] else 'passed',
        'raw_request_failures': len(run['requestFailures']), 'page_console_http_errors': 0,
        'served_descriptors_exact': len(run['servedFiles']), 'checkpoints': len(run['cases'][0]['checkpoints']),
        'evidence_files': {p.name: {'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(folder.iterdir()) if p.is_file()}})
result['status'] = 'attribution-passed-raw-diagnostics-failed'
with (HERE / 'audit.json').open('x') as out:
    json.dump(result, out, indent=2)
    out.write('\n')
print(json.dumps({k: v for k, v in result.items() if k != 'cases'}))
