// Records lane revamp: Content & storage — offline game pack, portable backup and browser storage use.
import {useEffect,useState} from 'react';
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {installedPacks,installPack,registerOfflineWorker,type InstalledPack} from '../../runtime';
import {Icon} from '../primitives';
import {BackupPanel} from '../BackupPanel';
import {Button} from './kit/Button';
import {StatusChip} from './kit/Panel';
import {FooterActionBar,useScreenFill} from './kit/screen';
import {fileSize} from '../records/shared';
export function ContentScreen({app}:{app:Application}){
 useScreenFill();
 const {index}=useObservable(app.state),[packs,setPacks]=useState<InstalledPack[]>([]),[progress,setProgress]=useState<{complete:number;total:number}>(),[usage,setUsage]=useState<{usage:number;quota:number}>();
 useEffect(()=>{let active=true;void installedPacks().then(value=>{if(active)setPacks(value)}).catch(error=>{if(active)app.error(error)});void navigator.storage?.estimate?.().then(value=>{if(active&&value.quota)setUsage({usage:value.usage??0,quota:value.quota})}).catch(()=>{});return()=>{active=false}},[app]);
 const share=usage?Math.min(100,usage.usage/usage.quota*100):0;
 return <div className="rec-screen rec-content">
  <section className="rec-content-section" aria-labelledby="rec-content-pack"><h3 id="rec-content-pack" className="rec-section-title">Offline game pack</h3>
   <p className="rec-muted">Install the game files in this browser to play without a connection. Saves and settings are stored separately and are never touched.</p>
   {index?.packs.map(pack=>{const installed=packs.some(value=>value.id===pack.id&&value.version===pack.version);return <div className="archive-row rec-pack-row" key={pack.id}><span className="rec-pack-icon" aria-hidden="true"><Icon id={installed?'i-check':'i-download'}/></span><div><strong>Base content {pack.id}</strong><small><StatusChip tone={installed?'ok':'off'}>{installed?'Available offline':'Not cached for offline play'}</StatusChip></small></div><Button variant={installed?'ghost':'secondary'} icon="i-download" onClick={()=>void app.task('Installing offline content…',async()=>{await registerOfflineWorker();const response=await fetch(pack.manifest_url);if(!response.ok)throw Error('The offline pack manifest is unavailable. Build the packaged game first.');const manifest=await response.json();if(manifest.id!==pack.id||manifest.version!==pack.version)throw Error('The pack version does not match the installed index.');await installPack(manifest,value=>setProgress({complete:value.complete,total:value.total}));setPacks(await installedPacks())})}>{installed?'Reinstall':'Install'}</Button></div>})}
   {!index?.packs.length&&<p className="rec-muted">No game pack is listed in the content index.</p>}
   <p role="status" className="rec-pack-progress">{progress&&<><span className="rec-meter" aria-hidden="true"><i style={{width:`${progress.total?progress.complete/progress.total*100:0}%`}}/></span>{progress.complete} / {progress.total} files</>}</p>
  </section>
  <section className="rec-content-section" aria-labelledby="rec-content-backup"><h3 id="rec-content-backup" className="rec-section-title">Backup & restore</h3><BackupPanel app={app} onRestored={async()=>{setPacks(await installedPacks())}}/></section>
  {usage&&<section className="rec-content-section" aria-labelledby="rec-content-storage"><h3 id="rec-content-storage" className="rec-section-title">Browser storage</h3><div className="rec-storage"><span className="rec-meter" aria-hidden="true"><i style={{width:`${Math.max(1,share)}%`}}/></span><p><b>{fileSize(usage.usage)}</b> used of about {fileSize(usage.quota)} available to this game.</p></div><p className="rec-muted">Clearing this site’s browser data deletes saves, replays and progress. Export a backup first.</p></section>}
  <FooterActionBar className="rec-footer" summary="Everything here stays in this browser." actions={[{label:'Retry content index',icon:'i-refresh',title:'Read the installed content list again',onClick:()=>void app.task('Reloading content…',()=>app.reloadContent())}]}/>
 </div>;
}
