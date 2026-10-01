import type {Application,ApplicationState} from '../app/application';
/** The coordinator decides whether a retry succeeds; its Promise also resolves on a repeated storage failure. */
export function AutosaveRecovery({app,state}:{app:Application;state:ApplicationState}){
 if(!['solo','practice'].includes(state.session.kind??'')||!['blocked','waiting'].includes(state.autosave??''))return null;
 const session=state.session.id;
 return <div className="autosave-recovery"><p className="network-warning" role="status">{state.autosaveError??'Autosave could not complete. Previous saves are preserved.'}</p><button onClick={()=>void app.task('Retrying autosave…',async()=>{if(app.sessions.state.id!==session)return;await app.sessions.retryAutosave()})}>Retry autosave</button></div>;
}
