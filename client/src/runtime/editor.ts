import {sha256Hex as checksum,randomUUID} from './crypto';
import {REVISION_STORE,upgradeRevisions,reserveRevision} from './idb-revisions';
import {RuntimeError} from './errors';
import type {Difficulty,Faction,GameMap,OfflineConfig,PlayerConfig,Point} from './types';

export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export type JSONDocument={[key:string]:JSONValue};
export type EditorMap=Omit<GameMap,'spawns'>&{spawns:Array<{position:Point;team?:number}>};
export interface EditorPresentation{description?:string;screenshot?:{mime:'image/png'|'image/jpeg'|'image/webp';base64:string}}
export interface EditorDocumentData{map:EditorMap;mission?:JSONDocument;presentation?:EditorPresentation}
export interface EditorValidators{validateMap(data:Uint8Array):Promise<GameMap>;validateMission(map:Uint8Array,mission:Uint8Array):Promise<Record<string,unknown>>}
export interface EditorOptions{documentId?:string;historyEntries?:number;historyBytes?:number}
export interface EditorSnapshot extends EditorDocumentData{documentId:string;revision:number;dirty:boolean;canUndo:boolean;canRedo:boolean;undoLabel?:string;redoLabel?:string}
export interface EditorIssue{scope:'map'|'mission'|'document';code:string;message:string;details?:unknown}
export interface EditorValidation{revision:number;ok:boolean;stale:boolean;issues:EditorIssue[]}
export interface EditorExport{file:Blob;filename:string;checksum:string;revision:number;documentId:string}
export interface EditorTestOptions{seed:number;difficulty?:Difficulty;players?:PlayerConfig[]}
export interface EditorTestLaunch{config:OfflineConfig;documentId:string;editorRevision:number;mapChecksum:string}
type Tile=GameMap['tiles'][number];
type Field=GameMap['fields'][number];
type Station=NonNullable<GameMap['stations']>[number];
type MapObject=NonNullable<GameMap['objects']>[number];
type Region=NonNullable<GameMap['regions']>[number];
type Group='fields'|'stations'|'objects'|'regions';
type History={before:string;after:string;label:string;bytes:number};
const encoder=new TextEncoder(),MAX_MAP_BYTES=16*1024*1024,MAX_MISSION_BYTES=2*1024*1024,MAX_DOCUMENT_BYTES=20*1024*1024;
const forbidden=new Set(['__proto__','constructor','prototype']);
function fail(code:string,message:string,details?:unknown):never{throw new RuntimeError(code,message,true,details)}
function bytes(value:unknown){return encoder.encode(JSON.stringify(value))}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
function integer(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)}
function checkJSON(value:unknown,maximum:number,label:string):JSONValue{
 let nodes=0;
 function visit(item:unknown,depth:number,path:string){
  if(++nodes>600000||depth>24)fail('editor_document_limit',`${label} exceeds the supported nesting or item limit.`,{path});
  if(item===null||typeof item==='string'||typeof item==='boolean')return;
  if(typeof item==='number'){if(!integer(item))fail('editor_json_number',`${label} contains a number that cannot be represented exactly.`,{path});return}
  if(typeof item!=='object'||item===undefined)fail('editor_json_value',`${label} must contain JSON data only.`,{path});
  if(Array.isArray(item)){for(let i=0;i<item.length;i++)visit(item[i],depth+1,`${path}/${i}`);return}
  if(Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)fail('editor_json_value',`${label} contains a non-JSON object.`,{path});
  for(const [key,child] of Object.entries(item)){if(forbidden.has(key))fail('editor_json_key',`${label} contains an unsupported property name.`,{path:`${path}/${key}`});visit(child,depth+1,`${path}/${key}`)}
 }
 visit(value,0,'');const encoded=bytes(value);if(encoded.length>maximum)fail('editor_document_limit',`${label} exceeds its file-size limit.`,{bytes:encoded.length,limit:maximum});return JSON.parse(new TextDecoder().decode(encoded)) as JSONValue;
}
function point(value:unknown,label:string){if(!object(value)||!integer(value.x)||!integer(value.y))fail('editor_point',`${label} requires integer coordinates in thousandths of a tile.`)}
function mapShape(value:unknown):EditorMap{
 const copy=checkJSON(value,MAX_MAP_BYTES,'Map');if(!object(copy))fail('editor_map_shape','The map must be a JSON object.');
 if(!integer(copy.width)||!integer(copy.height)||copy.width<1||copy.height<1||copy.width>256||copy.height>256||!Array.isArray(copy.tiles)||copy.tiles.length!==copy.width*copy.height)fail('editor_map_shape','Map dimensions must match a bounded tile array.');
 for(const [index,tile] of copy.tiles.entries())if(!object(tile)||typeof tile.terrain!=='string'||(tile.height!==undefined&&!integer(tile.height))||(tile.sight_blocker!==undefined&&typeof tile.sight_blocker!=='boolean')||(tile.mandatory!==undefined&&typeof tile.mandatory!=='boolean'))fail('editor_tile',`Tile ${index} has malformed editable fields.`,{index});
 for(const name of ['id','title','author','version','ruleset'])if(typeof copy[name]!=='string')fail('editor_map_shape',`Map ${name} must be text.`);
 for(const group of ['fields','required_packs'])if(copy[group]===undefined||copy[group]===null)copy[group]=[];
 for(const group of ['stations','objects','regions'])if(copy[group]===null)copy[group]=[];
 if(!integer(copy.format_version)||!Array.isArray(copy.spawns)||copy.spawns.length>4||!Array.isArray(copy.fields)||copy.fields.length>128||!Array.isArray(copy.required_packs)||copy.required_packs.some(pack=>typeof pack!=='string'))fail('editor_map_shape','The map metadata or object arrays are malformed.');
 point(copy.shipment,'Shipment');
 for(const [index,spawn] of copy.spawns.entries()){if(!object(spawn))fail('editor_map_shape',`Spawn ${index} must be an object.`);point(spawn.position,`Spawn ${index}`);if(spawn.team!==undefined&&!integer(spawn.team))fail('editor_map_shape',`Spawn ${index} needs an integer team marker.`)}
 for(const [group,limit] of [['fields',128],['stations',32],['objects',512],['regions',128]] as const){const list=copy[group]??[];if(!Array.isArray(list)||list.length>limit)fail('editor_object_limit',`${group} exceeds the editor record limit.`);for(const entry of list){if(!object(entry))fail('editor_map_shape',`${group} entries must be objects.`);if(group==='regions'){if(typeof entry.id!=='string')fail('editor_map_shape','Region IDs must be text.');point(entry.min,'Region minimum');point(entry.max,'Region maximum')}else{if(!integer(entry.id))fail('editor_map_shape',`${group} IDs must be integers.`);point(entry.position,group);if(group==='fields'&&!integer(entry.credits))fail('editor_map_shape','Resource amounts must be integers.');if(group==='objects'&&typeof entry.class!=='string')fail('editor_map_shape','Object classes must be text.')}}}
 return copy as unknown as EditorMap;
}
function presentation(value:unknown):EditorPresentation|undefined{
 if(value===undefined)return undefined;const copy=checkJSON(value,1024*1024,'Editor presentation');if(!object(copy)||Object.keys(copy).some(key=>!['description','screenshot'].includes(key))||copy.description!==undefined&&(typeof copy.description!=='string'||copy.description.length>16000))fail('editor_presentation','Editor presentation metadata is malformed.');
 if(copy.screenshot!==undefined){const shot=copy.screenshot;if(!object(shot)||Object.keys(shot).some(key=>!['mime','base64'].includes(key))||!['image/png','image/jpeg','image/webp'].includes(String(shot.mime))||typeof shot.base64!=='string'||shot.base64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(shot.base64))fail('editor_screenshot','A screenshot must be bounded PNG, JPEG, or WebP base64 data.');}
 return copy as EditorPresentation;
}
function checkedDocument(value:EditorDocumentData):EditorDocumentData{
 const map=mapShape(value.map);let mission:JSONDocument|undefined;if(value.mission!==undefined){const checked=checkJSON(value.mission,MAX_MISSION_BYTES,'Mission');if(!object(checked))fail('editor_mission_shape','Mission authoring data must be a JSON object.');mission=checked as JSONDocument}
 const display=presentation(value.presentation);return {map,...(mission?{mission}:{}),...(display?{presentation:display}:{})};
}
function index(value:number,length:number,label:string,allowEnd=false){if(!integer(value)||value<0||value>length-(allowEnd?0:1))fail('editor_index',`${label} is outside the current draft.`,{index:value,length})}
function label(value:string){if(typeof value!=='string'||!value.trim()||value.length>100)fail('editor_label','Give this edit a label of 1–100 characters.');return value.trim()}
function documentID(value:string){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value))fail('editor_document_id','Use a document ID of 1–100 letters, numbers, dots, hyphens, or underscores.')}
function copyBytes(data:Uint8Array,maximum:number,label:string){if(!(data instanceof Uint8Array)||data.byteLength>maximum)fail('editor_document_limit',`${label} exceeds the supported file-size limit.`);return data.slice()}
function parse(data:Uint8Array,label:string){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))}catch{fail('editor_import_corrupt',`${label} is not readable UTF-8 JSON. Keep the original file for recovery.`)}}

/** Pure coordinate snapping only. Collision, placement, visibility and routes remain in Go. */
export function snapEditorPoint(value:Point,step=1000,offset:Point={x:0,y:0}):Point{
 if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||!integer(step)||step<1||!integer(offset.x)||!integer(offset.y))fail('editor_grid','Grid coordinates and spacing are invalid.');
 const result={x:Math.round((value.x-offset.x)/step)*step+offset.x,y:Math.round((value.y-offset.y)/step)*step+offset.y};if(!integer(result.x)||!integer(result.y))fail('editor_grid','Snapped coordinates exceed the supported range.');return result;
}

export class EditorTransaction{
 private active=true;
 constructor(private readonly data:EditorDocumentData){}
 private writable(){if(!this.active)fail('editor_transaction_closed','This editor transaction has already ended.')}
 close(){this.active=false}
 snapshot():EditorDocumentData{this.writable();return structuredClone(this.data)}
 metadata(patch:Partial<Pick<EditorMap,'id'|'title'|'author'|'version'|'format_version'|'ruleset'|'required_packs'>>){this.writable();const allowed=['id','title','author','version','format_version','ruleset','required_packs'];for(const key of Object.keys(patch))if(!allowed.includes(key))fail('editor_metadata','Change geometry through its editor operation.');Object.assign(this.data.map,structuredClone(patch))}
 paint(cells:Array<{x:number;y:number}>,patch:Partial<Tile>){
  this.writable();if(!Array.isArray(cells)||cells.length>65536||Object.keys(patch).some(key=>!['terrain','height','sight_blocker','mandatory'].includes(key)))fail('editor_paint','A paint stroke must contain bounded tiles and supported tile fields.');
  const change=structuredClone(patch);for(const cell of cells){index(cell.x,this.data.map.width,'Tile x');index(cell.y,this.data.map.height,'Tile y');const position=cell.y*this.data.map.width+cell.x;this.data.map.tiles[position]={...this.data.map.tiles[position],...change}}
 }
 paintRectangle(min:Point,max:Point,patch:Partial<Tile>){this.writable();const left=Math.min(min.x,max.x),right=Math.max(min.x,max.x),top=Math.min(min.y,max.y),bottom=Math.max(min.y,max.y);index(left,this.data.map.width,'Tile x');index(right,this.data.map.width,'Tile x');index(top,this.data.map.height,'Tile y');index(bottom,this.data.map.height,'Tile y');const cells=[];for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)cells.push({x,y});this.paint(cells,patch)}
 resize(width:number,height:number,fill:Tile={terrain:'open',height:0}){
  this.writable();if(!integer(width)||!integer(height)||width<1||height<1||width>256||height>256)fail('editor_dimensions','Editor dimensions must be between 1 and 256 tiles.');const old=this.data.map;this.data.map={...old,width,height,tiles:Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return structuredClone(x<old.width&&y<old.height?old.tiles[y*old.width+x]:fill)})};
 }
 shipment(value:Point){this.writable();point(value,'Shipment');this.data.map.shipment=structuredClone(value)}
 spawn(position:number,value:EditorMap['spawns'][number]){this.writable();index(position,this.data.map.spawns.length,'Spawn index',true);if(position>=4)fail('editor_object_limit','A draft supports at most four player starts.');this.data.map.spawns[position]=structuredClone(value)}
 removeSpawn(position:number){this.writable();index(position,this.data.map.spawns.length,'Spawn index');this.data.map.spawns.splice(position,1)}
 private upsert(group:Group,value:{id:number|string}){this.writable();const list=(this.data.map[group]??=[]) as Array<{id:number|string}>;const found=list.findIndex(item=>item.id===value.id);if(found<0)list.push(structuredClone(value));else list[found]=structuredClone(value)}
 private remove(group:Group,id:number|string){this.writable();const list=this.data.map[group] as Array<{id:number|string}>|undefined;const found=list?.findIndex(item=>item.id===id)??-1;if(found<0)fail('editor_missing_object',`The ${group} record no longer exists.`,{id});list!.splice(found,1)}
 field(value:Field){this.upsert('fields',value)}
 station(value:Station){this.upsert('stations',value)}
 object(value:MapObject){this.upsert('objects',value)}
 region(value:Region){this.upsert('regions',value)}
 removeField(id:number){this.remove('fields',id)}
 removeStation(id:number){this.remove('stations',id)}
 removeObject(id:number){this.remove('objects',id)}
 removeRegion(id:string){this.remove('regions',id)}
 setPresentation(value:EditorPresentation|undefined){this.writable();if(value===undefined)delete this.data.presentation;else this.data.presentation=structuredClone(value)}
 setMission(value:JSONDocument|undefined){this.writable();if(value===undefined)delete this.data.mission;else this.data.mission=checkJSON(value,MAX_MISSION_BYTES,'Mission') as JSONDocument}
 private missionTarget(path:Array<string|number>):JSONValue{
  this.writable();if(!this.data.mission)fail('editor_mission_missing','Add a mission document before editing its fields.');if(!Array.isArray(path)||path.length>24)fail('editor_mission_path','Mission edit paths must be bounded.');let current:JSONValue=this.data.mission;
  for(const part of path){if(Array.isArray(current)){if(typeof part!=='number')fail('editor_mission_path','Array paths need an integer index.');index(part,current.length,'Mission index');current=current[part]}else if(object(current)){if(typeof part!=='string'||forbidden.has(part)||!Object.hasOwn(current,part))fail('editor_mission_path','The mission path does not exist.');current=current[part] as JSONValue}else fail('editor_mission_path','The mission path passes through a scalar value.')}return current;
 }
 setMissionValue(path:Array<string|number>,value:JSONValue){
  this.writable();if(!path.length)fail('editor_mission_path','Use setMission to replace the complete mission.');const target=this.missionTarget(path.slice(0,-1)),last=path[path.length-1],copy=checkJSON(value,MAX_MISSION_BYTES,'Mission edit');
  if(Array.isArray(target)){if(typeof last!=='number')fail('editor_mission_path','Array paths need an integer index.');index(last,target.length,'Mission index');target[last]=copy}else if(object(target)){if(typeof last!=='string'||forbidden.has(last))fail('editor_mission_path','This mission property is unsupported.');target[last]=copy}else fail('editor_mission_path','A mission property needs an object or array parent.');
 }
 deleteMissionValue(path:Array<string|number>){this.writable();if(!path.length)fail('editor_mission_path','Use setMission to remove the complete mission.');const target=this.missionTarget(path.slice(0,-1)),last=path[path.length-1];if(Array.isArray(target)){if(typeof last!=='number')fail('editor_mission_path','Array paths need an integer index.');index(last,target.length,'Mission index');target.splice(last,1)}else if(object(target)){if(typeof last!=='string'||forbidden.has(last)||!Object.hasOwn(target,last))fail('editor_mission_path','The mission property does not exist.');delete target[last]}else fail('editor_mission_path','The mission path does not contain an editable value.')}
 spliceMission(path:Array<string|number>,start:number,remove:number,insert:JSONValue[]=[]){this.writable();const target=this.missionTarget(path);if(!Array.isArray(target)||!integer(remove)||remove<0||!Array.isArray(insert)||insert.length>4096)fail('editor_mission_path','Mission list edits need an array and valid item count.');index(start,target.length,'Mission list index',true);if(remove>target.length-start)fail('editor_mission_path','The removal extends beyond the mission list.');target.splice(start,remove,...checkJSON(insert,MAX_MISSION_BYTES,'Mission list edit') as JSONValue[])}
}

export class MapEditorDocument{
 readonly documentId:string;private data:EditorDocumentData;private serialized:string;private saved:string;private revisionValue=0;
 private undoHistory:History[]=[];private redoHistory:History[]=[];private historySize=0;private editing=false;
 private readonly maxEntries:number;private readonly maxBytes:number;private savedExports=new WeakMap<EditorExport,string>();private launches=new WeakSet<EditorTestLaunch>();
 private validationValue:EditorValidation|undefined;
 constructor(data:EditorDocumentData,private readonly validators:EditorValidators,options:EditorOptions={}){
  this.documentId=options.documentId??`draft-${randomUUID()}`;documentID(this.documentId);this.maxEntries=options.historyEntries??128;this.maxBytes=options.historyBytes??32*1024*1024;
  if(!integer(this.maxEntries)||this.maxEntries<1||this.maxEntries>512||!integer(this.maxBytes)||this.maxBytes<1024||this.maxBytes>128*1024*1024)fail('editor_history_limit','Undo history limits are invalid.');
  this.data=checkedDocument(data);this.serialized=JSON.stringify(this.data);this.saved=this.serialized;
 }
 get revision(){return this.revisionValue}
 get dirty(){return this.serialized!==this.saved}
 get validation():EditorValidation|undefined{return this.validationValue?structuredClone(this.validationValue):undefined}
 snapshot():EditorSnapshot{return {...structuredClone(this.data),documentId:this.documentId,revision:this.revisionValue,dirty:this.dirty,canUndo:this.undoHistory.length>0,canRedo:this.redoHistory.length>0,undoLabel:this.undoHistory.at(-1)?.label,redoLabel:this.redoHistory.at(-1)?.label}}
 transact(editLabel:string,edit:(transaction:EditorTransaction)=>void):boolean{
  if(this.editing)fail('editor_nested_transaction','Group related edits in the current transaction.');const name=label(editLabel),draft=structuredClone(this.data),transaction=new EditorTransaction(draft);this.editing=true;
  try{const result=edit(transaction) as unknown;if(result&&typeof result==='object'&&'then' in result){Promise.resolve(result).catch(()=>{});fail('editor_async_transaction','Editor transactions must finish synchronously.')}const checked=checkedDocument(draft),after=JSON.stringify(checked);if(after===this.serialized)return false;
   const change:History={before:this.serialized,after,label:name,bytes:encoder.encode(this.serialized).length+encoder.encode(after).length};this.redoHistory=[];this.historySize=this.undoHistory.reduce((size,item)=>size+item.bytes,0);this.undoHistory.push(change);this.historySize+=change.bytes;while(this.undoHistory.length&&(this.undoHistory.length>this.maxEntries||this.historySize>this.maxBytes))this.historySize-=this.undoHistory.shift()!.bytes;
   this.data=checked;this.serialized=after;this.changed();return true;
  }finally{transaction.close();this.editing=false}
 }
 private changed(){this.revisionValue++;this.validationValue=undefined}
 undo():boolean{if(this.editing)fail('editor_nested_transaction','Finish the current transaction before undo.');const item=this.undoHistory.pop();if(!item)return false;this.redoHistory.push(item);this.serialized=item.before;this.data=JSON.parse(item.before);this.changed();return true}
 redo():boolean{if(this.editing)fail('editor_nested_transaction','Finish the current transaction before redo.');const item=this.redoHistory.pop();if(!item)return false;this.undoHistory.push(item);this.serialized=item.after;this.data=JSON.parse(item.after);this.changed();return true}
 async validate():Promise<EditorValidation>{
  const at=this.revisionValue,captured=structuredClone(this.data),issues:EditorIssue[]=[];let validMap=true;
  try{await this.validators.validateMap(bytes(captured.map))}catch(cause){validMap=false;const error=RuntimeError.from(cause);issues.push({scope:'map',code:error.code,message:error.message,details:error.details})}
  if(validMap&&captured.mission)try{await this.validators.validateMission(bytes(captured.map),bytes(captured.mission))}catch(cause){const error=RuntimeError.from(cause);issues.push({scope:'mission',code:error.code,message:error.message,details:error.details})}
  const stale=at!==this.revisionValue;if(stale)issues.push({scope:'document',code:'editor_changed',message:'The draft changed during validation. Validate its current revision before launching.'});const result={revision:at,ok:issues.length===0,stale,issues};if(!stale)this.validationValue=structuredClone(result);return result;
 }
 private async validated():Promise<{data:EditorDocumentData;revision:number}>{const result=await this.validate();if(result.revision!==this.revisionValue)fail('editor_changed','The draft changed after validation. Validate its current revision before launching.');if(!result.ok)fail(result.stale?'editor_changed':'editor_validation','Resolve the reported validation errors before exporting or test play.',{validation:result});return {data:structuredClone(this.data),revision:this.revisionValue}}
 async exportDraft():Promise<EditorExport>{
  const body=this.serialized,at=this.revisionValue,data=JSON.parse(body) as EditorDocumentData,mapChecksum=await checksum(bytes(data.map));const envelope={format:'frontline-editor-document',version:1,document_id:this.documentId,player_count:data.map.spawns.length,map_checksum:mapChecksum,content_checksum:await checksum(bytes(data)),...data};const encoded=bytes(envelope);if(encoded.length>MAX_DOCUMENT_BYTES)fail('editor_document_limit','This editor document exceeds 20 MiB.');const exported={file:new Blob([encoded.buffer],{type:'application/json'}),filename:`${this.documentId}.frontline-editor.json`,checksum:await checksum(encoded),revision:at,documentId:this.documentId};this.savedExports.set(exported,body);return exported;
 }
 markSaved(exported:EditorExport){const body=this.savedExports.get(exported);if(body===undefined)fail('editor_save_token','Only a successfully written export from this document can mark it saved.');this.saved=body}
 async exportMap():Promise<EditorExport>{const snapshot=await this.validated(),encoded=bytes(snapshot.data.map);return {file:new Blob([encoded.buffer],{type:'application/json'}),filename:`${snapshot.data.map.id.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,80)||'map'}.map.json`,checksum:await checksum(encoded),revision:snapshot.revision,documentId:this.documentId}}
 async exportMission():Promise<EditorExport>{const snapshot=await this.validated();if(!snapshot.data.mission)fail('editor_mission_missing','This draft does not have a mission document.');const encoded=bytes(snapshot.data.mission);return {file:new Blob([encoded.buffer],{type:'application/json'}),filename:`${snapshot.data.map.id.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,80)||'map'}.mission.json`,checksum:await checksum(encoded),revision:snapshot.revision,documentId:this.documentId}}
 static async importMap(data:Uint8Array,validators:EditorValidators,options:EditorOptions={}):Promise<MapEditorDocument>{const input=copyBytes(data,MAX_MAP_BYTES,'Map');await validators.validateMap(input.slice());return new MapEditorDocument({map:parse(input,'Map')},validators,options)}
 static async importDraft(data:Uint8Array,validators:EditorValidators,options:Omit<EditorOptions,'documentId'>={}):Promise<MapEditorDocument>{
  const value=parse(copyBytes(data,MAX_DOCUMENT_BYTES,'Editor document'),'Editor document');if(!object(value)||value.format!=='frontline-editor-document'||value.version!==1)fail('editor_version','This editor document version is unsupported. Keep the original file for a matching game version.');
  if(Object.keys(value).some(key=>!['format','version','document_id','player_count','map_checksum','content_checksum','map','mission','presentation'].includes(key)))fail('editor_version','This document contains unsupported fields. Keep the original file rather than discarding them.');
  const checked=checkedDocument(value as unknown as EditorDocumentData);if(value.player_count!==checked.map.spawns.length||typeof value.map_checksum!=='string'||await checksum(bytes(checked.map))!==value.map_checksum||typeof value.content_checksum!=='string'||await checksum(bytes(checked))!==value.content_checksum)fail('editor_checksum','This editor document failed its content checksum or player-count check. Preserve the original file for recovery.');
  return new MapEditorDocument(checked,validators,{...options,documentId:String(value.document_id)});
 }
 async prepareTest(options:EditorTestOptions):Promise<EditorTestLaunch>{
  if(!integer(options.seed)||options.seed<0||options.difficulty!==undefined&&!['easy','normal','hard'].includes(options.difficulty))fail('editor_test_options','Choose a supported difficulty and nonnegative exact seed.');
  const snapshot=await this.validated(),data=snapshot.data;let config:OfflineConfig;
  if(data.mission){if(options.players!==undefined)fail('editor_test_players','Mission test players come from the validated mission.');config={map:data.map,mission:data.mission,seed:options.seed,ruleset:'practice-v1',difficulty:options.difficulty??'normal'}}
  else{
   const factions:Faction[]=['US','IR','SY','SA'];const players:PlayerConfig[]=options.players?structuredClone(options.players):data.map.spawns.map((spawn,index)=>({id:index+1,name:index===0?'Editor commander':`Practice AI ${index}`,faction:factions[index],team:spawn.team!==undefined&&spawn.team>=1&&spawn.team<=4?spawn.team:index+1,...(index===0?{controller:'human' as const}:{controller:'ai' as const,ai:'normal' as const})}));
   if(players.length<1||players.length>4||players.length>data.map.spawns.length)fail('editor_test_players','Choose one to four players within the validated map starts.');let humans=0;
   for(const [position,player] of players.entries()){const controller=player.controller??(player.ai?'ai':'human');if(player.id!==position+1||typeof player.name!=='string'||player.name.length>48||!factions.includes(player.faction)||!integer(player.team)||player.team<1||player.team>4||!['human','ai'].includes(controller)||controller==='human'&&player.ai!==undefined||controller==='ai'&&!['easy','normal','hard'].includes(player.ai??''))fail('editor_test_players','Practice player slots need ordered IDs, valid teams/factions, and explicit human or AI control.');if(controller==='human')humans++}
   if(!humans)fail('editor_test_players','Test play needs at least one local human commander.');config={map:data.map,players,seed:options.seed,ruleset:'practice-v1'};
  }
  const mapChecksum=await checksum(bytes(data.map));if(this.revisionValue!==snapshot.revision)fail('editor_changed','The draft changed while preparing test play. Launch its current revision instead.');const launch={config,documentId:this.documentId,editorRevision:snapshot.revision,mapChecksum};this.launches.add(launch);return launch;
 }
 returnFromTest(launch:EditorTestLaunch):EditorSnapshot{if(!this.launches.has(launch))fail('editor_test_token','This test run belongs to another editor document.');return this.snapshot()}
}

export interface EditorDraftSummary{id:string;title:string;mapId:string;revision:number;documentRevision:number;updated:number;bytes:number;checksum:string}
export interface StoredEditorDraft extends EditorDraftSummary{data:Uint8Array}
function draftError(cause:unknown):RuntimeError{
 if(cause instanceof RuntimeError)return cause;const name=cause&&typeof cause==='object'&&'name' in cause?String(cause.name):'';
 if(name==='QuotaExceededError')return new RuntimeError('storage_full','Browser storage is full. Export your editor draft before choosing files to remove.',true,cause);
 if(name==='VersionError')return new RuntimeError('editor_storage_incompatible','These drafts were stored by a newer editor version. Use that version to export them.',true,cause);
 return new RuntimeError('editor_storage_unavailable','Editor draft storage is unavailable. Existing drafts have not been overwritten.',true,cause);
}
function idb<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(draftError(request.error))})}
function transactionDone(transaction:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(draftError(transaction.error));transaction.onerror=()=>{/* onabort carries the error */}})}
/** Separate bounded document storage; exportDraft remains the portable backup format. */
export class EditorDraftStore{
 private db:Promise<IDBDatabase>|undefined;
 constructor(readonly name='frontline-command-editor'){}
 private open():Promise<IDBDatabase>{
  if(this.db)return this.db;
  this.db=new Promise<IDBDatabase>((resolve,reject)=>{
   if(!globalThis.indexedDB){reject(new RuntimeError('editor_storage_unavailable','This browser does not provide local draft storage.'));return}
   const opening=indexedDB.open(this.name,2);let blocked=false;opening.onupgradeneeded=()=>{for(const store of ['drafts','summaries'])if(!opening.result.objectStoreNames.contains(store))opening.result.createObjectStore(store,{keyPath:'id'});upgradeRevisions(opening.result,opening.transaction!,[{name:'drafts'}])};
   opening.onerror=()=>reject(draftError(opening.error));opening.onblocked=()=>{blocked=true;reject(new RuntimeError('editor_storage_busy','Close another editor tab before opening this draft database.'))};
   opening.onsuccess=()=>{if(blocked){opening.result.close();return}opening.result.onversionchange=()=>{opening.result.close();this.db=undefined};resolve(opening.result)};
  }).catch(error=>{this.db=undefined;throw error});return this.db;
 }
 async close(){if(this.db)(await this.db).close();this.db=undefined}
 async list():Promise<EditorDraftSummary[]>{const db=await this.open(),records=await idb(db.transaction('summaries').objectStore('summaries').getAll()) as EditorDraftSummary[];return records.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id))}
 async get(id:string):Promise<StoredEditorDraft|undefined>{documentID(id);const db=await this.open(),record=await idb(db.transaction('drafts').objectStore('drafts').get(id)) as StoredEditorDraft|undefined;if(record&&await checksum(record.data)!==record.checksum)fail('editor_checksum','This stored draft failed its integrity check. Export its original bytes for recovery.');return record}
 async exportOriginal(id:string):Promise<Blob>{documentID(id);const db=await this.open(),record=await idb(db.transaction('drafts').objectStore('drafts').get(id)) as StoredEditorDraft|undefined;if(!record)fail('editor_draft_missing','This editor draft no longer exists.');return new Blob([record.data.slice().buffer],{type:'application/json'})}
 async put(document:MapEditorDocument,expectedRevision=0):Promise<EditorDraftSummary>{
  if(!integer(expectedRevision)||expectedRevision<0)fail('invalid_revision','Choose the draft revision you reviewed before saving.');
  const artifact=await document.exportDraft(),data=new Uint8Array(await artifact.file.arrayBuffer()),snapshot=parse(data,'Editor document');const id=document.documentId;
  const summary:EditorDraftSummary={id,title:snapshot.map.title,mapId:snapshot.map.id,revision:0,documentRevision:artifact.revision,updated:Date.now(),bytes:data.length,checksum:artifact.checksum};
  const db=await this.open(),tx=db.transaction(['drafts','summaries',REVISION_STORE],'readwrite'),done=transactionDone(tx);done.catch(()=>{});
  try{const store=tx.objectStore('drafts'),current=await idb(store.get(id)) as StoredEditorDraft|undefined;if((current?.revision??0)!==expectedRevision){tx.abort();fail('editor_draft_conflict','This draft changed in another tab. Review both versions before saving.',{current:current?{id:current.id,title:current.title,revision:current.revision,documentRevision:current.documentRevision,updated:current.updated}:undefined})}summary.revision=await reserveRevision(tx,'drafts',id,current?.revision??0);store.put({...summary,data});tx.objectStore('summaries').put(summary);await done;document.markSaved(artifact);return summary}
  catch(error){try{tx.abort()}catch{}throw draftError(error)}
 }
 async delete(id:string,expectedRevision:number){
  documentID(id);if(!integer(expectedRevision)||expectedRevision<1)fail('invalid_revision','Choose the stored draft revision before deleting.');const db=await this.open(),tx=db.transaction(['drafts','summaries',REVISION_STORE],'readwrite'),done=transactionDone(tx);done.catch(()=>{});
  try{const store=tx.objectStore('drafts'),current=await idb(store.get(id)) as StoredEditorDraft|undefined;if(!current||current.revision!==expectedRevision){tx.abort();fail('editor_draft_conflict','This draft changed after it was selected. Review it before deleting.')}await reserveRevision(tx,'drafts',id,current.revision,false);store.delete(id);tx.objectStore('summaries').delete(id);await done}catch(error){try{tx.abort()}catch{}throw draftError(error)}
 }
}
