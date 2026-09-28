#!/bin/zsh
# Candidate artifacts only. Must execute in the sole Blender queue.
set -euo pipefail
fc_stage=work/art/aircraft-production/stage-v1
python3 work/art/aircraft-production/preflight.py "$@"
for fc_id in "$@"; do
  python3 work/art/aircraft-production/preflight.py "$fc_id"
  if [[ -f work/art/aircraft-production/completed-assets.txt ]] && rg -q "^$fc_id$" work/art/aircraft-production/completed-assets.txt; then
    print -u2 "Refusing to overwrite completed candidate $fc_id"; exit 2
  fi
  print "$fc_id" > work/art/aircraft-production/current-asset.txt
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_asset.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "work/art/aircraft-production/full-$fc_id.log" 2>&1
  rg -q "^FC_RENDER_DONE $fc_id poses=" "work/art/aircraft-production/full-$fc_id.log"
  work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "work/art/aircraft-production/pack-$fc_id.log" 2>&1
  work/art/.venv/bin/python work/art/aircraft-production/check-one.py "$fc_id" > "work/art/aircraft-production/check-$fc_id.log" 2>&1
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_ui_shots.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "work/art/aircraft-production/ui-$fc_id.log" 2>&1
  rg -q '^FC_UI_SHOTS_DONE ' "work/art/aircraft-production/ui-$fc_id.log"
  work/art/.venv/bin/python work/art/aircraft-production/ui-and-contacts.py "$fc_id" > "work/art/aircraft-production/contacts-$fc_id.log" 2>&1
  print "$fc_id" >> work/art/aircraft-production/completed-assets.txt
  print "FC_STAGED_AIRCRAFT_COMPLETE $fc_id"
  if [[ -f work/art/aircraft-production/pause-after-current ]]; then
    print "FC_STAGED_AIRCRAFT_PAUSED_AFTER_ASSET $fc_id"; exit 0
  fi
done
print FC_STAGED_AIRCRAFT_BATCH_DONE
