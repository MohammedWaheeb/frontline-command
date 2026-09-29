#!/bin/zsh
# Sole Blender owner only. No live paths and no overwrite of previous work.
set -euo pipefail
fc_base=work/art/ground-launcher-charge-contract-v1/production-v1
fc_stage=$fc_base/stage
fc_family=$fc_stage/work/art/vehicle-production
python3 "$fc_base/preflight.py" "$@"
for fc_id in "$@"; do
  python3 "$fc_base/preflight.py" "$fc_id"
  test ! -e "$fc_family/full-$fc_id.log"
  test ! -e "$fc_family/source-$fc_id.log"
  print "$fc_id" > "$fc_base/current-asset.txt"
  blender -b -t 4 --factory-startup -P "$fc_family/model-audit.py" -- "$fc_id" > "$fc_family/source-$fc_id.log" 2>&1
  rg -q "^FC_VEHICLE_MODEL_AUDIT_DONE $fc_id " "$fc_family/source-$fc_id.log"
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_reuse.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/full-$fc_id.log" 2>&1
  rg -q "^FC_RENDER_DONE $fc_id poses=" "$fc_family/full-$fc_id.log"
  work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "$fc_family/pack-$fc_id.log" 2>&1
  work/art/.venv/bin/python "$fc_family/check-one.py" "$fc_id" > "$fc_family/check-$fc_id.log" 2>&1
  blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_ui_shots.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/ui-$fc_id.log" 2>&1
  rg -q '^FC_UI_SHOTS_DONE ' "$fc_family/ui-$fc_id.log"
  work/art/.venv/bin/python "$fc_family/ui-and-contacts.py" "$fc_id" > "$fc_family/contact-$fc_id.log" 2>&1
  print "$fc_id" >> "$fc_family/completed-assets.txt"
  print "FC_CHARGE_FULL_EXPORT_COMPLETE $fc_id"
  # Every asset returns to the agent for required native review.
  exit 0
done
