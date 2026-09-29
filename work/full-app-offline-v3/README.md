# Full App cold offline continuation

The actual frozen loader-v3 App installed its complete 4,845-file pack (587,425,553 bytes), closed both the browser and HTTP server, then cold-started in the same isolated profile with networking disabled. The ordinary save and replay screens worked through the real Go WASM engine. **This is functional evidence, not a clean overall pass.**

`run-03` completed seven assertions on genuine Chrome 154.0.8037.58. The saved and restored operation agreed at tick 533, hash `72c01ef056cbd0fd9d6725118570561ff5196e9946a9ee9d53320d53751c2393`. The replay sought to 533 and back to zero. The three returns to the menu released the transport, frame subscriptions and resident art pages. All cache payloads were read back and matched their declared length and SHA-256. Both online and cold-session observers are retained, without overflow or observed RPC, console or HTTP errors. All 142 input pins remained unchanged. The profile was removed and all processes closed.

Its strict result remains **failed: 702 raw browser request failures**, comprising 114 during online solo, 585 during installation, two during cold load and one during cold replay. This course did not collect native request identity and original-body traces, so it does not classify or waive those failures. Cache readback alone cannot do so. The independent review is in `work/evidence/full-app-offline-review/run03-review.md`.

`run-02` remains a separate failed run with 711 raw failures. It also had three driver gaps: the online observer was not retained, diagnostics were checked before final browser closure, and a post-run pin failure could bypass receipt cleanup. `runner-v2.mjs` fixes those three gaps; `run-03` uses that exact copy. `run-01` is preparation only. None is relabeled or overwritten.

## Exact scope

- Build: `work/art-generation-consumer-v1/app-v3-build-03`, receipt SHA `f714d2d6c761dc9b389f91034f361e4662f0c420e42905b1229b1ee76d7cd445`.
- Pack SHA: `9387365786fcd3f53049bdd1a87482a37eac8f18561fa276d36c977f26224559`.
- Unchanged Go 0.3.4 and incomplete v25+36 art; this predates the subsequent audio-retry integration and new presentation candidate.
- No final art, long-match victory, multiplayer, physical LAN, deployment or finished-game claim.

The exact large JSON receipts, save payloads and bundled observer are preserved losslessly in `evidence.tar.gz`; `evidence-files.json` records each original path, byte count and hash. Screenshots and drivers are stored directly. Root viewed all three run-03 screenshots: the cache status, restored battlefield and replay were visible; the old fog scallops remained a separate visual defect.

To run a new isolated course, choose an unused run number and invoke `node work/full-app-offline-v3/runner-v2.mjs run-N --execute`. Without `--execute`, it only prepares. Coordinate the single browser lane first. The driver refuses to overwrite any previous run.
