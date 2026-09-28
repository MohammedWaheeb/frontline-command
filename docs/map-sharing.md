# Local map publication and review

Uploads are private by default. Editing an uploaded map creates a new private
content revision; publishing requires a separate explicit author action. The
authenticated owner's name is stored alongside the map's original author text.
User maps remain unranked regardless of their content or publication status.
These services run on the local Go host and do not publish to an internet service.

## Author and player API

- `POST /api/v1/maps {map,expected_revision}` validates and saves the map.
- `GET /api/v1/maps/mine` requires a profile and returns only its uploads.
- `PATCH /api/v1/maps/{id}/publication {published,expected_revision}` changes
  sharing with revision compare-and-swap. A removed map cannot be published.
- `GET /api/v1/maps` lists installed maps and published, nonremoved uploads.
- `GET /api/v1/maps/{id}` reads installed/public content, or an author's own
  draft/removed upload. Other private reads return 404.

Map metadata includes `id`, `owner`, `owner_name`, `title`, `revision`,
`content_revision`, `published` and `removed`. Content revision identifies the
immutable uploaded bytes; the general revision also changes with publication
and moderation. Upload flags cannot forge owner identity or removal status.
Storage limits are 128 maps and 256 MiB of retained map versions per profile.
Map bodies retain the existing 16 MiB bound and Go structural validation.

An unpublished map can be hosted by its owner in a private custom lobby. Once
admitted, players fetch its original context with
`GET /maps/{id}?lobby_id={lobby}`. Active participants and already admitted
observers may instead use `?match_id={match}`. Every response includes the
normalized `X-Frontline-Map-Hash`. A known lobby/match ID alone grants no access.

An active match retains its exact original blueprint after author edits,
unpublication or moderator removal. It never exposes globally changed live
terrain. A forming lobby detects changed map content at start, updates its
declared version/hash and resets all readiness; players must load and approve
the new configuration. Removal blocks new launches. Context access ends when
the corresponding in-memory lobby/match is no longer available; completed
replays retain their own original map under the existing replay access policy.

## Reports and local operator review

An authenticated profile can report a currently published map using
`POST /maps/{id}/reports {reason}`. The 3–2000-byte plain-text reason refers to
the exact retained content revision. Identical submissions return the original
receipt. Limits are five reports per map, ten per hour and fifty per day per
profile, plus the host's 30 POST/minute/IP report admission limit.

`GET /map-reports` returns only the caller's reports and latest decisions,
without reporter identities or internal operator notes. It accepts the same
`status`, `limit` and `before` pagination as match reports. Foreign cursors are
rejected. Existing reports keep their original evidence after content changes.

The existing separate loopback-only operator credential protects:

- `GET /admin/map-reports` for the paginated queue.
- `GET /admin/map-reports/{id}` for `{report,current_map,reported_map,
  current_map_data,reviews}`. `before_revision` pages earlier review history.
- `POST /admin/map-reports/{id}/reviews` with `decision`, `note`,
  `expected_revision` and `expected_map_revision`.

Decisions are `removed`, `restored`, `dismissed` or `needs_context`. Removal and
restoration require both current report and map revisions. The map policy,
revision ledger and append-only review commit in one transaction. Failure rolls
everything back. Restoring clears removal but leaves the map private for its
author to publish explicitly. Authors can repair removed content but cannot
clear its moderation flag themselves. No review sends messages or contacts an
external service. Credential procedure is in [local moderation](local-moderation.md).

Database schema 7 adds publication metadata, immutable map versions, reports and
review history. Legacy uploads preserve their bytes/revisions and migrate to
private. Schema 8 or newer is refused unchanged. The existing revision ledger
continues to prevent stale updates after deletion/recreation.

## Observed verification

The full storage and server race suites passed after this implementation:
2.415 seconds and 40.110 seconds respectively. `go vet ./...` passed.
New tests cover concurrent publication CAS, private reads/listing, authenticated
attribution, reporter/cursor isolation, quotas/duplicate receipts, immutable
reported bytes, blocked author removal bypass, stale review rejection,
transaction rollback, IPv4 LAN/operator denial, active original-map retention
for players and granted observers, unrelated context denial and forming-lobby
readiness invalidation. Older LAN tests now explicitly publish their upload
before creating a public lobby. A fresh three-profile Chromium 151 product journey also passed private hosting,
active edits followed by original-map reconnect/observer access, editor handoff,
report isolation, operator removal/restoration and explicit author republishing.
It recorded no page errors or overflow at 800 pixels. See
[product workflow and evidence](map-workshop-ui.md).
