package server

import (
 "bytes"
 "encoding/json"
 "log"
 "strings"
 "sync"
 "testing"
 "time"
 "context"
 "frontlinecommand/pkg/sim"
)

type adviceLogCapture struct { mu sync.Mutex; data bytes.Buffer }
func (b *adviceLogCapture) Write(data []byte)(int,error){b.mu.Lock();defer b.mu.Unlock();return b.data.Write(data)}
func (b *adviceLogCapture) records(t *testing.T) []map[string]any {
 t.Helper();b.mu.Lock();raw:=b.data.String();b.mu.Unlock()
 records:=[]map[string]any{}
 for _,line:=range strings.Split(raw,"\n") {
  _,data,ok:=strings.Cut(line,"ADVICE_TRACE ");if !ok {continue}
  var record map[string]any
  if err:=json.Unmarshal([]byte(data),&record);err!=nil{t.Fatal(err,line)}
  records=append(records,record)
 }
 return records
}

func TestAdviceLocalTracePreservesResponseStateAndPrivacy(t *testing.T) {
 t.Setenv("FRONTLINE_ADVICE_TRACE","")
 capture:=&adviceLogCapture{}
 previous:=log.Writer();log.SetOutput(capture);defer log.SetOutput(previous)
 s,h:=testServer(t);m:=adviceMatch(t,s)
 path:="/api/v1/matches/"+m.id+"/advice"
 before:=m.call(context.Background(),matchRequest{kind:"save"})
 body:=adviceRequest{Entities:[]sim.ID{2},Orders:[]sim.Order{{Kind:"build",Entities:[]sim.ID{2},Type:"power",Position:sim.Vec{X:13000,Y:13000}}}}
 original:=request(t,h,"POST",path,"slot-one",body,200)
 if len(capture.records(t))!=0 {t.Fatal("diagnostics enabled by default")}
 t.Setenv("FRONTLINE_ADVICE_TRACE","1")
 instrumented:=request(t,h,"POST",path,"slot-one",body,200)
 a,_:=json.Marshal(original);b,_:=json.Marshal(instrumented)
 if !bytes.Equal(a,b) {t.Fatal("diagnostics changed public response",string(a),string(b))}
 after:=m.call(context.Background(),matchRequest{kind:"save"})
 if before.err!=nil||after.err!=nil||!bytes.Equal(before.data,after.data){t.Fatal("diagnostics mutated hosted state")}
 rows:=capture.records(t);if len(rows)!=1 {t.Fatal("expected exactly one record",len(rows))}
 row:=rows[0]
 if row["status"]!=float64(200)||row["player"]!=float64(1)||row["orders"]!=float64(1)||row["entities"]!=float64(1)||row["capture_tick"]!=float64(100)||row["saved_advice_bytes"].(float64)<=0 {t.Fatal("bad exact request metadata",row)}
 last:=float64(0)
 for _,key:=range []string{"enqueue_attempt_ns","actor_dequeue_ns","affordances_done_ns","capture_done_ns","handler_reply_received_ns","preview_done_ns","elapsed_ns"} {
  value,ok:=row[key].(float64);if !ok||value<last {t.Fatal("missing/nonmonotonic phase",key,row)};last=value
 }
 if len(row["normalized_public_body_sha256"].(string))!=64 {t.Fatal("request body identity missing",row)}
 raw,_:=json.Marshal(row)
 for _,forbidden:=range []string{"slot-one","Authorization","Bearer","profile","rng","explored","position","map","credits"} {if bytes.Contains(raw,[]byte(forbidden)){t.Fatal("unsafe trace field",forbidden,string(raw))}}
 request(t,h,"POST",path,"slot-two",adviceRequest{Entities:[]sim.ID{2}},400)
 rows=capture.records(t);if len(rows)!=2||rows[1]["status"]!=float64(400)||rows[1]["capture_done_ns"]!=nil||rows[1]["preview_done_ns"]!=nil {t.Fatal("rejected request fabricated phases",rows)}
}

func TestAdviceLocalTraceMissingPhasesRemainNull(t *testing.T) {
 t.Setenv("FRONTLINE_ADVICE_TRACE","1")
 capture:=&adviceLogCapture{};previous:=log.Writer();log.SetOutput(capture);defer log.SetOutput(previous)
 trace:=newAdviceTrace(time.Now(),adviceRequest{},1)
 trace.report(503,true)
 rows:=capture.records(t);if len(rows)!=1{t.Fatal(rows)}
 for _,key:=range []string{"enqueue_attempt_ns","actor_dequeue_ns","affordances_done_ns","capture_done_ns","handler_reply_received_ns","preview_done_ns","capture_tick","pending_requests_at_actor_dequeue","saved_advice_bytes"}{if rows[0][key]!=nil{t.Fatal("unobserved phase not null",key,rows[0])}}
}
