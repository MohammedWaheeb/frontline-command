import {randomUUID} from '../runtime/crypto';
import {useEffect,useState} from 'react';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import type {LocalSaveSummary,LocalReplay} from '../runtime/storage';
import {Icon,Emblem} from './primitives';
import {KitIcon} from './menu/kit/icon';
import {Button} from './menu/kit/Button';
import {EmptyState} from './menu/kit/Panel';
import {FileButton} from './menu/kit/FileButton';
import {ConfirmModal} from './menu/kit/ConfirmModal';
import {FooterActionBar,useScreenFill} from './menu/kit/screen';
import {absoluteTime,fileSize,mapPreviewURL,matchClock,relativeTime} from './records/shared';
export function downloadFile(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
/** Read only the displayed metadata shape; Go still decides load compatibility. */
function displayedRuleset(metadata:unknown):string|undefined{
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return;
 const ruleset=(metadata as {ruleset?:unknown}).ruleset;
 return typeof ruleset==='string'&&ruleset.trim()?ruleset:undefined;
}
const RULESET_LABEL:Record<string,string>={'scenario-v2':'Campaign rules','practice-v1':'Practice range'};
const MODE_LABEL:Record<string,string>={'1v1':'1 vs 1','2v2':'2 vs 2',ffa:'Free-for-all',coop:'Co-op',custom:'Custom'};
type Replay=Omit<LocalReplay,'data'>;
type ArchiveRecord=LocalSaveSummary|Replay;

export function Archives({app,replays}:{app:Application;replays:boolean}){
 useScreenFill();
 const {index}=useObservable(app.state);
 const [saves,setSaves]=useState<LocalSaveSummary[]>([]),[records,setRecords]=useState<Replay[]>([]),[loaded,setLoaded]=useState(false),[deleting,setDeleting]=useState<{id:string;name:string;revision:number}>();
 const reload=()=>(replays?app.store.listReplays().then(setRecords):app.store.listSaveSummaries().then(setSaves)).then(()=>setLoaded(true));
 useEffect(()=>{setLoaded(false);void reload().catch(error=>app.error(error))},[app,replays]);const list:ArchiveRecord[]=replays?records:saves;
 const importFile=(file:File)=>void app.task('Validating imported file…',async()=>{try{if(file.size>(replays?64:96)*1024*1024)throw Error('The file exceeds the supported size.');if(replays)await app.store.putReplay(randomUUID(),file.name.slice(0,100),new Uint8Array(await file.arrayBuffer()));else{const prepared=await app.store.previewImport(file);await app.store.putSave(randomUUID(),prepared.name,prepared.save,0)}await reload();app.patch({notice:'Imported as a new local copy. Existing records were preserved.'})}catch(error){if(file.size<=96*1024*1024)await app.store.preserveRecovery(file,file.name.slice(0,100),error instanceof Error?error.message:'Import failed');throw error}});
 const open=(record:ArchiveRecord)=>void app.task(replays?'Opening replay…':'Loading operation…',async()=>{if(replays)await app.sessions.openStoredReplay(record.id);else await app.sessions.continueSave(record.id)});
 /** Map art when the record names a curated battlefield; otherwise the mission faction emblem or a plain plate. */
 const thumbnail=(record:ArchiveRecord)=>{const mission='mission' in record&&record.mission?index?.missions.find(entry=>entry.id===record.mission):undefined;const savedMap='map_id' in record&&record.map_id?index?.maps.find(entry=>entry.id===record.map_id):undefined,map=mission?undefined:savedMap??index?.maps.find(entry=>record.name.includes(entry.title));const url=mapPreviewURL(map?.id),scenario=mission??(map&&!url?index?.missions.find(entry=>entry.map_id===map.id):undefined);
  return <span className="rec-archive-thumb" aria-hidden="true">{url?<img src={url} alt="" loading="lazy"/>:scenario?<Emblem faction={scenario.faction}/>:<KitIcon id={replays?'i-replay':'i-save'}/>}</span>};
 const meta=(record:ArchiveRecord)=>{const ruleset=displayedRuleset(record.metadata),parts:string[]=[];
  if('end_tick' in record){parts.push(`${matchClock(record.end_tick-record.start_tick)} recorded`);if(record.players?.length)parts.push(`${record.players.length} commanders`);if(record.lobby)parts.push(MODE_LABEL[record.lobby.mode]??record.lobby.mode)}
  else{const mission='mission' in record&&record.mission?index?.missions.find(entry=>entry.id===record.mission):undefined;if(mission)parts.push(mission.mode==='tutorial'?`Lesson · ${mission.title}`:`Campaign · ${mission.title}`);parts.push(`${matchClock(record.tick)} match time`);parts.push(record.kind==='auto'?'Autosave':'Manual save');parts.push(fileSize(record.bytes))}
  if(ruleset)parts.push(RULESET_LABEL[ruleset]??'Skirmish rules');
  return {ruleset,line:parts.join(' · ')}};
 const noun=replays?'replay':'save';
 return <div className="rec-screen rec-archives">
  <div className="rec-toolbar">
   <p className="rec-toolbar-count"><b>{list.length}</b> {replays?(list.length===1?'replay':'replays'):(list.length===1?'saved operation':'saved operations')}{list.length>1&&<span> · newest first</span>}</p>
   <FileButton label={replays?'Import replay':'Import save copy'} inputLabel={replays?'Import replay':'Import save'} icon="i-download" accept={replays?'.json,.replay,application/json':'.json,.save,application/json'} onFiles={files=>importFile(files[0])} title="Imported files are checked for compatibility and always added as a new copy."/>
  </div>
  {!loaded?<p role="status" className="rec-loading">Reading {replays?'replays':'saves'}…</p>:!list.length?<EmptyState icon={replays?'i-replay':'i-save'} title={replays?'No replays yet':'No saved operations yet'} action={<Button variant="primary" icon="i-skirmish" onClick={()=>app.patch({page:'skirmish'})}>Start a skirmish</Button>}>{replays?'Choose Save replay on the debrief screen, or Archive replay from the pause menu, to keep a battle here.':'Save from the pause menu during any solo battle. Autosaves also appear here.'}</EmptyState>
  :<div className="archive-list rec-archive-list" role="list">{list.map((record,position)=>{const {ruleset,line}=meta(record);return <div key={record.id} role="listitem" className="archive-row rec-archive-row" data-invalid={!ruleset||undefined} data-latest={position===0||undefined}>
   {thumbnail(record)}
   <div className="rec-archive-copy"><strong title={record.name}>{record.name}</strong><small>{line}</small><small className="rec-archive-when" title={absoluteTime(record.updated)}><Icon id="i-clock"/>{relativeTime(record.updated)}{position===0&&<em>Latest</em>}</small>{!ruleset&&<small className="rec-archive-warning"><Icon id="i-alert"/>{replays?'Playback':'Loading'} disabled: the metadata is unreadable. Export the original for recovery.</small>}</div>
   <div className="rec-archive-actions">
    <Button icon="i-play" className="rec-archive-open" disabled={!ruleset} onClick={()=>open(record)}>{replays?'Watch':'Load'}</Button>
    <Button size="sm" variant="ghost" icon="i-download" title={`Download a portable copy of this ${noun}`} onClick={()=>void app.task('Exporting original…',async()=>downloadFile(await (replays?app.store.exportReplay(record.id):app.store.exportSave(record.id)),`${record.id}.${replays?'replay':'save'}.json`))}>Export</Button>
    {!replays&&<Button size="sm" variant="ghost" title="Download exact original save bytes for recovery; this does not verify the save can be loaded." onClick={()=>void app.task('Exporting original save bytes…',async()=>downloadFile(await app.store.exportSaveBytes(record.id),`${record.id}.save.bin`))} aria-label="Export original bytes">Original bytes</Button>}
    <Button size="sm" variant="ghost" icon="i-close" className="rec-danger-ghost" aria-label={`Delete ${record.name}`} title={`Delete ${record.name}`} onClick={()=>setDeleting(record)}>Delete</Button>
   </div></div>})}</div>}
  {deleting&&<ConfirmModal danger title="Delete local record" confirmLabel="Delete permanently" cancelLabel="Keep record" onCancel={()=>setDeleting(undefined)} onConfirm={()=>void app.task('Deleting local record…',async()=>{if(replays)await app.store.deleteReplay(deleting.id,deleting.revision);else await app.store.deleteSave(deleting.id,deleting.revision);setDeleting(undefined);await reload()})}><p>Delete “{deleting.name}” from this browser? This cannot be undone. Export it first if you need a copy.</p></ConfirmModal>}
  <FooterActionBar className="rec-footer" summary="Stored in this browser. Imports are checked before loading." actions={[{label:'Backup & restore',icon:'i-download',title:'Export or restore every save, replay and setting in Content & storage',onClick:()=>app.patch({page:'content'})}]} primary={list[0]&&displayedRuleset(list[0].metadata)?{label:replays?'Watch latest':'Load latest',icon:'i-play',ariaLabel:replays?'Watch latest replay':'Load latest save',onClick:()=>open(list[0])}:undefined}/>
 </div>;
}
