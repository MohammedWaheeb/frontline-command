"""One serial queue: approved US strike, then approved ISR successor.

Wait for the exact existing controller to finish SA strike. Any failure or
pause preserves evidence and stops. Native review and handoffs stay manual.
"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
PREVIOUS = REPO / 'work/art/ir-isr-service-readability-candidate-v1'
STRIKE = REPO / 'work/art/aircraft-strike-final-production-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
plan = json.loads((BASE / 'boundary-plan.json').read_text())
for relative, wanted in plan['inputs'].items():
    assert sha(REPO / relative) == wanted, relative
status = BASE / 'boundary-status.json'
assert not status.exists(), 'Preserve previous attempts.'
events = []


def note(phase, **fields):
    event = {'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'phase': phase, **fields}
    events.append(event)
    temporary = status.with_suffix('.tmp')
    temporary.write_text(json.dumps({'scope': 'Mechanical queue only; no native review, handoff, live publication or final acceptance inferred.',
                                     'events': events}, indent=2) + '\n')
    temporary.replace(status)
    print(json.dumps(event), flush=True)


def boundary():
    flags = [BASE / 'pause-next', PREVIOUS / 'pause-next', STRIKE / 'pause-after-current']
    if any(p.exists() for p in flags):
        note('paused_at_whole_asset_boundary', flags=[str(p.relative_to(REPO)) for p in flags if p.exists()])
        raise SystemExit(0)
    rows = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True).splitlines()
    assert not [r for r in rows if r.strip().endswith('/Blender') or r.strip().endswith(' Blender')]
    power = subprocess.check_output(['pmset', '-g', 'batt'], text=True)
    assert "'AC Power'" in power, ('No AC power at new whole-asset launch', power)


def completed(family, aid):
    assert 'FC_STAGED_AIRCRAFT_COMPLETE ' + aid in (family / ('driver-' + aid + '.log')).read_text()
    for prefix in ['check-', 'ui-check-']:
        assert json.loads((family / (prefix + aid + '.json')).read_text())['failures'] == 0


try:
    note('waiting_for_sa_strike_controller', pid=plan['wait_pid'])
    while True:
        p = subprocess.run(['ps', '-p', str(plan['wait_pid']), '-o', 'command='], text=True, capture_output=True)
        if p.returncode or not p.stdout.strip():
            break
        assert p.stdout.strip() == plan['wait_command'], ('PID identity changed', p.stdout)
        time.sleep(10)
    last = json.loads((PREVIOUS / 'boundary-status.json').read_text())['events'][-1]['phase']
    assert last == 'sa_strike_mechanically_closed_native_review_pending', last
    completed(STRIKE, 'unit.SA.strike')
    for family, aid in [(STRIKE, 'unit.US.strike'), (BASE, 'unit.IR.isr')]:
        boundary()
        log = family / ('driver-' + aid + '.log')
        assert not log.exists(), ('Preserve prior attempt', log)
        command = ['zsh', str(family / 'run-staged.sh'), aid]
        note('approved_full_export', id=aid, command=command)
        with log.open('w') as stream:
            result = subprocess.run(command, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT)
        assert result.returncode == 0, (aid, result.returncode)
        completed(family, aid)
        note('mechanically_closed_native_review_pending', id=aid)
    note('approved_pair_mechanically_closed')
except Exception as error:
    note('failed_preserved', error=repr(error))
    raise
