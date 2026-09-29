#!/bin/zsh
set -euo pipefail
fc_base=work/art/hq-role-candidate-v1/production-v1
fc_stage=$fc_base/stage
fc_family=$fc_stage/work/art/building-roster
fc_id=$1
python3 "$fc_base/preflight.py" "$fc_id"
test ! -e "$fc_family/full-$fc_id.log"
blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_reuse.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/full-$fc_id.log" 2>&1
rg -q "^FC_RENDER_DONE $fc_id poses=28 " "$fc_family/full-$fc_id.log"
work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "$fc_family/pack-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/check-one.py" "$fc_id" > "$fc_family/check-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/derive-ui.py" "$fc_id" > "$fc_family/ui-check-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/packed-contact.py" "$fc_id" > "$fc_family/contact-$fc_id.log" 2>&1
print "$fc_id" >> "$fc_family/completed-assets.txt"
print "FC_HQ_FULL_COMPLETE $fc_id"
