import assert from 'node:assert/strict';

/** Real workers, Go validation and IndexedDB. No product rendering in this test. */
export async function testBrowserSession(page, config) {
 const result=await page.evaluate(async config=>{
  const R=globalThis.FrontlineTest,OriginalWorker=globalThis.Worker,workers=new Set();
  globalThis.Worker=class extends OriginalWorker{
   constructor(...args){super(...args);workers.add(this)}
   terminate(){workers.delete(this);return super.terminate()}
  };
  const manager=new R.SessionController({databaseName:'session-browser'}),drafts=new R.EditorDraftStore('session-editor-browser');
  try{
   await manager.startSolo(config);await manager.flushAutosave();
   const opening=manager.state.id;await manager.transport.step(25);const saved=await manager.saveManual('journey','Session journey');
   const before=await manager.transport.hash();const affordances=await manager.transport.affordances([2]);const advice=await manager.transport.previewOrders([{kind:'build',entities:[2],type:'power',position:{x:13000,y:13000}}]);
   const advisory={builder:affordances.entities[0].commands.includes('build'),types:affordances.entities[0].builds.length,code:advice.results[0].code,unchanged:(await manager.transport.hash())===before};
   let corrupt='';const damaged=saved.data.slice();damaged[Math.floor(damaged.length/2)]^=1;
   try{await manager.loadSave({...saved,data:damaged})}catch(error){corrupt=error.code}
   const preserved=manager.state.id===opening&&(await manager.transport.hash())===before;
   await manager.restart();await manager.flushAutosave();const restart={tick:manager.state.info.tick,newSession:manager.state.id!==opening};
   await manager.continueSave('journey');await manager.flushAutosave();const resumed=(await manager.transport.hash())===before;
   const replay=await manager.archiveReplay('journey-replay','Recorded journey');await manager.openStoredReplay(replay.id);
   let replaySave='';try{await manager.saveManual('bad','Invalid replay save')}catch(error){replaySave=error.code}
   const replayMode=manager.state.kind;
   const validators={validateMap:bytes=>globalThis.testRuntime.validateMap(bytes),validateMission:(map,mission)=>globalThis.testRuntime.validateMission(map,mission)};
   const editor=new R.MapEditorDocument({map:config.map},validators,{documentId:'actual-go-draft'});
   editor.transact('Map identity',edit=>edit.metadata({title:'Synthetic edited map'}));
   const good=await editor.validate();editor.transact('Invalid map',edit=>edit.paint([{x:0,y:0}],{terrain:'unsupported-terrain'}));
   const bad=await editor.validate();let blocked='';try{await editor.prepareTest({seed:19})}catch(error){blocked=error.code}
   editor.undo();const repaired=await editor.validate();const draft=await drafts.put(editor);const stored=await drafts.get(draft.id);
   const restored=await R.MapEditorDocument.importDraft(stored.data,validators);const launch=await restored.prepareTest({seed:19});
   await manager.startSolo(launch.config);await manager.flushAutosave();await manager.transport.step(manager.transport.current.countdown);
   await manager.transport.sendOrders([{kind:'practice_fog',index:1}]);await manager.transport.step(1);
   const practice={kind:manager.state.kind,ruleset:manager.state.info.metadata.ruleset,fog:manager.transport.current.visible.length===config.map.tiles.length&&manager.transport.current.visible.every(value=>value),document:restored.returnFromTest(launch).documentId};
   manager.leave();const menu=manager.state.phase;
   await manager.startSolo(config);await manager.flushAutosave();
   const privateWhileLive=manager.transport.current.debrief===undefined;
   await manager.transport.sendOrders([{kind:'train',entities:[1],type:'US.rig'}]);
   for(let i=0;i<3;i++)await manager.transport.step(200);
   const stillPrivate=manager.transport.current.debrief===undefined;
   await manager.transport.sendOrders([{kind:'surrender'}]);await manager.transport.step(1);
   const finalTick=manager.transport.current.tick,finalHash=await manager.transport.hash();
   const serialize=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
   const finalDebrief=serialize(manager.transport.current.debrief),player=manager.transport.current.debrief?.players.find(p=>p.player===1);
   const completedSave=await manager.saveManual('completed-battle','Completed battle');
   const completedReplay=await manager.archiveReplay('completed-battle-replay','Completed battle');
   await manager.loadSave(completedSave);await manager.flushAutosave();
   const savedDebrief=serialize(manager.transport.current.debrief)===finalDebrief&&(await manager.transport.hash())===finalHash;
   await manager.openStoredReplay(completedReplay.id);
   const replayPrivate=manager.transport.current.debrief===undefined;
   await manager.seekReplay(finalTick);
   const replayDebrief=serialize(manager.transport.current.debrief)===finalDebrief&&(await manager.transport.hash())===finalHash;
   const debrief={privateWhileLive,stillPrivate,replayPrivate,savedDebrief,replayDebrief,produced:player?.metrics?.unitsProduced,spent:player?.spent.toString(),samples:player?.metrics?.timeline.length,firstTick:player?.metrics?.timeline[0]?.tick,lastTick:player?.metrics?.timeline.at(-1)?.tick,finalTick};
   manager.dispose();await drafts.close();
   return {advisory,corrupt,preserved,restart,resumed,replayMode,replaySave,good:good.ok,bad:bad.ok,blocked,repaired:repaired.ok,draftRevision:draft.revision,practice,menu,debrief,workers:workers.size,phase:manager.state.phase};
  }finally{manager.dispose();await drafts.close();globalThis.Worker=OriginalWorker}
 },config);
 assert.ok(result.corrupt.startsWith('save_'));assert.ok(result.preserved&&result.resumed);assert.deepEqual(result.restart,{tick:0,newSession:true});
 assert.ok(result.advisory.builder&&result.advisory.types>0&&result.advisory.unchanged);assert.equal(result.advisory.code,'indeterminate');
 assert.equal(result.replayMode,'replay');assert.equal(result.replaySave,'save_unavailable');assert.ok(result.good&&result.repaired);assert.equal(result.bad,false);assert.equal(result.blocked,'editor_validation');assert.equal(result.draftRevision,1);
 assert.equal(result.practice.kind,'practice');assert.equal(result.practice.ruleset,'practice-v1');assert.ok(result.practice.fog);assert.equal(result.practice.document,'actual-go-draft');
 assert.ok(result.debrief.privateWhileLive&&result.debrief.stillPrivate&&result.debrief.replayPrivate&&result.debrief.savedDebrief&&result.debrief.replayDebrief);
 assert.equal(result.debrief.produced.length,1);assert.equal(result.debrief.produced[0].type,'US.rig');assert.equal(result.debrief.produced[0].count,1);assert.ok(BigInt(result.debrief.spent)>0n);assert.ok(result.debrief.samples>=2);assert.equal(result.debrief.firstTick,0);assert.equal(result.debrief.lastTick,result.debrief.finalTick);
 assert.equal(result.menu,'menu');assert.equal(result.workers,0);assert.equal(result.phase,'closed');return result;
}
