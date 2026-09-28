# Public mission locations and original actor labels

All 31 authored mission presentations now contain explicit public location and
actor metadata. The authoring check validates **82 region markers**, **40 unique
per-mission objective/convoy region references**, **58 common original-actor
labels**, and **one Tutorial 5 faction-specific label**. These are reference and
content checks, not a claim of completed visual or interaction acceptance.

## Region markers

A marker is `{id, text, region, objective?}`. Its region must exist in the exact
mission map. The optional objective must be a public, non-failure objective;
the interface may hide the marker once that objective is complete. IDs are
unique and at most 128 characters; labels are at most 200 characters; each
presentation has at most 128 markers. The complete authored catalog uses only
fixed map regions, never an enemy actor's current position.

The review checked the briefing, objective, and convoy-route references across
all 31 missions. It added destinations, approaches, recovery areas, expansion
sites, owned defense areas, convoy branch/merge regions and the already-declared
hostile command-base areas. It does not publish future wave entrances or hidden
actor locations. SA04's fixed missile battery has no enclosing authored public
region; an original-actor label identifies that owned asset instead.

Tutorial 1 publishes the movement and order drill destinations. Tutorial 3
publishes the boarding, unload and infantry cover areas. Tutorial 4 publishes
the warning exercise and return-to-base regions. Existing mission map and Go
mission bytes were not altered by this presentation-only pass.

## Original actor groups

An actor group is `{origin, text}`, where `origin` is `initial:<index>` in the
**effective mission's zero-based Initial array**. The array is bounded to 256
records, labels to 120 characters, and origins must be unique. Duplicate Initial
entries sharing tag and type use the first matching index. Tags and type names
are authoring inputs; they are not emitted in group metadata.

The Go filtered view supplies `EntityPrivate.mission_origin` only for a current
owned original actor. The interface must match that value, rather than infer
identity from type, world position, displayed label, or entity creation order.
A newly produced replacement is not an original group member. Dead actors,
future reinforcements and enemy actors do not become selectable from metadata.
Known allied recovery teams gain their labels only after an ordinary recovery
changes ownership. Group labels confer neither vision nor command authority.

Tutorial 5 uses optional `actor_groups` on its existing `tutorial_factions`
entries. The client merges the common list with the list matching the local
player's authoritative faction, rejecting duplicate origins. The IR Survey
Drone uses `initial:33` in the effective IR definition; it must not appear for
US, SY, or SA. Effective variant order retains nonhuman Initial entries, then
appends the selected variant's human Initial entries, matching the Go content
selection contract.

Convoy Union's trucks belong to a script-controlled ally, and its second and
third convoys spawn later. They deliberately have no owned actor group. Shared
convoy route state and public route markers remain available; selecting those
allied trucks as if owned would be incorrect. The two human commanders' original
HQs have separate labels, and each player sees only their own group members.

## Reproducible checks and sources

Codex authored this metadata during the user's authorized quota takeover. The
original mission helper provenance remains separate. Reproducible commands:

```sh
node --test work/claude/05-authoring/presentation-actors.test.mjs
node work/claude/05-authoring/check-presentation.mjs
node work/claude/05-authoring/check-index.mjs
```

The actor tests cover canonical duplicate Initial entries, enemy/future/script
convoy rejection, duplicate and invalid origins, schema bounds, and effective
Tutorial 5 faction ordering. The presentation check requires every region used
by a public objective or convoy route to be published, validates all marker
references, and validates every common/faction actor group against its effective
mission. The index check independently confirms exact map/mission bytes and
hashes. Generator helpers are `lib/presentation-locations.mjs` and
`lib/presentation-actors.mjs` under `work/claude/05-authoring/`.

World and minimap rendering, focus behavior, group selection, camera clamping,
control ownership, screen-reader wording and keyboard operation are separate
product UI acceptance responsibilities. This document does not certify those
journeys or replace the native mission completion records.

## Authored coverage

| Mission | Public region markers | Common actor groups | Faction actor groups |
|---|---:|---:|---:|
| tutorial-1-give-an-order | 2 | 1 | 0 |
| tutorial-2-operate-a-base | 0 | 4 | 0 |
| tutorial-3-read-the-counter | 3 | 5 | 0 |
| tutorial-4-defend-the-sky | 2 | 4 | 0 |
| tutorial-5-command-a-match | 1 | 0 | 1 |
| us-01-first-foothold | 3 | 3 | 0 |
| us-02-open-corridor | 3 | 2 | 0 |
| us-03-relay-ridge | 2 | 1 | 0 |
| us-04-broken-umbrella | 2 | 5 | 0 |
| us-05-split-front | 3 | 1 | 0 |
| us-06-clear-horizon | 4 | 0 | 0 |
| ir-01-forward-signal | 1 | 1 | 0 |
| ir-02-eyes-above | 1 | 3 | 0 |
| ir-03-beyond-the-basin | 2 | 0 | 0 |
| ir-04-hold-the-network | 3 | 5 | 0 |
| ir-05-the-second-volley | 3 | 1 | 0 |
| ir-06-iron-signal | 4 | 2 | 0 |
| sy-01-workshop-foothold | 3 | 3 | 0 |
| sy-02-supply-trail | 3 | 1 | 0 |
| sy-03-three-crossings | 3 | 1 | 0 |
| sy-04-open-doors | 2 | 4 | 0 |
| sy-05-relay-break | 3 | 0 | 0 |
| sy-06-open-road | 2 | 0 | 0 |
| sa-01-arrival-point | 1 | 1 | 0 |
| sa-02-moving-shield | 3 | 1 | 0 |
| sa-03-distant-depots | 2 | 0 | 0 |
| sa-04-intercept-window | 2 | 4 | 0 |
| sa-05-three-positions | 3 | 1 | 0 |
| sa-06-shieldline | 4 | 0 | 0 |
| convoy-union | 7 | 2 | 0 |
| twin-outposts | 5 | 2 | 0 |
