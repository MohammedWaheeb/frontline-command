package server

// Environment-local advice timing diagnostics, disabled by default.
// Tracing records server phases; controls never establish player acceptance.
// Enable FRONTLINE_ADVICE_TRACE=1 only on an explicitly owned local host.
import (
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "log"
 "net/http"
 "os"
 "sync/atomic"
 "time"
)

var adviceTraceSequence atomic.Uint64

type adviceTrace struct {
 start time.Time
 requestID uint64
 player uint32
 entities, orders int
 independent bool
 normalizedBodySHA256 string
 enqueueAttempt, actorDequeue, affordancesDone, captureDone, replyReceived, previewDone atomic.Int64
 captureTick, pendingAtDequeue, savedBytes atomic.Int64
}

func newAdviceTrace(start time.Time, body adviceRequest, player uint32) *adviceTrace {
 if os.Getenv("FRONTLINE_ADVICE_TRACE") != "1" { return nil }
 // Hash only the normalized public request body. Never inspect/log headers,
 // bearer tokens, profiles, save contents or an actor's hidden state.
 data, _ := json.Marshal(body)
 digest := sha256.Sum256(data)
 return &adviceTrace{start:start,requestID:adviceTraceSequence.Add(1),player:player,entities:len(body.Entities),orders:len(body.Orders),independent:body.Independent,normalizedBodySHA256:hex.EncodeToString(digest[:])}
}
func (t *adviceTrace) stamp(field *atomic.Int64) { field.Store(time.Since(t.start).Nanoseconds()+1) }
func (t *adviceTrace) actor(tick uint32, pending int) {
 t.captureTick.Store(int64(tick)+1)
 t.pendingAtDequeue.Store(int64(pending)+1)
 t.stamp(&t.actorDequeue)
}
func observed(value int64, bias bool) any {
 if value == 0 { return nil }
 if bias { return value-1 }
 return value
}
func (t *adviceTrace) report(status int, requestCanceled bool) {
 record := map[string]any{
  "schema":"frontline-advice-local-diagnostic-v1","request_id":t.requestID,
  "started_utc":t.start.UTC().Format(time.RFC3339Nano),"player":t.player,
  "entities":t.entities,"orders":t.orders,"independent":t.independent,
  "normalized_public_body_sha256":t.normalizedBodySHA256,"status":status,
  "request_context_canceled_at_return":requestCanceled,
  "elapsed_ns":time.Since(t.start).Nanoseconds(),
  "enqueue_attempt_ns":observed(t.enqueueAttempt.Load(),true),
  "actor_dequeue_ns":observed(t.actorDequeue.Load(),true),
  "affordances_done_ns":observed(t.affordancesDone.Load(),true),
  "capture_done_ns":observed(t.captureDone.Load(),true),
  "handler_reply_received_ns":observed(t.replyReceived.Load(),true),
  "preview_done_ns":observed(t.previewDone.Load(),true),
  "capture_tick":observed(t.captureTick.Load(),true),
  "pending_requests_at_actor_dequeue":observed(t.pendingAtDequeue.Load(),true),
  "saved_advice_bytes":observed(t.savedBytes.Load(),true),
 }
 data, _ := json.Marshal(record)
 log.Printf("ADVICE_TRACE %s",data)
}

type adviceTraceWriter struct { http.ResponseWriter; status int }
func (w *adviceTraceWriter) WriteHeader(code int) { if w.status==0 {w.status=code};w.ResponseWriter.WriteHeader(code) }
func (w *adviceTraceWriter) Write(data []byte)(int,error) { if w.status==0 {w.status=http.StatusOK};return w.ResponseWriter.Write(data) }
