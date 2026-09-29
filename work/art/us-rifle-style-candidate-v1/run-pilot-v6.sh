#!/bin/zsh
set -euo pipefail
fc_base=work/art/us-rifle-style-candidate-v1
rg -q '^FC_RIFLE_SOURCE_PROOF_DONE 24 200' "$fc_base/source-proof-v6.log"
test ! -e "$fc_base/pilot-v1"
blender -b -t 4 --factory-startup -P "$fc_base/render-pilot-v6.py" > "$fc_base/pilot-v6.log" 2>&1
rg -q '^FC_RIFLE_STYLE_PILOT_DONE 50 50' "$fc_base/pilot-v6.log"
blender -b -t 4 --factory-startup -P "$fc_base/stage/assets/pipeline/blender/render_ui_shots.py" -- "$fc_base/stage/assets/pipeline/specs/unit.US.rifle.json" > "$fc_base/ui-v6.log" 2>&1
rg -q '^FC_UI_SHOTS_DONE ' "$fc_base/ui-v6.log"
work/art/.venv/bin/python "$fc_base/check-pilot.py" > "$fc_base/check-v6.log" 2>&1
work/art/.venv/bin/python "$fc_base/family-and-ui.py" > "$fc_base/family-v6.log" 2>&1
print FC_RIFLE_PILOT_ALL_DONE
