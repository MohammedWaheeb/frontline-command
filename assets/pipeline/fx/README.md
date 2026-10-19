# Original effect atlas sources

These deterministic Python/Pillow generators are the exact editable sources
recovered from `work/art/effects-opus-v2/src`. They draw original vector geometry;
no external images or fonts are used. The installed 71-effect pack was adopted
byte-for-byte from `work/art/effects-opus-v2/candidate-71/fx`.

Adoption hashes, full file validation and the bounded current consumer audit are
in `work/art/completion-20261013/fx-adoption.json`, `fx-root-validation.json` and
`fx-existing-audit.json`. Historical browser evidence remains in
`work/art/effects-opus-v2` and `work/fx-pack-residency`.

To export selected effects to a fresh directory, use the art Python environment:

```sh
work/art/.venv/bin/python assets/pipeline/fx/pack.py \
  --module fam_explosion --ids fx.explosion.small --out /tmp/frontline-fx-example
```

The family modules are `fam_explosion`, `fam_impact`, `fam_ballistics` and
`fam_ambient`. The exporter writes exact-byte metadata, atlases, review sheets
and source hashes. It does not install its output. Use the current
`client/scripts/ui/effect-pack.mjs` validator before adoption. The manifest
generator inventories installed files without promoting them to final approval.

Health, ranges, orders, placement, fog and warnings remain dynamic renderer
geometry driven by disclosed game state. Decorative FX do not replace those
indicators. Do not create effects for undisclosed outcomes or trajectories.
