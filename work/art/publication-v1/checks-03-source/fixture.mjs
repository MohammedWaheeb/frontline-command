// Disposable synthetic metadata/1px PNGs exercise publication plumbing, not art acceptance.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pin,writeJSON} from './io.mjs';
import {captureBaseline} from './publication.mjs';
export async function fixture(root,name){
 const prefix=`work/art/publication-v1/fixtures/${name}`,dir=path.join(root,prefix);await mkdir(dir,{recursive:false});
 const put=async(rel,value)=>{const p=prefix+'/'+rel;await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),typeof value==='object'&&!Buffer.isBuffer(value)?JSON.stringify(value,null,2)+'\n':value);return pin(root,p)};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64');
 const id='unit.US.rifle',role='US.rifle',prop='prop.rocks',stage=prefix+'/stage';
 const states=[{name:'idle',frames:1,directions:1}],side=asset=>({id:asset,role_id:asset===id?role:null,states,frame_count:1,atlases:{'1x':{beauty:[asset+'.json']}}});
 const exportBytes={};for(const asset of [id,prop]){exportBytes[`sprites/${asset}/${asset}.sprite.json`]=side(asset);exportBytes[`sprites/${asset}/${asset}.json`]={meta:{image:asset+'.png'}};exportBytes[`sprites/${asset}/${asset}.png`]=png}
 for(const folder of ['portraits','icons/build'])for(const scale of ['1x','2x'])for(const layer of ['beauty','team'])exportBytes[`ui/${folder}/${role}@${scale}.${layer}.png`]=png;
 for(const [rel,bytes] of Object.entries(exportBytes))await put('assets/build/'+rel,bytes);
 await put(`assets/build/sprites/${id}/stale-old-page.png`,png);await put('assets/build/terrain/sand.png',png);await put('assets/fonts/LICENSE.txt','fixture-font-notice');
 const exports={};for(const [rel,bytes] of Object.entries(exportBytes).filter(([r])=>!r.startsWith(`sprites/${prop}/`))){const d=await put('stage/assets/build/'+rel,bytes);exports[rel]={source:d.path,bytes:d.bytes,sha256:d.sha256}}
 const spec=await put(`stage/assets/pipeline/specs/${id}.json`,{id,role_id:role,model:'fixture_model',states}),model=await put('stage/assets/pipeline/blender/models/fixture_model.py','# fixture only\n'),editable=await put(`stage/assets/source/blender/${id}.blend`,Buffer.alloc(1025,7));
 const production=await put('receipts/production.json',{stage,sources:{[spec.path.slice(stage.length+1)]:spec.sha256,[model.path.slice(stage.length+1)]:model.sha256}}),native=await put('receipts/native.json',{accepted:true,scope:'Synthetic fixture only'}),integrity=await put('receipts/check.json',{failures:0,poses:1}),ui=await put('receipts/ui.json',{failures:0});
 const h={id,stage,model:model.path,model_sha256:model.sha256,spec:spec.path,spec_sha256:spec.sha256,editable_blend:editable.path,files:exports,receipts:Object.fromEntries([production,native,integrity,ui].map(d=>[d.path,d.sha256]))};const handoff=await put('handoff.json',h);
 const legacyFiles={};for(const rel of Object.keys(exportBytes).filter(r=>r.startsWith(`sprites/${prop}/`))){const d=await pin(root,prefix+'/assets/build/'+rel);legacyFiles[rel]={sha256:d.sha256,bytes:d.bytes}}
 const lineage=await put('legacy.json',{failures:[],inputs:{},assets:[{id:prop,sprite_files:legacyFiles,ui_files:[],raw_mismatches:[],spec_sidecar_states_exact:true,source_lineage_limits:['Synthetic fixture; no native acceptance']} ]});
 const maskRows=[];for(const [rel,d] of Object.entries(exports).filter(([r])=>r.endsWith('.team.png'))){const derivative=await put('normalization/candidate/'+rel,Buffer.concat([png,Buffer.from('fixture-derivative')]));maskRows.push({id,destination:rel,original_source:d.source,original_sha256:d.sha256,candidate:derivative.path,candidate_sha256:derivative.sha256,alpha_changed_pixels:0,coverage_changed_pixels:0,non_gray_pixels:0})}
 const normalization=await put('normalization/result.json',{failures:[],handoffs:[{id,path:handoff.path,sha256:handoff.sha256}],files:maskRows});
 const baselineInventory=await put('baseline.json',await captureBaseline(root,prefix+'/assets'));
 const m={format:1,reviewed:true,scope:'fixture',expectedIds:[id,prop],baseline:{assets:prefix+'/assets',inventory:baselineInventory},entries:[{id,kind:'handoff',handoff,spec,model,editable,production,native,integrity,ui},{id:prop,kind:'legacy',lineage,editableScope:'not-certified-by-legacy-lineage',acceptedLimits:['Synthetic fixture; no native acceptance']}],normalization:{receipt:normalization,requiredIds:[id]}};
 const seal=()=>put('selection.json',m);return {root,prefix,dir,id,prop,m,h,put,seal,out:path.join(dir,'prepared'),exports,normalization,maskRows};
}
