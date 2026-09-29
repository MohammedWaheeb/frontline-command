# Low-power preservation, 29 September

The active IR launcher job is the only Blender process. Its driver intentionally returns after this single asset; no new family should start until parent confirms AC or adequate power. Checkpoint commit c907bd1 preserves sources, tools, validated pilot/raw-reuse contracts and the read-only PNG progress inventory. Raw frame files remain at their original paths; the in-progress export is not a complete asset.

If the machine sleeps, first inspect the exact recorded process and session rather than starting another renderer. Resume the same owned process only after power and parent coordination. If the process has exited, retain its partial logs and output unchanged. Reverify the frozen model/spec/render/tool hashes and complete source-pose audit; verify every candidate reused PNG by decoding it and recording its SHA. An interrupted file is not reusable. Build a separately named sibling recovery stage and explicit extended reuse receipt before rendering only missing poses. Never treat file presence alone as a finished export, silently relax a byte gate, or overwrite the original partial stage. The usual complete pack, source/hardpoint/pixel checks, fresh UI, native review and handoff still apply.

The currently prepared production-v3 aircraft family contains no renders and is not an instruction to start it while power is held.
