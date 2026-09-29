import {Container,Graphics,Text} from 'pixi.js';
import type {ActorStatusModel,StatusTone} from '../app/actor-status';

const PAINT:Record<StatusTone,number>={neutral:0xc6bfa8,benefit:0xbacb89,warning:0xe0b761,critical:0xf19d79};
interface Label {root:Container;back:Graphics;text:Text}

/** Compact command-field insignia. Timing is precomputed from Go ticks; these
 * labels neither animate nor flash and have no cosmetic particle budget. */
export class ActorStatusOverlay {
 readonly root=new Container();private readonly bars=new Graphics();private labels:Label[]=[];private key='';
 constructor(){this.root.eventMode='none';this.root.visible=false;this.root.addChild(this.bars)}
 private label(index:number):Label {
  while(this.labels.length<=index){
   const root=new Container(),back=new Graphics(),text=new Text({text:'',style:{fontFamily:'Arial,sans-serif',fontSize:10,fontWeight:'bold',fill:0xe8deba}});
   root.addChild(back,text);this.root.addChild(root);this.labels.push({root,back,text});
  }
  return this.labels[index];
 }
 draw(model:ActorStatusModel|undefined,selected:boolean,zoom:number){
  this.root.scale.set(1/Math.max(.1,zoom));
  this.root.visible=!!model&&(model.badges.length>0||selected&&!!(model.ammunition||model.channel));
  const key=JSON.stringify([model,selected]);if(key===this.key)return;this.key=key;
  this.bars.clear();for(const node of this.labels)node.root.visible=false;
  if(!model)return;
  const badges=selected?model.badges.slice(0,3):model.badges.slice(0,4);
  let row=0,index=0;
  const caption=(text:string,tone:StatusTone,top:number)=>{
   const node=this.label(index++);node.root.visible=true;node.text.text=text;node.text.style.fill=PAINT[tone];
   const width=Math.ceil(node.text.width)+8;node.text.position.set(4,2);node.back.clear().rect(0,0,width,14).fill({color:0x161711,alpha:.94}).stroke({width:.7,color:PAINT[tone],alpha:.65});node.root.position.set(-width/2,top);
  };
  if(selected){
   if(model.ammunition){
    const a=model.ammunition,known=a.capacity!==undefined;
    caption(`${a.label} ${a.current}${known?`/${a.capacity}`:''}`,'neutral',row);row-=17;
    if(a.capacity!==undefined&&a.capacity<=12){
     const capacity=a.capacity,width=capacity*5-1;
     for(let n=0;n<capacity;n++)this.bars.rect(n*5-width/2,row+11,4,3).fill({color:n<a.current?0xd8bd78:0x615f4d});
     row-=5;
    }
   }
   if(model.channel){
    caption(`${model.channel.label} ${model.channel.seconds}s`,'warning',row);row-=17;
    this.bars.rect(-27,row+11,54,3).fill({color:0x24251d}).rect(-27,row+11,54*model.channel.progress/1000,3).fill({color:0xe0b761});row-=5;
   }
   for(const badge of badges){caption(`${badge.symbol} ${badge.label}${badge.seconds!==undefined?` ${badge.seconds}s`:''}`,badge.tone,row);row-=17}
   if(model.badges.length>badges.length)caption(`+${model.badges.length-badges.length} effects`,'neutral',row);
  }else{
   const total=badges.length*17-2;
   for(const [i,badge] of badges.entries()){
    const node=this.label(index++);node.root.visible=true;node.text.text=badge.symbol;node.text.style.fill=PAINT[badge.tone];
    node.text.position.set((15-node.text.width)/2,1);node.back.clear().rect(0,0,15,14).fill({color:0x161711,alpha:.94}).stroke({width:.7,color:PAINT[badge.tone],alpha:.75});node.root.position.set(i*17-total/2,0);
   }
  }
 }
 get diagnostics(){return {labels:this.labels.filter(n=>n.root.visible).length,allocated:this.labels.length}}
 dispose(){this.root.destroy({children:true});this.labels.length=0;this.key=''}
}
