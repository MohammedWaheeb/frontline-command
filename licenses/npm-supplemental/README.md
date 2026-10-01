# Supplemental npm dependency notices

The pinned npm distributions for `@bufbuild/protobuf@2.15.0` and
`@pixi/colord@2.9.6` omit root license files. These are exact upstream notices,
retained for the local package. The manifest binds each supplement to the exact
package version, npm integrity value and notice SHA-256. The build rejects drift.

The Apache and MIT notices were retrieved from the npm registry's exact upstream
`gitHead` commits; their Git blob hashes were checked against each repository
commit tree. The protobuf BSD notice comes from the installed package's
`dist/esm/wire/varint.js`, first 32 comment lines, with only comment prefixes
removed. Its whole source file is also pinned and checked during packaging.

No license terms are rewritten. The `.md` extensions make these text notices
readable with the project documentation. Exact URLs and hashes are in
[manifest.json](manifest.json). Original retrieval receipts are in
`work/local-package-v25/npm-license-01/`.
