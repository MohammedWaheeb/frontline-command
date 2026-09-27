# Future hosted deployment — planning only

No cloud resources, accounts, infrastructure or deployments have been created.
The complete local game remains the current deliverable. This plan follows the
approved Bahrain/Frankfurt architecture and must be revalidated before any later
public launch. AWS documentation checked 2026-09-27; prices and regional service
availability must be checked again when measured capacity is available.

## Service boundaries

| Component | Proposed managed home | Durable authority |
|---|---|---|
| Browser shell and immutable versioned packs | Object storage and CDN | Release manifest and hashes |
| Go account/content/social/lobby API | Regional ECS service | PostgreSQL transactions |
| WebSocket gateway | Regional ECS service behind TLS ingress | Authenticated match assignment |
| Go match worker | ECS service with bounded matches per task | One owner for each live simulation |
| Profiles, ratings, progression, reports, ownership | Managed PostgreSQL | Database constraints and idempotency keys |
| Queue, presence, routing leases | Regional managed Redis-compatible service | Short-lived coordination only |
| Replays, checkpoint journals, custom-map versions | Private object storage | Checksummed immutable objects plus DB metadata |
| Metrics, logs, secrets | Managed observability and secret stores | Access-scoped audit records |

Use Bahrain for Middle East sessions and Frankfurt for Europe. Measure player
latency to each region before queue admission; a player's submitted latency is
not an authority for ranked policy. A match stays in its selected region and
worker for its lifetime. Do not attempt to migrate a live 20 Hz simulation
between regions as part of this initial hosting plan.

Keep one fenced write authority for durable account/rating changes. Initially a
primary PostgreSQL service can own these records with regional APIs reaching it;
measure that cross-region service latency separately from match ticks. Introduce
regional data ownership only with explicit routing/failover semantics. Do not
make regional read replicas independent rating writers.

## Changes required from the local implementation

The current local server is not a production cloud backend. Replace local
profile-token creation with public account authentication, verification,
revocation, recovery and abuse controls. Retain guest solo without login.
Production configuration must disable local identity bootstrap. Match tokens
must be scoped, short-lived at admission, and independently renewable for the
specified reconnect window.

Extract repository/object-store interfaces from the existing SQLite/file
implementation. Implement PostgreSQL dialect/migrations and transactional
revision allocation; never share a SQLite file between tasks. Preserve CAS
conflict behavior, monotonic revisions, immutable object hashes, unique match
results and idempotent rewards/ratings. Retain export access to incompatible
older saves and replays. Public moderation needs authenticated roles, audit
trails, report triage, map removal and appeals handling before public sharing.

The gateway resolves `match_id → region, worker, lease generation`. Every
reconnect reauthenticates and requests the player's permitted snapshot from that
same owner. Gateway caches never become simulation authority. Fencing prevents
two workers from committing one match if a lease becomes stale. Delayed
observers use a separate authorized stream with no active-player chat path.
Never publish raw state, private queues, sound sources or hidden events.

## Scaling and draining

Scale admission using measured active-match capacity, tick duration, queue age,
memory, snapshot work and event-loop/worker backlog. CPU alone is insufficient.
Stop admitting new matches to a draining worker, keep its gateway routes alive,
and let existing matches reach a committed result before termination.

ECS supports task protection against service scale-in and deployments. The
worker should renew protection while it owns active matches and clear it after
draining. This protects against planned scaling, not arbitrary host loss; retain
crash recovery and void-result handling. Protection expiry and deployment
timeouts need alarms so a stuck task cannot block operations indefinitely.
[AWS ECS task scale-in protection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-scale-in-protection.html)

Roll out additive database migrations first, then compatible APIs/gateways and
new worker pools. New matches receive the new simulation/content tuple; active
matches retain their original executable and immutable pack references. Route
new admissions back to the previous pool on regression. A rollback must not
rewrite active match state into an older schema. Leave old packs/replay readers
available according to the published support policy.

## Capacity and cost gate

The target is 1,000 concurrent players, including 500 simultaneous 1v1 matches.
Current Apple M4 native measurements are development evidence, not AWS sizing.
Benchmark the chosen cloud CPU architecture, container size and network before
choosing matches per worker. Measure average CPU as well as p95/p99 tick latency,
encoded bytes per permitted view, heap growth, GC, replay compression and writes.

For an initial CPU estimate only:

`vCPU demand = matches × 20 ticks/s × mean CPU ms/tick ÷ 1000 ÷ target utilization`

Add separately measured gateway/API/serialization capacity and failover headroom.
Use the worst legal four-player scenario, maximum aircraft returns, movement
bursts, missiles/interception, observers and long sessions. Gate at p95 <25 ms,
p99 <40 ms and no dropped authoritative ticks. Test 500 1v1 matches and a mixed
1v1/2v2 distribution, not just 500 idle sockets. Include simultaneous reconnects,
regional demand imbalance, dependency slowdown and one availability-zone loss.

Cost estimates must itemize worker/gateway/API CPU and memory, PostgreSQL
high availability/backups, regional cache, load-balancer connections/data,
object operations/storage, CDN egress, logs and spare capacity. Fargate pricing
depends on allocated CPU, memory, platform/architecture and duration; obtain
current Bahrain and Frankfurt quotes after density measurements. No monthly
price is asserted from unmeasured match density.
[AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)

## Recovery and operations

Set recovery objectives before public launch. Proposed starting targets are
15-minute durable-service RPO and 60-minute service RTO, subject to measured
restore drills. Match journals have a separate policy: recover only with proven
command/checkpoint consistency; otherwise mark the interrupted match void and
never invent a ranked result. Account and rating recovery must reconcile
idempotent result commits against archived replay/checkpoint records.

Enable database automated backups, test point-in-time recovery into a new
instance, and retain manual snapshots around migrations. RDS point-in-time
restore creates a new instance, so the drill must include validation and an
explicit service cutover. Store backups separately from live credentials and
test recovery permissions as well as successful backup creation.
[AWS RDS backup and restore](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html)

Monitor tick and API latency, queue waits, reconnect success, frame backlog,
storage/CAS failures, committed/void results, backup age, cache hit rates,
auth/abuse rejection and worker protection age. Alerts need an assigned response
and runbook. Logs identify match/tick/error references without bearer tokens,
chat contents by default, raw saves or unnecessary player information.

Later deployment requires explicit authorization, reviewed infrastructure,
public authentication/moderation readiness, successful load/security/restore
tests, measured cost estimates and a tested rollback. None of these gates is a
dependency for finishing local play.
