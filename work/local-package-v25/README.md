# Native macOS package rehearsal — 29 September 2026

## Accepted scope

`assembly-05/receipt.json` records an assembled **native macOS arm64** package
from the immutable v25 base and 36-export overlay. The folder contains spaces.
All 4,868 product manifest files / 591,439,212 bytes validate before and after
copying; the package inventory contains 5,050 files / 650,297,073 bytes. The native
executable is the original v25 executable, built with CGO enabled and linked to
system Mac libraries. This rehearsal does not claim the newer production
packager's CGO-disabled build was executed.

`startup-01/receipt.json` passes actual `Play.command` startup from `/private/tmp`
with `PATH=/usr/bin:/bin`, then health/version parity, exact HTTP bytes and MIME
for nine static routes, content/maps/missions APIs, and local profile creation
and authentication. No credential is included in the receipt. Every original
package file was rehashed unchanged. The owned host was stopped and closed.

The package manifest SHA-256 is
`bc4fe56b9490a493b41725367c9f7c1d8912c522307df09804b228939a6e40c9`.
The source scripts and content/source receipts were hashed before and after
assembly. Later script refinements do not relabel this captured attempt.

## Preserved failures and corrections

- Assembly 01: Homebrew places Go's BSD license above its `libexec` GOROOT.
  The packaging resolver now checks that exact supported location and validates
  the notice; it still fails if the runtime notice is absent or unrelated.
- Assemblies 02/03: graph-only Go dependencies lacked a `Dir` in `go list`.
  Exact module versions are now resolved outside the source tree, with Go's
  checksum verification retained. A private download initially encountered an
  HTTP/2 checksum-server interruption; its retry completed. Original live and
  frozen `go.mod`/`go.sum` were not changed.
- Assembly 04: two installed npm runtime packages omit root license files.
  Version/integrity-bound upstream supplements include both protobuf licenses
  and the colord MIT notice. Their original registry/commit/tree/download
  receipts remain in `npm-license-01/`; the reusable supplements are in
  `licenses/npm-supplemental/`.
- Seven packaging/license tests pass in `package-unit-01.log`, including changed
  supplemental notices, source drift, integrity/version mismatches, unsafe paths,
  native CPU/header mismatch and changed/unlisted/missing offline resources.

## Limits

This is an isolated package-layout and native launch rehearsal, **not execution
of the complete `make build` pipeline**, browser gameplay, physical LAN,
Windows/Linux execution or final-release acceptance. The art is incomplete and
the older product retains the separately reproduced generation-mixing defect.
The diagnostic profile/database is disposable rehearsal data, not user data.
Generated package contents stay local and are excluded from Git. No deployment.
