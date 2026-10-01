import {Observable} from './store';
import {LocalAPI,type AdminReport,type ReportDetail,type ReportReview,type MapReport,type MapReportDetail,type MapReview} from '../runtime/api';
import {RuntimeError} from '../runtime/errors';

export interface ModerationState{
 host:string;available:boolean;unlocked:boolean;busy?:string;error?:{code:string;message:string};
 mapReports:MapReport[];mapCursor:string;mapDetail?:MapReportDetail;
 status:'all'|'pending'|'reviewed';reports:AdminReport[];cursor:string;detail?:ReportDetail;notice?:string;
}
export function isLoopbackHost(value:string){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&['localhost','127.0.0.1','[::1]'].includes(url.hostname.toLowerCase())}catch{return false}}
/** Separate operator context. The bearer never enters observable state or storage. */
export class ModerationController{
 readonly state=new Observable<ModerationState>({host:'',available:false,unlocked:false,status:'pending',reports:[],cursor:'',mapReports:[],mapCursor:''});
 #api?:LocalAPI;private generation=0;private disposed=false;
 private patch(change:Partial<ModerationState>){if(!this.disposed)this.state.update(value=>({...value,...change}))}
 setHost(host:string){this.lock();this.patch({host,available:isLoopbackHost(host)})}
 lock(){this.generation++;if(this.#api)this.#api.token='';this.#api=undefined;this.patch({unlocked:false,busy:undefined,error:undefined,reports:[],cursor:'',detail:undefined,mapReports:[],mapCursor:'',mapDetail:undefined,notice:undefined})}
 clearError(){this.patch({error:undefined})}
 private async run(label:string,operation:(api:LocalAPI,current:()=>boolean)=>Promise<void>){
  if(this.disposed||this.state.get().busy)return false;const api=this.#api,generation=this.generation,current=()=>!this.disposed&&generation===this.generation&&api===this.#api;
  if(!api){this.patch({error:{code:'operator_locked',message:'Unlock the local operator station first.'}});return false}
  this.patch({busy:label,error:undefined});try{await operation(api,current);return current()}catch(error){if(current()){const value=RuntimeError.from(error);if(value.code==='unauthorized'||value.code==='admin_unauthorized'||('status' in value&&(value.status===401||value.status===403)))this.lock();this.patch({error:{code:value.code,message:value.message}})}return false}finally{if(current())this.patch({busy:undefined})}
 }
 async unlock(token:string){
  if(!this.state.get().available){this.patch({error:{code:'operator_loopback_only',message:'Open this game on the host computer at localhost or 127.0.0.1 to review reports.'}});return false}
  if(!/^[a-f0-9]{64}$/.test(token)){this.patch({error:{code:'operator_token_invalid',message:'Enter the 64-character credential from this host’s moderator.token file.'}});return false}
  this.lock();this.#api=new LocalAPI(this.state.get().host,token);
  return this.run('Verifying local operator…',async(api,current)=>{const page=await api.adminReports();if(current())this.patch({unlocked:true,reports:page.reports,cursor:page.next_cursor,status:'pending'})});
 }
 list(status:ModerationState['status']=this.state.get().status,more=false){return this.run('Loading incident reports…',async(api,current)=>{const page=await api.adminReports(status,more?this.state.get().cursor:undefined);if(current())this.patch({status,reports:more?[...this.state.get().reports,...page.reports]:page.reports,cursor:page.next_cursor})})}
 select(id:string){return this.run('Opening incident evidence…',async(api,current)=>{const detail=await api.adminReport(id);if(current())this.patch({detail})})}
 olderReviews(){return this.run('Loading earlier reviews…',async(api,current)=>{const selected=this.state.get().detail;if(!selected?.reviews.length)return;const before=Math.min(...selected.reviews.map(value=>value.revision)),detail=await api.adminReport(selected.report.id,before);if(current())this.patch({detail:{...detail,reviews:[...selected.reviews,...detail.reviews]}})})}
 review(decision:ReportReview['decision'],note:string){return this.run('Recording operator decision…',async(api,current)=>{
  const selected=this.state.get().detail;if(!selected)throw new RuntimeError('report_required','Open a report before reviewing it.');
  await api.reviewReport(selected.report.id,decision,note,selected.report.revision);if(!current())return;
  const detail=await api.adminReport(selected.report.id);if(current())this.patch({detail,reports:this.state.get().reports.map(value=>value.id===detail.report.id?detail.report:value),notice:'Decision recorded in this host’s append-only review history.'});
 })}
 listMaps(status:ModerationState['status']='all',more=false){return this.run('Loading map reports…',async(api,current)=>{const page=await api.adminMapReports(status,more?this.state.get().mapCursor:undefined);if(current())this.patch({mapReports:more?[...this.state.get().mapReports,...page.reports]:page.reports,mapCursor:page.next_cursor})})}
 selectMap(id:string){return this.run('Opening preserved map evidence…',async(api,current)=>{const mapDetail=await api.adminMapReport(id);if(current())this.patch({mapDetail})})}
 olderMapReviews(){return this.run('Loading earlier map decisions…',async(api,current)=>{const selected=this.state.get().mapDetail;if(!selected?.reviews.length)return;const detail=await api.adminMapReport(selected.report.id,Math.min(...selected.reviews.map(value=>value.revision)));if(current())this.patch({mapDetail:{...detail,reviews:[...selected.reviews,...detail.reviews]}})})}
 reviewMap(decision:MapReview['decision'],note:string){return this.run('Recording map decision…',async(api,current)=>{const selected=this.state.get().mapDetail;if(!selected)throw new RuntimeError('report_required','Open a map report first.');await api.reviewMapReport(selected.report.id,decision,note,selected.report.revision,selected.current_map.revision);if(!current())return;const mapDetail=await api.adminMapReport(selected.report.id);if(current())this.patch({mapDetail,mapReports:this.state.get().mapReports.map(value=>value.id===mapDetail.report.id?mapDetail.report:value),notice:decision==='restored'?'Map restored as private. Its author must explicitly publish it again.':'Map review recorded. Existing admitted matches retain their original battlefield.'})})}
 async replayEvidence():Promise<{bytes:Uint8Array;filename:string}|undefined>{let result:{bytes:Uint8Array;filename:string}|undefined;await this.run('Downloading report replay…',async(api,current)=>{const selected=this.state.get().detail;if(!selected)throw new RuntimeError('report_required','Open a report first.');const bytes=await api.reportReplay(selected.report.id);if(current())result={bytes,filename:`report-${selected.report.id}.replay`}});return result}
 dispose(){this.lock();this.disposed=true}
}
