#!/bin/zsh
# Candidate artifacts only. Must execute in the sole Blender queue.
set -euo pipefail
python3 work/art/aircraft-strike-final-production-v1/preflight.py "$@"
fc_stage=$(python3 - <<'PY_STAGE'
import json
from pathlib import Path
base=Path('work/art/aircraft-strike-final-production-v1')
stage=Path(json.loads((base/'production-lock.json').read_text())['stage'])
assert stage.resolve().is_relative_to(base.resolve())
assert stage.resolve()!=(base/'stage-v1').resolve(), 'Original stage-v1 is immutable'
print(stage)
PY_STAGE
)
for fc_id in "$@"; do
  python3 work/art/aircraft-strike-final-production-v1/preflight.py "$fc_id"
  if [[ -f work/art/aircraft-strike-final-production-v1/completed-assets.txt ]] && rg -q "^$fc_id$" work/art/aircraft-strike-final-production-v1/completed-assets.txt; then
    print -u2 "Refusing to overwrite completed candidate $fc_id"; exit 2
  fi
  test ! -e "work/art/aircraft-strike-final-production-v1/full-$fc_id.log"
  work/art/.venv/bin/python work/art/aircraft-strike-final-production-v1/seed-pilot.py "$fc_id"
  print "$fc_id" > work/art/aircraft-strike-final-production-v1/current-asset.txt
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_reuse.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "work/art/aircraft-strike-final-production-v1/full-$fc_id.log" 2>&1
  rg -q "^FC_RENDER_DONE $fc_id poses=" "work/art/aircraft-strike-final-production-v1/full-$fc_id.log"
  work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "work/art/aircraft-strike-final-production-v1/pack-$fc_id.log" 2>&1
  work/art/.venv/bin/python work/art/aircraft-strike-final-production-v1/check-one.py "$fc_id" > "work/art/aircraft-strike-final-production-v1/check-$fc_id.log" 2>&1
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_ui_shots.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "work/art/aircraft-strike-final-production-v1/ui-$fc_id.log" 2>&1
  rg -q '^FC_UI_SHOTS_DONE ' "work/art/aircraft-strike-final-production-v1/ui-$fc_id.log"
  work/art/.venv/bin/python work/art/aircraft-strike-final-production-v1/ui-and-contacts.py "$fc_id" > "work/art/aircraft-strike-final-production-v1/contacts-$fc_id.log" 2>&1
  print "$fc_id" >> work/art/aircraft-strike-final-production-v1/completed-assets.txt
  print "FC_STAGED_AIRCRAFT_COMPLETE $fc_id"
  if [[ -f work/art/aircraft-strike-final-production-v1/pause-after-current ]]; then
    print "FC_STAGED_AIRCRAFT_PAUSED_AFTER_ASSET $fc_id"; exit 0
  fi
done
print FC_STAGED_AIRCRAFT_BATCH_DONE
