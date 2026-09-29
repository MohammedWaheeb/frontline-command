"""Fresh bounded review dispatch after the actual noon UTC quota reset.

This does not retry or relabel earlier requests. It verifies review inputs,
disables Claude fallback, preserves complete CLI logs and audits actual models.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
MODEL = 'claude-opus-5-5'
RESET = datetime(2026, 9, 29, 12, tzinfo=timezone.utc)
REVIEW = {
    'presentation': ('29sept-v24-presentation-review.md', '29sept-v24-review/report.md'),
    'roster': ('29sept-complete-infantry-ui-mask-review-brief.md', '29sept-complete-infantry-ui-mask-review.md'),
    'hq': ('29sept-hq-role-review-brief.md', '29sept-hq-role-review.md'),
    'launcher': ('29sept-ground-launcher-charge-review-brief.md', '29sept-ground-launcher-charge-review.md'),
}
sha = lambda data: hashlib.sha256(data).hexdigest()

def prepare(kind):
    brief_name, report_name = REVIEW[kind]
    brief, report = ROOT / 'work/claude' / brief_name, ROOT / 'work/claude' / report_name
    prompt = brief.read_text()
    files = {str(brief.relative_to(ROOT)): sha(brief.read_bytes())}
    for relative in re.findall(r'`((?:work|assets|client)/[^`\n]+)`', prompt):
        file = ROOT / relative
        if file.is_file():
            files[relative] = sha(file.read_bytes())
    if kind in ('roster', 'hq', 'launcher'):
        lock_name = {'roster':'29sept-complete-infantry-ui-mask-review-lock.json','hq':'29sept-hq-role-review-lock.json','launcher':'29sept-ground-launcher-charge-review-lock.json'}[kind]
        lock_path = ROOT / 'work/claude' / lock_name
        files[str(lock_path.relative_to(ROOT))] = sha(lock_path.read_bytes())
        lock = json.loads(lock_path.read_text())
        for relative, digest in lock.get('files', lock.get('inputs', {})).items():
            assert sha((ROOT / relative).read_bytes()) == digest, relative
            files[relative] = digest
    assert not report.exists(), f'Preserve existing report and author a fresh assignment: {report}'
    return prompt, files, report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=REVIEW)
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    prompt, files, report = prepare(args.kind)
    if args.preflight:
        print(json.dumps({'status': 'prepared-only', 'inputs': len(files), 'report': str(report), 'not_before_utc': RESET.isoformat(), 'no_cli_request': True}))
        return
    assert datetime.now(timezone.utc) >= RESET, 'Claude quota has not reset; continue independent work'
    report.parent.mkdir(parents=True, exist_ok=True)
    session = str(uuid.uuid4())
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    prefix = ROOT / 'work/claude' / f'fresh-{args.kind}-{stamp}'
    def write(suffix, value):
        path = Path(str(prefix) + suffix)
        with path.open('x') as f:
            f.write(value if isinstance(value, str) else json.dumps(value, indent=2) + '\n')
    write('.input.md', prompt)
    write('.dispatch.json', {'requested_at_utc': datetime.now(timezone.utc).isoformat(), 'requested_model': MODEL, 'fallback': False, 'session': session, 'scope': args.kind, 'input_sha256': sha(prompt.encode()), 'files': files, 'report': str(report.relative_to(ROOT))})
    env = dict(os.environ)
    for key in ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL']:
        env.pop(key, None)
    env['CLAUDE_CODE_SUBAGENT_MODEL'] = MODEL
    command = ['claude', '--model', MODEL, '--fallback-model', '', '--setting-sources', '', '--settings', json.dumps({'model': MODEL, 'availableModels': [MODEL], 'fallbackModel': [], 'switchModelsOnFlag': False}), '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Write,Glob,Grep', '--disallowedTools', 'Agent,Task,SendMessage,Bash,Edit', '--output-format', 'stream-json', '--verbose', '--session-id', session, '--print']
    with Path(str(prefix) + '.input.md').open() as inp, Path(str(prefix) + '.jsonl').open('x') as out, Path(str(prefix) + '.err').open('x') as err:
        child = subprocess.Popen(command, cwd=ROOT, stdin=inp, stdout=out, stderr=err, env=env)
        print(json.dumps({'prefix': str(prefix.relative_to(ROOT)), 'pid': child.pid, 'session': session}), flush=True)
        code = child.wait()
    write('.exit.json', {'exit_code': code, 'finished_at_utc': datetime.now(timezone.utc).isoformat()})
    rows = [json.loads(line) for line in Path(str(prefix) + '.jsonl').read_text().splitlines() if line.strip()]
    assistant_models = [row['message'].get('model') for row in rows if row.get('type') == 'assistant']
    generated_models = sorted(set(model for model in assistant_models if model != '<synthetic>'), key=str)
    result = next((row for row in reversed(rows) if row.get('type') == 'result'), {})
    usage_models = sorted(result.get('modelUsage', {}))
    changed = [relative for relative, digest in files.items() if not (ROOT / relative).is_file() or sha((ROOT / relative).read_bytes()) != digest]
    exact = generated_models == [MODEL] and usage_models == [MODEL]
    completed = code == 0 and not result.get('is_error', True) and result.get('terminal_reason') == 'completed' and report.is_file() and exact and not changed
    audit = {'status': 'completed-exact-model' if completed else 'incomplete-or-rejected', 'requested_model': MODEL, 'fallback': False, 'generated_models': generated_models, 'usage_models': usage_models, 'synthetic_notice_count': assistant_models.count('<synthetic>'), 'exit_code': code, 'terminal_reason': result.get('terminal_reason'), 'is_error': result.get('is_error'), 'inputs_changed': changed, 'report_exists': report.is_file(), 'report_sha256': sha(report.read_bytes()) if report.is_file() else None}
    write('.model-audit.json', audit)
    print(json.dumps(audit), flush=True)
    if not completed:
        raise SystemExit(code or 1)

if __name__ == '__main__':
    main()
