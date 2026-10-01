# Audio runtime and production contract

The browser plays bundled files; speech generation and synthesis are build-time
tools only. Audio never changes Go state. Presentation consumes the same permitted
player snapshots as the renderer, with no hidden-world query. The initial audio
production pass requires listening review before being called final.

## Asset index

`assets/build/audio/index.json` is served as `/art/audio/index.json` and included
in the exact-byte offline pack. Format:

```json
{
  "format": 1,
  "sample_rate": 24000,
  "entries": {
    "vo.unit.US.infantry.select": {
      "bus": "voice", "priority": 10, "cooldown_ms": 2500,
      "variants": [{"url": "/art/audio/vo/units/US/infantry/select_1.ogg", "caption": "Ranger team ready.", "duration": 1.8, "bytes": 12000, "sha256": "..."}]
    },
    "music.battle_US_calm": {
      "bus": "music", "loop": true, "bpm": 112, "beats_per_bar": 4,
      "variants": [{"url": "/art/audio/music/battle_US_calm.ogg", "duration": 68.571, "bytes": 200000, "sha256": "..."}]
    }
  }
}
```

All URLs begin `/art/audio/`. Every variant records actual duration and exact-byte
integrity. Voice captions are the verbatim script, not a generated summary.
`bus` is `voice`, `music`, `effects` or `ui`; ambient sound uses `effects`.
`loop` defaults false. `priority` is 100 for critical alerts, 50 for routine
announcer events, 10 for unit responses; missing priority means 0.
Announcers have a 6000 ms bundle window per event/location; selection has 2500 ms
cooldown. A critical warning interrupts routine speech; captions must still be
visible when muted and must never wait for sound decoding.

IDs follow the exhaustive asset manifest:

- `vo.unit.{US|IR|SY|SA}.{infantry|vehicle_crew|pilot|drone_operator}.{select|move|attack|stop|unavailable|under_fire|repair|ability_ready|retreat}`.
  US/SA have pilots; IR/SY have drone operators. Three variants per event.
- `vo.announcer.{faction}.{event}`: all 30 events in the manifest.
- `vo.briefing.{mission-id}` and `vo.debrief.{mission-id}`: authored mission prose;
  `vo.warning.{mission-id}.{trigger-id}.{action-index}`: authored warning actions.
  Tutorial faction variants use `vo.briefing.{mission-id}.{faction}` and
  `vo.warning.{mission-id}.{faction}.{trigger-id}.{action-index}`; prefer these
  for the selected tutorial faction so US-specific instructions never play
  over a different faction's scenario.
- `sfx.weapon.{weapon-id}`: three variants for each of 28 weapon IDs.
- `sfx.{event}`: the 40 manifest effects, UI and ambience entries.
- `music.{name}`: six menu/briefing/editor beds, five stingers, and three battle
  layers for each faction. A faction's layers share tempo, duration and bar origin.

## Playback requirements

Create/resume an AudioContext only after a trusted user interaction and explicit
saved consent. Independent master/music/effects/voice/UI settings apply immediately.
Consent withdrawal stops playback. Focus loss suspends output; resume requires a
valid browser interaction if autoplay policy rejects resumption. Announcer captions
and tactical warning markers remain effective at zero volume.

Bound decoded-buffer memory and concurrent voices. Stream long music or evict it
between operations. Release sources, listeners, pending loads and decoded data
when an operation ends; generation guards prevent late loads playing in a new game.
No repeated attack chatter for the same area within six seconds, no old warning
burst after reconnect/replay seek, and no audio from events outside permitted view.
Selection response only for owned units. Acknowledgment of successful orders uses
the authoritative receipt, not an optimistic click. Failure uses unavailable/error.

Actual browser validation must cover consent denied/enabled, independent buses,
critical warning priority, captions while muted, event deduplication, focus loss,
seek/reconnect, offline output and consecutive-operation cleanup. Signal validation
checks file decoding, duration, finite samples, headroom, silence and loop boundaries;
these checks do not replace listening review.

## Runtime mix

One-shot combat and destruction cues carry distance attenuation and stereo pan
from the sounding entity's screen rect (`oneShotMix`, mirroring the mover
loop math with one-shot levels). Normalized screen distance `d` (0 center,
~1 edge, ~1.4 corner) gives `gain = clamp(1 - 0.45d, 0.3, 1)` and
`pan = clamp(x, -0.8, 0.8)`; off-screen or unprojectable entities stay audible
at 0.3 center, and cues without a viewport play unchanged. Cost is O(1) per
cue: one bounds lookup plus arithmetic, no per-frame work.

Voice with priority 50 or above (routine announcer and critical warnings)
ducks music to 35% and continuous beds to 40% while it sounds. Attack uses a
0.15 s ramp, the hold lasts clip duration plus 1.2 s and overlapping lines
extend it, and release is a smooth 0.6 s ramp during which the 150 ms
continuous refresh leaves gains alone. Ducking clears on transient stop,
reset, consent withdrawal, blur and disposal. Routine unit responses
(priority 10) never duck.

Destruction routing prefers SFX-lane cascade IDs when the loaded index has
them, else falls back:

| Victim | Sound |
|---|---|
| Building, cascade ID present (`sfx.explosion_cascade`, `sfx.building_collapse`, `sfx.destruction_cascade`) | first present cascade ID |
| Building, no cascade ID (current index) | `sfx.explosion_building` |
| Large unit kill: heavy armor, airframes, tanks, artillery, launchers | `sfx.explosion_large` |
| Other unit kills and unknown victims | `sfx.explosion_small` |

`sfx.weapon.IR_SHAHED` is referenced by the terminal-impact trigger but its
clip is still pending from the SFX lane (absent from the 620-ID index). Until
it ships, missing impact IDs resolve to `sfx.explosion_small` and missing
weapon-fire IDs stay silent; once the clip lands in the index the authored ID
plays with no runtime change.

The 24-source cap stays fair under chatter: a full cap evicts the oldest
lowest-priority voice, including equal-priority pile-up, while music and
continuous beds are never steal victims. Committed coverage is
`client/tests/runtime/audio-mix.test.ts` (attenuation geometry, destruction
routing, IR_SHAHED fallback, cap fairness, duck onset/release).

## Provenance

Dialogue and scores are original repository sources. Build-time synthetic speech
uses stock Kokoro voices, with no cloning or impersonation. Upstream model and
inference code are Apache 2.0; their notices are preserved in the audio source
directory. We ship rendered clips, not model weights or an online dependency.

Sources checked: [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M),
[voice inventory](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md),
[inference source and license](https://github.com/hexgrad/kokoro).

## Current measured output

The complete first pass exports **892 clips across 620 runtime event IDs**:
745 spoken lines/variants, 124 effects and 23 music arrangements. Both Ogg Vorbis
and MP3 alternatives are present. The full post-wording-change signal check
passes with zero missing clips or integrity/decoding/timing/headroom/loop errors;
its report is `work/evidence/audio/signal-results.json`. Scripts, editable original
synthesis code, float WAV masters, stock voice provenance and licence notices are
preserved. The output is still marked `sample`; listening review remains pending.

Chromium, Firefox and WebKit actual Web Audio checks cover consent, bus controls,
critical speech interruption, silent captions, phase-aligned battle layers,
decoded-buffer/source limits and cleanup. Actual product checks use a real Go
skirmish, owned rig selection, an accepted stop receipt and moving-rig engine
sound. Pausing the simulation stops the ambient and engine requests. Evidence is
under `work/evidence/audio-runtime/`; cold production-pack audio evidence is
recorded separately when that run completes.

The mixer caps decoded buffers at 64 MiB, active sources at 24 and parallel
decodes at four. Persistent battlefield sound has one quiet map bed and at most
three currently authorized on-screen moving/airborne actors. It is cleared on
pause, stale snapshots, fog loss, removal, focus loss and disposal. Jet passes
use a bounded per-actor cadence. Impact material uses only a Go-authorized target
identity; visible explosions never identify hidden or concealed victims. Aircraft
endurance-loss speech uses the owner-only Go cause event, with no duplicate
generic loss line. Enemy strategic-ready speech follows public progress changes
and does not replay a warning on initial snapshots or seeking.
