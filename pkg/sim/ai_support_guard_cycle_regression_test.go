package sim

import (
 "encoding/json"
 "frontlinecommand/pkg/content"
 "reflect"
 "testing"
)

// The opening uses unmodified New money, real countdown, paid Build/Train and
// ordinary movement/escort inputs. The controller is armed only at a saved
// checkpoint to isolate the full bot handoff. This is not a natural bot match.
type supportGuardCase struct {
 Name string
 SourceType string
 Difficulty string
 Chain bool
 Acyclic bool
 Queued bool
}

type supportGuardFixture struct {
 T *testing.T
 E *Engine
 Source ID
 Rifles []ID
 Expected map[ID][]Order
 Calls []Scheduled
 OpeningHash string
 PaidSpent int64
}

func (s *supportGuardFixture) advance() {
 s.T.Helper()
 if s.E.Outcome().Finished { s.T.Fatal("paid support fixture finished before its bound") }
 s.E.Advance()
 for _, result:=range s.E.state.Results {
  if !result.Accepted { s.T.Fatal("paid setup command rejected",result) }
 }
}
func (s *supportGuardFixture) submit(order Order) {
 s.T.Helper()
 sequence:=s.E.player(1).LastSequence+1
 if err:=s.E.Submit(1,sequence,[]Order{order});err!=nil { s.T.Fatal("normal paid/escort Submit failed",order,err) }
 s.Calls=append(s.Calls,Scheduled{s.E.Tick()+1,1,sequence,cloneOrders([]Order{order})})
 s.advance()
 if len(s.E.state.Results)!=1 || !s.E.state.Results[0].Accepted { s.T.Fatal("normal paid/escort execution receipt missing",order,s.E.state.Results) }
}
func (s *supportGuardFixture) wait(limit int, done func() bool) {
 s.T.Helper()
 for i:=0;i<limit && !done();i++ { s.advance() }
 if !done() { s.T.Fatal("paid setup travel/production did not finish within bound",s.E.Tick()) }
}
func (s *supportGuardFixture) first(typ string, complete bool) *Entity {
 for _, v:=range s.E.state.Entities {
  if v.Owner==1 && v.Type==typ && v.HP>0 && (!complete || v.Complete) { return v }
 }
 return nil
}
func (s *supportGuardFixture) build(rig ID, typ string, point Vec) ID {
 s.T.Helper()
 s.submit(Order{Kind:"build",Entities:[]ID{rig},Type:typ,Position:point})
 s.wait(2000,func()bool{return s.first(typ,true)!=nil})
 return s.first(typ,true).ID
}
func (s *supportGuardFixture) move(id ID, point Vec) {
 s.T.Helper()
 s.submit(Order{Kind:"move",Entities:[]ID{id},Position:point})
 s.wait(800,func()bool{v:=s.E.entity(id);return v!=nil && distance(v.Position,point)<=300})
 s.submit(Order{Kind:"stop",Entities:[]ID{id}})
}
func supportGuardPaidOpening(t *testing.T, c supportGuardCase) *supportGuardFixture {
 t.Helper()
 e,err:=New(content.MustBase(),Config{Map:fixtureMap(),Seed:603013,Players:[]PlayerConfig{
  {ID:1,Faction:"US",Team:1,Controller:"human"},
  {ID:2,Faction:"IR",Team:2,Controller:"human"},
 }})
 if err!=nil { t.Fatal(err) }
 s:=&supportGuardFixture{T:t,E:e,Expected:map[ID][]Order{},OpeningHash:e.Hash()}
 for e.state.Countdown>0 { s.advance() }
 rig:=s.first("US.rig",true).ID
 s.build(rig,"power",Vec{X:14000,Y:12000})
 sourceRule,ok:=e.catalog.Unit(c.SourceType)
 if !ok || sourceRule.Weapon!="" || sourceRule.Role!="medic" && sourceRule.Role!="repair" { t.Fatal("incorrect support fixture source",c.SourceType) }
 if sourceRule.Producer=="factory" {
  s.move(rig,Vec{X:12000,Y:6000})
  s.build(rig,"supply",Vec{X:18000,Y:5500})
  s.wait(100,func()bool{return s.first("US.hauler",true)!=nil})
  hauler:=s.first("US.hauler",true)
  // Accepted positional Guard preserves this ordinary hauler task through AI.
  s.submit(Order{Kind:"guard",Entities:[]ID{hauler.ID},Position:hauler.Position})
 }
 s.move(rig,Vec{X:17000,Y:14000})
 barracks:=s.build(rig,"barracks",Vec{X:20000,Y:12000})
 producer:=barracks
 if sourceRule.Producer=="factory" {
  s.move(rig,Vec{X:12000,Y:17000})
  producer=s.build(rig,"factory",Vec{X:8000,Y:20000})
 }
 builder:=e.entity(rig)
 s.submit(Order{Kind:"guard",Entities:[]ID{rig},Position:builder.Position})
 count:=1;if c.Chain { count=2 }
 for i:=0;i<count;i++ { s.submit(Order{Kind:"train",Entities:[]ID{barracks},Type:"US.rifle"}) }
 s.submit(Order{Kind:"train",Entities:[]ID{producer},Type:c.SourceType})
 s.wait(1600,func()bool{
  rifles:=0
  for _,v:=range e.state.Entities { if v.Owner==1 && v.Type=="US.rifle" && v.HP>0 { rifles++ } }
  return rifles==count && s.first(c.SourceType,true)!=nil
 })
 s.Source=s.first(c.SourceType,true).ID
 rifleRule,_:=e.catalog.Unit("US.rifle")
 s.PaidSpent=sourceRule.Cost+int64(count)*rifleRule.Cost
 for _,v:=range e.state.Entities {
  if v.Owner!=1 || v.HP<=0 { continue }
  if v.Building && v.Type!="hq" { rule,_:=e.buildingRule(v.Type);s.PaidSpent+=rule.Cost }
  if v.Type=="US.rifle" {
   if v.Paid!=rifleRule.Cost { t.Fatal("combat actor lacks actual paid production",v.ID,v.Paid) }
   s.Rifles=append(s.Rifles,v.ID)
  }
 }
 if e.entity(s.Source).Paid!=sourceRule.Cost || e.player(1).Spent!=s.PaidSpent || e.player(1).Credits+e.player(1).Spent-e.player(1).Income!=6000000 {
  t.Fatal("opening bank/ordinary paid provenance failed",e.player(1).Spent,s.PaidSpent,e.entity(s.Source).Paid)
 }
 s.move(s.Source,Vec{X:20000,Y:27000})
 for i,id:=range s.Rifles { s.move(id,Vec{X:23000,Y:27000+int32(i)*1500}) }
 if c.Acyclic {
  order:=Order{Kind:"move",Entities:[]ID{s.Rifles[0]},Position:Vec{X:40000,Y:27000}}
  s.submit(order)
 } else {
  for i,id:=range s.Rifles {
   target:=s.Source
   if c.Chain && i==0 { target=s.Rifles[1] }
   order:=Order{Kind:"escort",Entities:[]ID{id},Target:target,Position:e.entity(target).Position}
   s.submit(order)
   if c.Queued {
    later:=Order{Kind:"move",Entities:[]ID{id},Position:Vec{X:40000,Y:27000},Queued:true}
    s.submit(later)
   }
   // Execution stores per-actor orders after normal payload normalization.
   // Preserve the actually accepted queue rather than the submitted Entities.
   accepted:=e.entity(id).Orders
   want:=1;if c.Queued { want=2 }
   if len(accepted)!=want || accepted[0].Kind!="escort" || accepted[0].Target!=target || accepted[0].Queued {
    t.Fatal("normal Escort did not become the intended accepted actor queue",id,accepted)
   }
   if c.Queued && (accepted[1].Kind!="move" || !accepted[1].Queued || accepted[1].Position!=(Vec{X:40000,Y:27000})) {
    t.Fatal("normal future Move did not become the accepted Escort suffix",id,accepted)
   }
   s.Expected[id]=cloneOrders(accepted)
  }
 }
 if len(e.entity(s.Source).Orders)!=0 || e.entity(s.Source).Stance!="guard" { t.Fatal("support is not actually idle before full-cycle handoff") }
 return s
}

type supportGuardFrame struct {
 Tick Tick `json:"tick"`
 SourceOrders []Order `json:"source_orders"`
 SourcePosition Vec `json:"source_position"`
 RifleOrders map[ID][]Order `json:"rifle_orders"`
 Pending []Scheduled `json:"pending"`
 Results []OrderResult `json:"results"`
 FollowCycle bool `json:"actual_source_follow_cycle"`
 ForeignPrivate int `json:"foreign_private_payloads"`
 Hash string `json:"state_hash"`
}
func supportGuardRead(s *supportGuardFixture) supportGuardFrame {
 e:=s.E;source:=e.entity(s.Source)
 row:=supportGuardFrame{Tick:e.Tick(),SourceOrders:cloneOrders(source.Orders),SourcePosition:source.Position,RifleOrders:map[ID][]Order{},Results:append([]OrderResult(nil),e.state.Results...),Hash:e.Hash()}
 for _,id:=range s.Rifles { row.RifleOrders[id]=cloneOrders(e.entity(id).Orders) }
 for _,pending:=range e.state.Pending { pending.Orders=cloneOrders(pending.Orders);row.Pending=append(row.Pending,pending) }
 view,_:=e.PlayerView(1)
 own:=[]EntityView{}
 for _,v:=range view.Entities {
  if v.Owner==1 { own=append(own,v) } else if v.Private!=nil { row.ForeignPrivate++ }
 }
 if len(source.Orders)>0 && (source.Orders[0].Kind=="guard" || source.Orders[0].Kind=="escort") && source.Orders[0].Target!=0 {
  row.FollowCycle=e.aiGroundFollowCycle(own,source.ID,source.Orders[0].Target)
 }
 return row
}

func TestAISupportFallbackPreservesPaidEscort(t *testing.T) {
 cases:=[]supportGuardCase{
  {"medic_hard_direct","US.medic","hard",false,false,false},
  {"medic_normal_direct","US.medic","normal",false,false,false},
  {"medic_easy_direct","US.medic","easy",false,false,false},
  {"repair_hard_direct","US.repair","hard",false,false,false},
  {"medic_hard_owned_chain","US.medic","hard",true,false,false},
  {"medic_hard_queued_escort","US.medic","hard",false,false,true},
  {"medic_hard_acyclic_move","US.medic","hard",false,true,false},
 }
 for _,c:=range cases {
  t.Run(c.Name,func(t *testing.T){
   s:=supportGuardPaidOpening(t,c);e:=s.E;p:=e.player(1)
   // The only bootstrap mutation is before this saved measurement checkpoint.
   // Subsequent plans, orders, costs, positions and tasks come from Advance.
   p.Controller,p.AI,p.AILast="ai",c.Difficulty,e.Tick()
   initial,err:=e.Save();if err!=nil { t.Fatal(err) }
   twin,err:=Restore(e.catalog,initial);if err!=nil || twin.Hash()!=e.Hash() { t.Fatal("actual initial checkpoint Restore failed",err) }
   period:=seconds(1);if c.Difficulty=="normal" { period=seconds(2) };if c.Difficulty=="easy" { period=seconds(4) }
   sourceStart:=e.entity(s.Source).Position
   frames:=[]supportGuardFrame{supportGuardRead(s)}
   cycleTicks,sourceGuards,escortStops:=0,0,0
   rejected:=[]OrderResult{}
   for i:=Tick(0);i<period*2+2;i++ {
    if e.Outcome().Finished { t.Fatal("full-cycle support checkpoint unexpectedly ended") }
    e.Advance();twin.Advance()
    row:=supportGuardRead(s);frames=append(frames,row)
    if e.Hash()!=twin.Hash() { t.Fatal("actual saved-twin full-cycle hash diverged",e.Tick()) }
    if row.ForeignPrivate!=0 { t.Fatal("owner view attached foreign private queues") }
    if row.FollowCycle { cycleTicks++ }
    for _,result:=range row.Results {
     if !result.Accepted { rejected=append(rejected,result) }
     for _,batch:=range e.state.Log {
      if batch.Player!=result.Player || batch.Sequence!=result.Sequence || result.Index<0 || int(result.Index)>=len(batch.Orders) { continue }
      order:=batch.Orders[int(result.Index)]
      if !result.Accepted { continue }
      for _,id:=range order.Entities {
       if id==s.Source && order.Kind=="guard" { sourceGuards++ }
       if _,ok:=s.Expected[id];ok && order.Kind=="stop" { escortStops++ }
      }
     }
    }
   }
   final,err:=e.Save();if err!=nil { t.Fatal(err) }
   receipt:=map[string]any{"case":c,"scope":"ordinary paid public opening; controller-armed saved full-cycle checkpoint; not a natural autonomous match",
    "opening_initial_hash":s.OpeningHash,"paid_setup_spent_milli":s.PaidSpent,"paid_setup_calls":s.Calls,"source":s.Source,"rifles":s.Rifles,
    "accepted_escort_queues":s.Expected,"initial_save":json.RawMessage(initial),"final_save":json.RawMessage(final),"actual_frames":frames,"actual_cycle_ticks":cycleTicks,
    "actual_source_guard_executions":sourceGuards,"actual_accepted_escort_stop_executions":escortStops,"actual_rejections":rejected,
    "saved_twin_exact":true,"no_measured_direct_state_or_cash_hp_mutation":true}
   raw,err:=json.Marshal(receipt);if err!=nil { t.Fatal(err) };t.Logf("support_guard_handoff_receipt=%s",raw)
   if len(rejected)>0 { t.Fatal("normal full-cycle execution rejected an order; inspect as a separate precondition issue",rejected) }
   if cycleTicks!=0 { t.Errorf("idle support fallback created an actual owned follow cycle for %d ticks",cycleTicks) }
   if c.Acyclic {
    source:=e.entity(s.Source)
    if sourceGuards==0 || len(source.Orders)!=1 || source.Orders[0].Kind!="guard" || source.Orders[0].Target!=s.Rifles[0] || distance(sourceStart,source.Position)==0 {
     t.Error("acyclic paid support no longer follows the working army",sourceGuards,source.Orders,sourceStart,source.Position)
    }
   } else {
    if sourceGuards!=0 || escortStops!=0 { t.Error("fallback redirected support or stopped an otherwise accepted combat Escort",sourceGuards,escortStops) }
    for id,expected:=range s.Expected {
     v:=e.entity(id)
     if !reflect.DeepEqual(v.Orders,expected) { t.Error("accepted paid combat Escort was overwritten",id,v.Orders,expected) }
    }
   }
  })
 }
}
