import {Icon,Modal} from '../primitives';
import type {BattleView} from './battle-view';
const EDGES=[{label:'West',rotate:180},{label:'East',rotate:0},{label:'North',rotate:-90},{label:'South',rotate:90}];
/** Skybreaker entry-edge chooser: a compass of four keys, then three impact points on the map. */
export function EntryEdgeModal({view}:{view:BattleView}){
 const {entryEdge,setEntryEdge,control}=view;
 return entryEdge&&<Modal title="Skybreaker entry edge" onClose={()=>setEntryEdge(false)}><div className="confirm-sheet" data-hud="entry-edge"><p>Pick the map edge the aircraft fly in from. You then mark three impact points.</p><div className="edge-compass">{EDGES.map(({label,rotate},index)=><button key={label} data-edge={label.toLowerCase()} onClick={()=>{setEntryEdge(false);void control.command('ability','strategic',undefined,false,index)}}><Icon id="i-chevron-right" className={`edge-arrow r${rotate}`}/>{label}</button>)}</div></div></Modal>;
}
