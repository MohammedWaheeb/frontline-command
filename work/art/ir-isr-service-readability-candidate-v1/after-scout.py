"""Guarded serial continuation: full scout boundary, ISR pilot, one strike export."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
FAMILY = REPO / 'work/art/aircraft-final-production-v3'
STRIKE = REPO / 'work/art/aircraft-strike-final-production-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
plan = json.loads((BASE / 'boundary-plan.json').read_text())
for relative, wanted in plan['inputs'].items():
    assert sha(REPO / relative) == wanted, relative
events = []
status = BASE / 'boundary-status.json'
assert not status.exists(), 'Preserve a prior continuation attempt.'


def note(phase, **details):
    event = {'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'phase': phase, **details}
    events.append(event)
    temporary = status.with_suffix('.tmp')
    temporary.write_text(json.dumps({'scope': 'Mechanical queue only. No native review, '
                                    'handoff or full source promotion inferred.', 'events': events}, indent=2) + '\n')
    temporary.replace(status)
    print(json.dumps(event), flush=True)


def boundary():
    if (BASE / 'pause-next').exists():
        note('paused_at_whole_job_boundary')
        raise SystemExit(0)
    rows = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True).splitlines()
    active = [r for r in rows if r.strip().endswith('/Blender') or r.strip().endswith(' Blender')]
    assert not active, ('Unexpected Blender at serial boundary', active)


def job(phase, command, log, footer):
    boundary()
    assert not log.exists(), ('Preserve prior attempt', log)
    note(phase, command=command)
    with log.open('w') as stream:
        result = subprocess.run(command, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT)
    assert result.returncode == 0, (phase, result.returncode)
    assert footer in log.read_text(), (phase, 'Required footer missing')


try:
    note('waiting_for_scout_whole_asset', pid=plan['wait_pid'])
    while True:
        process = subprocess.run(['ps', '-p', str(plan['wait_pid']), '-o', 'command='],
                                 text=True, capture_output=True)
        if process.returncode or not process.stdout.strip():
            break
        assert process.stdout.strip() == plan['wait_command'], ('PID identity changed', process.stdout)
        time.sleep(10)
    assert 'FC_STAGED_AIRCRAFT_COMPLETE unit.SY.scout_drone' in (FAMILY / 'driver-unit.SY.scout_drone.log').read_text()
    for name in ['check', 'ui-check']:
        assert json.loads((FAMILY / (name + '-unit.SY.scout_drone.json')).read_text())['failures'] == 0
    note('scout_mechanically_closed_native_review_pending')
    job('isr_service_source_proof', ['blender', '-b', '-t', '4', '--factory-startup', '-P', str(BASE / 'prove.py')],
        BASE / 'proof-v1.log', 'FC_ISR_SERVICE_SOURCE_DONE 9024 96 9120')
    proof = json.loads((BASE / 'proof-v1.json').read_text())
    assert proof['failures'] == 0 and proof['candidate_sha256'] == sha(BASE / 'candidate-aircraft_roster.py')
    job('isr_service_native_pilot', ['blender', '-b', '-t', '4', '--factory-startup', '-P', str(BASE / 'pilot.py')],
        BASE / 'pilot-v1.log', 'FC_ISR_SERVICE_PILOT_DONE 6')
    boundary()
    subprocess.run([str(REPO / 'work/art/.venv/bin/python'), str(BASE / 'compose.py')], cwd=REPO, check=True)
    note('isr_native_comparison_ready_full_export_not_approved')
    job('sa_strike_approved_full_export', ['zsh', str(STRIKE / 'run-staged.sh'), 'unit.SA.strike'],
        STRIKE / 'driver-unit.SA.strike.log', 'FC_STAGED_AIRCRAFT_COMPLETE unit.SA.strike')
    note('sa_strike_mechanically_closed_native_review_pending')
except Exception as error:
    note('failed_preserved', error=repr(error))
    raise
