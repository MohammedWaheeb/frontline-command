# Bounded package source-state metadata

The real workspace's `git status --porcelain` output measured975,221 bytes and
13,263 lines while full artwork production was still incomplete. The package
builder previously captured that whole output through `execFileSync`, whose
default1MiB buffer would make larger workspaces fail near the end of packaging.

`commandHasOutput` now drains stdout without retaining it, bounds stderr to
16KiB, and waits for process completion. Nonzero exit, signals and spawn failure
remain errors. `local.mjs` awaits it for `source_dirty` before package metadata,
checksums and the final rename. The dirty/clean meaning is unchanged; no command
timeout or new Git mutation is introduced.

All39 packaging/integrity/license tests pass. The two new tests exercise3MiB
stdout, bounded2MiB stderr with a failure after stdout, an absent executable,
and a real temporary Git repository in clean, untracked and staged states.
Both modified modules pass syntax validation. Einstein independently reviewed
the helper and callsite with no blocking finding; he did not rerun the tests.

This is build metadata robustness, not a game or finished-package acceptance
claim. The full ordinary package build still follows the new Go promotion.
