import {randomUUID} from '../runtime/crypto';
import {MapEditorDocument,EditorDraftStore,type EditorSnapshot,type EditorValidation,type EditorDraftSummary,type EditorTransaction,type EditorTestLaunch,type JSONDocument,type EditorPreviewRequest,type EditorPreviewResult} from '../runtime';
import {Observable} from './store';
import type {Application} from './application';
export interface EditorState{snapshot?:EditorSnapshot;validation?:EditorValidation;drafts:EditorDraftSummary[];storedRevision:number;testActive:boolean;preview?:EditorPreviewResult;previewRequest?:EditorPreviewRequest}
/** Keeps authoring edits outside the simulation and preserves them across test play. */
export class EditorController{
 readonly state=new Observable<EditorState>({drafts:[],storedRevision:0,testActive:false});readonly drafts=new EditorDraftStore();private document?:MapEditorDocument;private test?:EditorTestLaunch;private previewGeneration=0;
 constructor(private readonly app:Application){}
 private patch(change:Partial<EditorState>){this.state.update(state=>({...state,...change}))}
 private validators(){return {validateMap:(data:Uint8Array)=>this.app.validator.validateMap(data),validateMission:(map:Uint8Array,mission:Uint8Array)=>this.app.validator.validateMission(map,mission)}}
 async refresh(){this.patch({drafts:await this.drafts.list()})}
 private async preserve(){if(this.document?.dirty)await this.save()}
 async fromInstalled(id:string){await this.preserve();const loaded=await this.app.library.loadMap(id),map=structuredClone(loaded.map);map.id=`custom-${randomUUID().slice(0,12)}`;map.title=`${map.title} — custom`;map.author='Local commander';map.version='1.0.0';this.document=new MapEditorDocument({map},this.validators());this.patch({snapshot:this.document.snapshot(),storedRevision:0,validation:undefined,testActive:false,preview:undefined,previewRequest:undefined});await this.save()}
 async import(file:File){await this.preserve();if(file.size>20*1024*1024)throw Error('Editor imports must be no larger than20MiB.');const bytes=new Uint8Array(await file.arrayBuffer());try{const value=JSON.parse(new TextDecoder().decode(bytes));const imported=value.format==='frontline-editor-document'?await MapEditorDocument.importDraft(bytes,this.validators()):await MapEditorDocument.importMap(bytes,this.validators());const snapshot=imported.snapshot();this.document=new MapEditorDocument({map:snapshot.map,mission:snapshot.mission,presentation:snapshot.presentation},this.validators());this.patch({snapshot:this.document.snapshot(),storedRevision:0,validation:undefined,testActive:false,preview:undefined,previewRequest:undefined});await this.save()}catch(error){await this.app.store.preserveRecovery(file,file.name.slice(0,100),error instanceof Error?error.message:'Editor import failed');throw error}}
 async open(id:string){await this.preserve();const record=await this.drafts.get(id);if(!record)throw Error('The draft no longer exists.');this.document=await MapEditorDocument.importDraft(record.data,this.validators());this.patch({snapshot:this.document.snapshot(),storedRevision:record.revision,validation:undefined,testActive:false,preview:undefined,previewRequest:undefined})}
 edit(label:string,change:(edit:EditorTransaction)=>void){if(!this.document)return;this.document.transact(label,change);this.patch({snapshot:this.document.snapshot(),validation:undefined,preview:undefined,previewRequest:undefined})}
 undo(){this.document?.undo();this.patch({snapshot:this.document?.snapshot(),validation:undefined,preview:undefined,previewRequest:undefined})}
 redo(){this.document?.redo();this.patch({snapshot:this.document?.snapshot(),validation:undefined,preview:undefined,previewRequest:undefined})}
 async save(){if(!this.document)return;const record=await this.drafts.put(this.document,this.state.get().storedRevision);this.patch({storedRevision:record.revision,snapshot:this.document.snapshot()});await this.refresh()}
 async validate(){if(!this.document)return;this.patch({validation:await this.document.validate()})}
 async preview(request:EditorPreviewRequest){if(!this.document)return;const document=this.document,revision=document.revision,generation=++this.previewGeneration;const result=await this.app.validator.previewEditor(new TextEncoder().encode(JSON.stringify(document.snapshot().map)),request);if(this.document!==document||document.revision!==revision||generation!==this.previewGeneration)return;this.patch({preview:result,previewRequest:structuredClone(request)})}
 clearPreview(){this.previewGeneration++;this.patch({preview:undefined,previewRequest:undefined})}
 async export(kind:'draft'|'map'|'mission'){if(!this.document)throw Error('Choose an editor draft first.');return kind==='draft'?this.document.exportDraft():kind==='map'?this.document.exportMap():this.document.exportMission()}
 async testPlay(){if(!this.document)return;await this.save();const launch=await this.document.prepareTest({seed:crypto.getRandomValues(new Uint32Array(1))[0]||1});await this.app.sessions.startSolo(launch.config);this.test=launch;this.patch({testActive:true})}
 finishTest(){if(!this.test||!this.document)return false;this.patch({snapshot:this.document.returnFromTest(this.test),testActive:false});this.test=undefined;return true}
 setMission(text:string){const value:JSONDocument|undefined=text.trim()?JSON.parse(text):undefined;this.edit('Edit mission triggers',edit=>edit.setMission(value))}
 dispose(){void this.drafts.close()}
}
