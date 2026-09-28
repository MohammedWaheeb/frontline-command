# Painted menu and command-console acceptance

The flow under test is: main menu → ordinary solo deployment → paid production → status/options → saved game and archived replay → LAN landing controls.

Claude Opus 5.5 authored the console and responsive image integration in checkpoint `92045f5`. Codex generated the original third painting under the authorized quota fallback from Claude’s concrete composition brief. Original PNG metadata and provenance are retained. The exact source/runtime/build receipt is `product-preview/build.json`; the frozen gameplay art is incomplete. This is bounded UI acceptance, not release or full-match certification.

## Actual product checks

`browser-2026-09-28T20-43-07.451Z/browser.json` passes menu and keyboard Skirmish navigation at 1600×900, 1280×720, 1440×900 and 1728×1117. At 1280×720 / 150%, the navigation scrolls and Help remains reachable by keyboard. A deliberately missing image produces the old canvas fallback; an absent optional index field produces the same fallback without an image request. The sole expected 404 is isolated from the successful-image course.

`console-2026-09-28T20-47-55.158Z/browser.json` passes actual Go solo production (6000 → 5200 credits and an active Engineering rig job), HQ status, scaled options, save and replay archive, read-only replay transport/command log, and LAN landing controls. Unexpected page, console and HTTP errors are zero. The LAN page test does not claim a LAN match.

Browser plugin not available; existing Playwright Chromium was used against an ephemeral local real Go host. Root inspected native menu captures at all four sizes and 150%, plus paid queue, enlarged battle, HQ status, options, replay and LAN captures. Labels and controls remain readable; the canvas fallback is usable. The original tank’s cannon, hull and tracks remain visible. Far-right supporting vehicles are intentionally secondary and partly cropped by responsive framing. This is a retained minor composition limitation, not an assertion that every source detail stays visible at every aspect ratio.

## Packaging

The optional `ui/keyart/main_menu.png` is advertised only when present and included byte-exact in the offline base pack. Eight focused packaging tests pass, including both presence and absence. The native PNG is 1672×941 with SHA-256 `5c8de06562f53672c7dd5b8c0490861e85a7aacab1e2e010c5bc3486974fee3f`.

The development art copy is accepted for the menu. Full manifest finalization and final complete-art product acceptance remain withheld. The painterly olive/brass/charcoal direction follows the original RTS reference study; no blue UI chrome was introduced.
