#!/usr/bin/env bash
# Render every asset spec (or those given as arguments) through Blender.
# Usage: assets/pipeline/render_all.sh [spec.json ...]
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-blender}"
specs=("$@")
if [ ${#specs[@]} -eq 0 ]; then
  specs=(assets/pipeline/specs/*.json)
fi
mkdir -p work/art/logs
for spec in "${specs[@]}"; do
  id="$(basename "$spec" .json)"
  rm -rf "assets/build/frames/$id"
  echo "== $id"
  "$BLENDER" -b --factory-startup -P assets/pipeline/blender/render_asset.py -- "$spec" \
    > "work/art/logs/render-$id.log" 2>&1
  grep -E 'FC_RENDER_DONE' "work/art/logs/render-$id.log" || { echo "FAILED $id"; tail -20 "work/art/logs/render-$id.log"; exit 1; }
done
