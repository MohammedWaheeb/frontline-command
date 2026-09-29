# Presentation packaging guard

The ordinary package builder previously pinned Go/content inputs but did not
bind its client and art outputs to a frozen set of inputs. This candidate
adds that guard without changing gameplay, visuals, artwork or dependencies.
The reviewed four-file delta is now selectively integrated, with a production
regression suite. No gameplay, runtime binary or artwork was changed.

## Scope

- Capture authored client sources, runtime build scripts, configuration and
  nested source dependencies before `runtime:build`; verify them afterward.
  Capture generated protocol and public runtime outputs only after that build.
- Share the actual art-plugin source-to-output enumeration. Pin selected art,
  fonts, SVGs, audio notices, effect approval manifest and content JSON, then
  re-enumerate and hash after Vite and again after the native package copy.
- Verify every copied presentation file and Vite's separately emitted font and
  image assets against the exact originating source. Preserve authored content
  index fields while permitting its generated base-pack version.
- Reject public/art/content/generated destination collisions, including dynamic
  Vite/CSS output collisions even if the colliding bytes happen to match.
- Check the native host's separate content JSON copies against their unmodified
  authored originals. The browser index has its own generated pack identity.
- Record presentation identity in package `version.json` alongside existing
  Go/content and product-pack integrity records.

Top-level installed build tools/dependencies remain governed by the pinned npm
lockfile; their installed bytes are not exhaustively fingerprinted here. The
existing nested `client/src/runtime/node_modules` tree is included because it
is inside the authored source tree and participates in module resolution.
These checks establish build consistency, not completion or visual approval of
the selected artwork. Final art publication needs its separate handoff receipt.

## Evidence

`checks-01.log` preserves the initial17 passing tests and real tiny Vite build.
`checks-02.log` records20 passing tests after adding HTML/dynamic-output
collisions, native-content verification, and the explicit authored worker
source fixture. Tests exercise real Vite8.3.1 output and intentional corruption,
input additions/removals, nested dependency drift, effect approval changes,
content-index changes and source symlink escape/cycle rejection.

Independent review found three further gaps: a baseline change between runtime
verification and presentation capture; dynamic chunk collisions with reserved
generated paths; and transient extra files surviving copying after their source
was removed. All three are corrected in the final candidate. `checks-04.log`
records29 passing tests, including these regressions and exact host JSON path
sets. The parsed content index is also bound to its captured byte hash.

`build-current.mjs` loads the ordinary current Vite configuration, replaces only
its art plugin with the candidate, and enables the proposed asset manifest in
an isolated output directory. The final `checks-product-02/receipt.json`
records6,157 input files,4,505 copied outputs,16 separate Vite assets and26 CSS
dependencies. Static product integrity and before/after source/candidate
guards pass. The pack has4,542 inventory files; its SHA-256 is
`eb5199b52b2e7fde8c8671ccbaee7d4d60cdcc5adb140463326e175b8d655776`.
The earlier product01 has the same output bytes, but tests the previous guard;
its receipt remains separate. The final receipt SHA is
`8b239651cb738550276e5682a3324da26c38b5cc3e233cab7ff685b46846e3da`.

This rehearsal uses current **incomplete** live art and the old accepted Go0.3.4
runtime. It did not rebuild the runtime, run the complete `make build`, start a
host, launch a browser, publish staged art or deploy anything. The isolated
product is not a release candidate. After the rehearsal, root copied the four
reviewed files under exact old-hash guards. `integration-final.json` records
those files, the new production regression runner, and the subsequent one-line
addition that includes packaging checks in `make test`. All37 packaging,
integrity and licensing checks pass; `local.mjs` passes syntax validation.
The full ordinary package command is still unrun with the final art/runtime.

The independent review is in
`../evidence/package-presentation-guard-review-v1/README.md`. Two archives retain
the compact evidence with readback-verified hashes. Product01's driver was
recovered by reversing the two known edits and matching its original SHA;
its exact candidate preimages survive in the checks02 fixture snapshot.

## Reproduction

Run from the workspace root, choosing an unused evidence directory each time:

```sh
node --test scripts/package-integrity.test.mjs scripts/package-licenses.test.mjs scripts/package-presentation-inputs.test.mjs
CHECK_DIR=checks-05 node --test work/package-presentation-guard-v1/checks.test.mjs
CHECK_DIR=checks-product-03 node work/package-presentation-guard-v1/build-current.mjs
```

Do not run the second command concurrently with changes to the live client/art
or candidate files. A changed source causes a retained failure rather than
silently certifying mixed output. The large private fixture/product directories
are ignored; compact logs, selected receipts and hashes are retained separately.
