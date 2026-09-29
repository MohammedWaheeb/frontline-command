#!/bin/zsh
# One approved full building; native review and handoff required before continuing.
set -euo pipefail
fc_base=work/art/building-final-production-v1
fc_stage=$fc_base/stage
fc_family=$fc_stage/work/art/building-roster
fc_id=$1
python3 "$fc_base/preflight.py" "$fc_id"
test ! -e "$fc_family/full-$fc_id.log"
print "$fc_id" > "$fc_base/current-asset.txt"
blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_asset.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/full-$fc_id.log" 2>&1
rg -q "^FC_RENDER_DONE $fc_id poses=" "$fc_family/full-$fc_id.log"
work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "$fc_family/pack-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/check-one.py" "$fc_id" > "$fc_family/check-$fc_id.log" 2>&1
blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_ui_shots.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/ui-$fc_id.log" 2>&1
rg -q '^FC_UI_SHOTS_DONE ' "$fc_family/ui-$fc_id.log"
work/art/.venv/bin/python "$fc_family/derive-ui.py" "$fc_id" > "$fc_family/ui-check-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/packed-contact.py" "$fc_id" > "$fc_family/contact-$fc_id.log" 2>&1
print "$fc_id" >> "$fc_family/completed-assets.txt"
print "FC_REMAINING_BUILDING_COMPLETE $fc_id"
