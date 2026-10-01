/** One unapplied working copy per editor owner; it never becomes a saved document. */
interface MissionBuffer{documentId:string;text:string}
const buffers=new WeakMap<object,MissionBuffer>();

export function readEditorMissionBuffer(owner:object,documentId:string|undefined,source:string):string{
 const buffer=buffers.get(owner);
 return documentId&&buffer?.documentId===documentId?buffer.text:source;
}

export function writeEditorMissionBuffer(owner:object,documentId:string|undefined,text:string,source:string):void{
 if(!documentId||text===source){buffers.delete(owner);return}
 buffers.set(owner,{documentId,text});
}
