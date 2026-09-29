import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MenuDiorama as Candidate} from 'candidate/ui/MenuDiorama';
import {MenuDiorama as Legacy} from 'legacy/ui/MenuDiorama';
import {art} from 'candidate/render/art';
import {decodeContentIndex} from 'candidate/runtime/content-library';

const root=createRoot(document.getElementById('root')!);
const scopes:Array<{key:string;signal:AbortSignal}>=[];
const capture=art.readScope.bind(art);
art.readScope=async(...args:Parameters<typeof capture>)=>{const scope=await capture(...args);scopes.push({key:scope.identity.key,signal:scope.signal});return scope};
const nextTurn=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const observe=()=>({generation:art.generationIdentity?.key,resources:art.generationStatistics,scopes:scopes.map(value=>({key:value.key,aborted:value.signal.aborted})),canvases:document.querySelectorAll('canvas').length,ready:document.querySelector('canvas')?.dataset.ready,painted:document.querySelector<HTMLImageElement>('.menu-keyart img')?.complete??false,paintedSource:document.querySelector<HTMLImageElement>('.menu-keyart img')?.src});
let token:ReturnType<typeof decodeContentIndex>|undefined;
const api={
 async mount(kind:'candidate'|'legacy'){
  if(kind==='legacy'){flushSync(()=>root.render(<Legacy/>));await nextTurn();return observe()}
  const response=await fetch('/content/index.json');if(!response.ok)throw Error('Fixture index unavailable');const source=new Uint8Array(await response.arrayBuffer());
  await art.useIndex(source);token=decodeContentIndex(source);flushSync(()=>root.render(<Candidate generation={token}/>));await nextTurn();return observe();
 },
 async retry(){return api.mount('candidate')},
 async clear(){flushSync(()=>root.render(null));await nextTurn();return observe()},
 observe,
 canvasPixels(){const node=document.querySelector('canvas');if(!node)throw Error('No menu canvas');return {width:node.width,height:node.height,data:node.toDataURL()}},
 async dispose(){flushSync(()=>root.unmount());await art.dispose();return observe()},
};
(window as unknown as {menuQA:typeof api}).menuQA=api;
