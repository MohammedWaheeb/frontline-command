# Local reports, private history and operator review

The local Go host records reports and provides a loopback-only operator review
API. It does not contact an external moderation service, deploy anything, send
notifications, automatically punish players, or alter match ratings. The browser
runtime exposes `LocalAPI.reportMatch`, `reports` and `history`. The command center
now provides an operator review screen with a memory-only credential, incident
evidence download and append-only decisions. See [map and operator UI evidence](map-workshop-ui.md)
for the verified product workflow; map publication uses the same operator boundary.

## Participant reports

A signed-in participant may POST `/api/v1/reports` with exactly
`{"match_id":"…","tick":120,"reason":"Plain-text event context"}`. The match must
have a persisted authenticated membership record for that profile. Its tick must
be at or before the current authoritative tick or final committed result. The
request cannot choose a reporter identity. An unavailable actor or legacy slot
requires a saved result before submitting a time reference.

The reason contains 3–2000 UTF-8 bytes of plain text. Markup, control characters,
unknown JSON fields, multiple documents, negative ticks and bodies over 8 KiB are
rejected. No screenshot, address book, private account token or browser storage
is uploaded. The record contains reporter profile ID, match ID, simulation tick,
reason and local creation time. Reviewers may retrieve the report's completed
replay as evidence; live state and void-match diagnostic saves are not exposed.

Limits are five distinct reports per match, ten per rolling hour and fifty per
rolling day for each profile. The match limit is permanent. Repeating an identical
report returns the original record and consumes no additional quota. A separate
30 POSTs/minute/IP admission limit also applies, including rejected requests.
Clients must not automatically retry a quota error or an uncertain write.

GET `/api/v1/reports?status=pending&limit=50` returns only the caller's reports.
`status` accepts `all`, `pending` or `reviewed`; `limit` is 1–100. To continue, pass
`before` equal to `next_cursor`. A cursor belonging to another reporter is rejected.
The caller sees the latest decision and revision, but no internal operator notes
or other reporter identities. `needs_context` is a reviewed decision; it does not
send a message or open a direct conversation.

## Operator credential and procedure

Every host creates `moderator.token` in its configured data directory with mode
0600. This credential is distinct from every game profile and never appears in
HTTP responses, game saves or logs. Startup rejects a symlink, an invalid token or
a file readable by other users. Keep the data directory private.

Admin routes require both that credential and an actual loopback TCP peer. The
host checks `RemoteAddr`, including IPv6 loopback, and ignores `Forwarded` and
`X-Forwarded-For`. A LAN profile, even the lobby host, has no operator privileges.
Do not expose these routes through a reverse proxy; a local proxy would itself
be the trusted loopback peer.

Run the following on the host computer, replacing the directory and port with
the launch configuration. The example stores a temporary private curl header
file so the bearer credential is not placed in curl's process arguments. Do not
use shell tracing, print the credential, paste it into game chat, or persist it
in browser profile storage.

```sh
DATA_DIR="/absolute/path/to/frontline-data"
HOST_URL="http://127.0.0.1:8080"
HEADER_FILE="$(mktemp)"
chmod 600 "$HEADER_FILE"
trap 'rm -f "$HEADER_FILE"' EXIT
printf 'Authorization: Bearer %s\n' "$(cat "$DATA_DIR/moderator.token")" > "$HEADER_FILE"

curl --fail --silent --show-error --header "@$HEADER_FILE" \
  "$HOST_URL/api/v1/admin/reports?status=pending&limit=50"
```

Choose a report ID from the response and inspect its context and review history:

```sh
REPORT_ID="report-id-from-the-list"
curl --fail --silent --show-error --header "@$HEADER_FILE" \
  "$HOST_URL/api/v1/admin/reports/$REPORT_ID"
curl --fail --silent --show-error --header "@$HEADER_FILE" \
  "$HOST_URL/api/v1/admin/reports/$REPORT_ID/replay" \
  --output "report-evidence.replay"
```

The replay request returns 404 until a nonvoid result and replay are both saved.
Review the event at the recorded tick in the replay viewer. Then put a concrete
review into a local JSON file and submit it. Use the latest report `revision` as
`expected_revision`, initially zero:

```sh
cat > review.json <<'JSON'
{"decision":"needs_context","note":"Describe the evidence reviewed and the reason for this decision.","expected_revision":0}
JSON
curl --fail --silent --show-error --header "@$HEADER_FILE" \
  --header 'Content-Type: application/json' --data-binary @review.json \
  "$HOST_URL/api/v1/admin/reports/$REPORT_ID/reviews"
```

Allowed decisions are `confirmed`, `dismissed` and `needs_context`. Notes are
required plain text, at most 1000 UTF-8 bytes. The API accepts at most 4 KiB per
review, 10000 revisions per report, and 120 admin requests/minute/IP. Each review
appends an immutable revision. A concurrent or stale update gets HTTP 409;
reload the report and make an explicit new decision rather than retrying blindly.
The detail response includes the latest 100 reviews; pass `before_revision` equal
to the oldest returned revision to page backward. An operator can correct a
prior decision by appending a new revision, without rewriting its history.

To rotate a credential, stop the host, remove only `moderator.token`, and restart.
The host creates a fresh credential; the database, reports and reviews remain.
There is no remote credential reset endpoint.

## History, replay authorization and migration

GET `/api/v1/history` returns at most 50 committed results owned by the signed-in
participant, including that player's void results. Result `payload` retains the
existing base64-encoded JSON wire format. It does not list other matches on the
same machine. Saves and settings remain scoped to their owning profile.

The initial match checkpoint, authenticated human membership and declared replay
policy commit in one SQLite transaction. A completed private match replay is
available only to its participants, with the separate report-linked operator
exception described above. A newly started explicitly public lobby permits its
completed replay to other signed-in local profiles. An unfinished or void match
never exposes a full replay through either download route. Live observers still
use the existing authorized, fog-filtered delayed stream and cannot bypass it
with a replay download. Access survives actor cleanup and host restart.

Database schema 6 adds membership and append-only review tables. The upgrade
backfills only trusted profile IDs from committed rating events, treating those
old matches as private. Old unranked payloads contain simulation player IDs, not
reliable authenticated account identities; those records remain inaccessible
through ordinary history/replay routes rather than guessing ownership. Existing
reports and the older unused moderation table are preserved. Newer unknown
schema versions are refused without being rewritten.

Chat writes now recheck membership, team and match identity after reading the
request and validating actor chat permission. The message and team-recipient
snapshot are committed while the lobby membership is locked. A kick, team change
or match start during that request rejects it with `chat_membership_changed`, so
an old team selection cannot accidentally send a plan to former allies.

## Verification evidence

On 2026-09-28, `go test -race ./internal/storage ./internal/server -count=1`
passed (storage 2.077 seconds; server 29.687 seconds). `go vet` passed for both
packages. Client TypeScript checking and all 107 runtime tests passed.

New tests exercise atomic journal/access rollback, atomic failed and successful
result commits, trusted-only migration, concurrent report quotas, duplicate
submission idempotence, hourly/daily caps, paginated owner isolation, append-only
review CAS, private/public/void replay policy after restart, participant-only
history, active/final report time references, malformed JSON and body bounds,
separate profile/operator credentials, IPv4/IPv6 loopback admission, denied LAN
and forged forwarding headers, token-file permissions, cross-account saves and
settings, and deterministic membership changes during chat body reads. These
are service and runtime checks, not a claim of complete game or human UI testing.
