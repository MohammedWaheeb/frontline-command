# Genuine desktop browser prerequisites

2026-09-29: official Chrome, Edge, stock Firefox and geckodriver are downloaded and extracted under `20260929-prerequisites/`. Their executable identities and signatures are verified. Existing Safari and safaridriver were inspected read-only. **No browser or WebDriver server/session was launched. Product compatibility remains untested in these genuine browser applications.**

Host: Apple Silicon `arm64`, macOS 26.5.1, build `25F80`. Apps remain task-local; no `/Applications` replacement, package installation, installer-script execution, browser profile, default-browser setting or UI preference change occurred. Universal executables include native `arm64` code; no Rosetta-only browser was substituted.

## Exact staged versions

All paths in this table are relative to `work/tools/browsers/20260929-prerequisites/`, except Safari's existing absolute paths. `executables.json` provides exact absolute paths for a future root-owned driver.

| Product | Version | Executable | Verification |
| --- | --- | --- | --- |
| Google Chrome Stable | 154.0.8037.58 | `apps/Google Chrome.app/Contents/MacOS/Google Chrome` | `com.google.Chrome`; Google team `EQHXZ8M8AV`; deep/strict codesign and Gatekeeper pass, Notarized Developer ID |
| Microsoft Edge Stable | 154.0.4258.37 | `apps/Microsoft Edge.app/Contents/MacOS/Microsoft Edge` | `com.microsoft.edgemac`; Microsoft team `UBF8T346G9`; deep/strict codesign and Gatekeeper pass, Notarized Developer ID; installer signature/notarization and vendor package digest match |
| Stock Mozilla Firefox | 156.0.1 | `apps/Firefox.app/Contents/MacOS/firefox` | `org.mozilla.firefox`; Mozilla team `43AQ936H96`; deep/strict codesign and Gatekeeper pass, Notarized Developer ID; official release checksum matches |
| geckodriver | 0.37.1 (`300705c65d1b`) | `bin/geckodriver` | Mozilla-signed, strict codesign pass; official release-asset SHA-256 matches; `--version` only, no server/session |
| Existing Safari | 26.5 (`21624.2.5.11.4`) | `/Applications/Safari.app/Contents/MacOS/Safari` | Existing Apple signature, deep/strict codesign pass |
| Existing safaridriver | Included with Safari 26.5 (`21624.2.5.11.4`) | `/usr/bin/safaridriver` | Apple signature and matching driver version; only help/version and read-only verification |

Chrome, Edge, Firefox and even the release archive named `geckodriver-…-macos-aarch64` contain Universal `x86_64 arm64` executables. Versions were read from signed application metadata, not by launching their browser executables.

## Official sources and current-version distinction

- Chrome: [Google's download page](https://www.google.com/chrome/), [enterprise download guidance](https://support.google.com/chrome/a/answer/9020580?hl=en), and the [official Universal Stable DMG](https://dl.google.com/chrome/mac/universal/stable/GGRO/googlechrome.dmg). It redirects within `dl.google.com` and supplied 154.0.8037.58. Google's [active Mac ARM64 Stable release feed](https://versionhistory.googleapis.com/v1/chrome/platforms/mac_arm64/channels/stable/versions/all/releases?filter=endtime=none&order_by=version%20desc&pageSize=10) also lists 155.0.8059.12, but at fraction 0.005 of rollout group 195. The downloaded 154 build has fraction 0.99 in that group and 1.0 in group 194. This is the standard stable download retrieved on this date, not a claim that every Stable user has the same version. The guessed ARM64-only DMG endpoint returned 404; the official Universal app provides native ARM64 and was retained.
- Edge: [Microsoft's desktop download page](https://www.microsoft.com/en-us/edge/download), [business download page](https://www.microsoft.com/en-us/edge/business/download), and [official release/package feed](https://edgeupdates.microsoft.com/api/products?view=enterprise). The latest listed MacOS Stable release is 154.0.4258.37, published 2026-09-24; exact immutable Microsoft package URL is in `downloads.json`. `pkgutil --expand-full` extracted its signed payload; no installation or updater registration ran.
- Firefox: [Mozilla's download page](https://www.mozilla.org/en-US/firefox/new/), [version feed](https://product-details.mozilla.org/1.0/firefox_versions.json), [156.0.1 release notes](https://www.firefox.com/en-US/firefox/156.0.1/releasenotes/) and [release checksums](https://archive.mozilla.org/pub/firefox/releases/156.0.1/SHA256SUMS). The latest-release download redirected to Mozilla's 156.0.1 Mac English DMG, matching the version feed and checksum.
- geckodriver: [Mozilla's official v0.37.1 release](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1). The official `macos-aarch64.tar.gz` asset digest matches the release API metadata. Only the single regular `geckodriver` archive member was extracted.

The two DMGs were mounted read-only with `-nobrowse -noautoopen`, copied with `ditto`, then detached. No quarantine or signature bypass was applied. The Edge installer and its expanded payload remain local for inspection. All binary archives and apps are ignored by Git; receipts and the extraction procedure are tracked.

## Download SHA-256

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Chrome DMG | 282,964,019 | `0aea98069829154bfcb6a50220feb063ab57c064da9ab75693f1fdb468a6def4` |
| Edge PKG | 447,799,935 | `d104a5c2f288b3f8d8db964bba26e8545f645ea88b0d64ece1215b63a742a9a5` |
| Firefox DMG | 160,451,034 | `7eda94829670b892524eddfee575d16fe74b9329d3d0795367cce035207d34a4` |
| geckodriver archive | 4,234,637 | `d02b3f7003f999caf90974a2ef5da0286c05d01cee19112c86846d759fdba4f5` |

`verification.json` also records executable, Info.plist and major signed framework/XUL digests, exact code-signing output, architecture and Gatekeeper results. Chrome's archive digest is a locally computed identity, not an independently published vendor checksum. Its extracted application passed the signed-resource/developer identity and notarization checks. Microsoft, Firefox and geckodriver archive digests additionally match their official published metadata.

## Automation handoff and remaining constraints

Chrome and Edge can be attempted through existing Playwright Chromium support using their **explicit task-local executable paths** and fresh temporary profiles. Default channel lookup would expect conventional installation locations. Do not reuse personal browser profiles or install global applications merely to satisfy that lookup. Product launches and actual API compatibility are still pending the root-owned browser lane.

Stock Firefox needs geckodriver with `moz:firefoxOptions.binary` set to the staged `firefox` path, plus a throwaway profile. [Mozilla documents](https://firefox-source-docs.mozilla.org/testing/geckodriver/Profiles.html) that geckodriver normally creates a temporary profile; close its WebDriver session cleanly. [Mozilla's support table](https://firefox-source-docs.mozilla.org/testing/geckodriver/Support.html) lists Firefox 115 ESR as geckodriver 0.37.1's minimum and no maximum. That is a compatibility prerequisite, not an actual session pass.

Safari must use `/usr/bin/safaridriver` for this installed Safari version. [Apple documents](https://developer.apple.com/documentation/safari-developer-tools/macos-enabling-webdriver) enabling remote automation through Developer Settings or `safaridriver --enable`, potentially requiring administrative authorization on an upgraded OS. **Neither was performed.** The read-only `AllowRemoteAutomation` preference lookup returned an absent key. This does not establish the effective configuration, and no session was started to test it. Root must treat Safari automation readiness as unresolved and handle the documented setup explicitly before testing; no unsupported preference write or prompt bypass is prepared.

Existing Playwright engine successes do not close these named-browser gates: [Playwright documents](https://playwright.dev/docs/browsers) that its Firefox and WebKit use patches and do not operate stock Firefox or Safari. Bundled Chromium likewise does not prove the exact Chrome/Edge applications. Future receipts must name the real executable, version, fresh profile and actual observed result.

## Evidence

`20260929-prerequisites/prerequisites.json`, `downloads.json`, `extraction.json`, `verification.json`, `safari.json` and `executables.json` record the bounded preparation. Source metadata digests and the selected releases are retained. Ephemeral public GitHub CDN query signatures were omitted from the saved final redirect URL; the stable official release URL and matching content digest remain.

No browser, host or WebDriver server/session was started by this task. No product compatibility, FPS, long-session, rendering, audio, storage or gameplay acceptance is claimed by downloading these applications.
