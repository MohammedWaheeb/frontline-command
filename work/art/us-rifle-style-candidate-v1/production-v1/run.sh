#!/bin/zsh
set -euo pipefail
fc_base=work/art/us-rifle-style-candidate-v1/production-v1
fc_stage=$fc_base/stage
fc_family=$fc_stage/work/art/infantry-roster
fc_id=unit.US.rifle
python3 "$fc_base/preflight.py"
test ! -e "$fc_family/full-$fc_id.log"
blender -b -t 4 --factory-startup -P "$fc_stage/assets/pipeline/blender/render_reuse.py" -- "$fc_stage/assets/pipeline/specs/$fc_id.json" > "$fc_family/full-$fc_id.log" 2>&1
rg -q "^FC_RENDER_DONE $fc_id poses=200 " "$fc_family/full-$fc_id.log"
work/art/.venv/bin/python "$fc_stage/assets/pipeline/tools/pack_sprites.py" "$fc_id" > "$fc_family/pack-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/check-one.py" "$fc_id" > "$fc_family/check-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/derive-ui.py" "$fc_id" > "$fc_family/ui-check-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/packed-contact.py" "$fc_id" > "$fc_family/contact-$fc_id.log" 2>&1
work/art/.venv/bin/python "$fc_family/native-ui-contact.py" "$fc_id" > "$fc_family/ui-contact-$fc_id.log" 2>&1
print "$fc_id" > "$fc_family/completed-assets.txt"
print FC_RIFLE_FULL_COMPLETE
