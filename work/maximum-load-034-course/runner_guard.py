"""Source-only guards and fail-preserving receipt finalization; no subprocesses."""
from pathlib import Path
import datetime
import hashlib
import json

IGNORE_BYTES = b'*\n!.gitignore\n'
def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def verify_source(source, lock_path, expected_lock):
    source, lock_path = Path(source), Path(lock_path)
    if digest(lock_path) != expected_lock:
        raise ValueError('Reviewed source-lock bytes changed')
    lock = json.loads(lock_path.read_text())
    expected = dict(lock['files'])
    for rel in expected:
        p = Path(rel)
        if p.is_absolute() or '..' in p.parts or str(p) != rel:
            raise ValueError('Invalid source-lock path: ' + rel)
    if '.gitignore' in expected:
        raise ValueError('Unexpected locked .gitignore; review allowance explicitly')
    expected['.gitignore'] = hashlib.sha256(IGNORE_BYTES).hexdigest()
    if not source.is_dir() or source.is_symlink():
        raise ValueError('Source root missing or symlinked')
    paths = sorted(source.rglob('*'))
    symlinks = [str(p.relative_to(source)) for p in paths if p.is_symlink()]
    if symlinks:
        raise ValueError('Source symlinks rejected: ' + ', '.join(symlinks))
    actual = {str(p.relative_to(source)) for p in paths if p.is_file()}
    missing, extra = sorted(set(expected) - actual), sorted(actual - set(expected))
    if missing or extra:
        raise ValueError('Source inventory drift: ' + json.dumps({'missing': missing, 'extra': extra}))
    changed = [rel for rel, value in expected.items() if digest(source / rel) != value]
    if changed:
        raise ValueError('Source bytes changed: ' + ', '.join(changed))
    return {'source_lock_sha256': expected_lock, 'base_lock_sha256': lock['base_lock_sha256'],
            'locked_files': len(lock['files']), 'explicit_extra': '.gitignore',
            'exact_inventory_files': len(actual)}

def save_report(output, report):
    output = Path(output)
    temporary = output / '.receipt.partial.json'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(output / 'receipt.json')

def finalize_report(output, report, final_guard):
    """Do not mask an original workload/compile error with a later guard error."""
    output = Path(output)
    failures = []
    try:
        report['final_source_guard'] = final_guard()
        report['source_verified_after'] = True
    except BaseException as error:
        report['source_verified_after'] = False
        failures.append({'stage': 'final_source_guard', 'error': repr(error)})
    artifacts = {}
    try:
        for path in sorted(output.rglob('*')):
            if path.is_file() and path.name not in ('receipt.json', '.receipt.partial.json', 'server.test'):
                try:
                    artifacts[str(path.relative_to(output))] = digest(path)
                except BaseException as error:
                    failures.append({'stage': 'artifact_hash', 'path': str(path.relative_to(output)), 'error': repr(error)})
    except BaseException as error:
        failures.append({'stage': 'artifact_inventory', 'error': repr(error)})
    report['artifacts'] = artifacts
    if failures:
        report['status'] = 'failed'
        report['finalization_failures'] = failures
    report['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save_report(output, report)
    return report['status'] == 'passed'
