# Bounded aircraft authorship amendment

Exactly eleven new-aircraft manifest entries now distinguish original Claude Code `claude-opus-5-5` model authorship from Codex corrections and Blender operation during the authorized quota fallback. This changes only `source` and `provenance`; all status, artwork, audio, FX, and unrelated entry fields are unchanged. No model, spec, sprite, stage manifest, or acceptance status is promoted.

The original source is SHA `f6f6ee359dec2dd5fcb5695607d2a7fd5ba3d84f895e4e585ec699c7dee8529e`, verified against commit `00011c3` and the preserved aperture baseline lock. The later `dca923…76f2` source includes the Codex aperture correction and is recorded separately. The initial proposal conflated these two historical hashes; `before-author-history-correction/` preserves that proposal and its checks. The corrected generator was checked again before publication.

`publication.json` records exact target IDs and before/after hashes. The live manifest was freshly copied to `before-publication/` immediately before this bounded patch; no whole-manifest regeneration occurred. `generator-check.json` proves the eleven exact overrides and151 unchanged attribution outputs across all162 current specs. Frozen production stages intentionally retain their own historical manifests. Full revised exports and runtime lifecycle acceptance remain separate gates.
