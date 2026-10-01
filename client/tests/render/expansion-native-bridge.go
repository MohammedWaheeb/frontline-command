// Copied only into an isolated test module beside the exact frozen Session.
// No private state, spawning, resource editing or alternate simulation API.
package main

import (
 "bufio"
 "encoding/json"
 "fmt"
 "os"
 "frontlinecommand/pkg/sim"
 pb "frontlinecommand/protocol"
 "google.golang.org/protobuf/encoding/protojson"
 "google.golang.org/protobuf/proto"
)

type request struct { ID int `json:"id"`; Op string `json:"op"`; Player sim.PlayerID `json:"player"`; Config json.RawMessage `json:"config"`; Batch json.RawMessage `json:"batch"`; N int `json:"n"` }
func main(){
 session,err:=NewSession();if err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)};defer session.Dispose()
 scan:=bufio.NewScanner(os.Stdin);scan.Buffer(make([]byte,1<<20),16<<20);enc:=json.NewEncoder(os.Stdout)
 for scan.Scan(){
  var req request;if err=json.Unmarshal(scan.Bytes(),&req);err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
  var value any;err=nil
  switch req.Op {
  case "create":value,err=session.Create(req.Config)
  case "catalog":value=session.Content()
  case "step":value,err=session.Step(req.N)
  case "info":value=session.Info()
  case "hash":value,err=session.Hash()
  case "save":var save SaveResult;save,err=session.Save();value=map[string]any{"data":save.Data,"tick":save.Tick,"hash":save.Hash}
  case "replay":value,err=session.ExportReplay()
  case "view":
   var raw []byte;raw,err=session.View(req.Player);if err==nil{snap:=new(pb.PlayerSnapshot);err=proto.Unmarshal(raw,snap);if err==nil{var data []byte;data,err=(protojson.MarshalOptions{EmitUnpopulated:true}).Marshal(snap);value=json.RawMessage(data)}}
  case "submit","preview":
   batch:=new(pb.OrderBatch);err=protojson.Unmarshal(req.Batch,batch)
   if err==nil {var raw []byte;raw,err=proto.Marshal(batch);if err==nil{if req.Op=="submit"{err=session.Submit(req.Player,raw);value=batch.Sequence}else{value,err=session.PreviewOrders(req.Player,raw)}}}
  default:err=fmt.Errorf("unknown bridge operation %q",req.Op)
  }
  response:=map[string]any{"id":req.ID,"value":value};if err!=nil{response["error"]=err.Error()};if err=enc.Encode(response);err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
 }
 if err=scan.Err();err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
}
