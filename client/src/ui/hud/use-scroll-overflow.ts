// Mechanical split of the former App.tsx (revamp-00). Keep CSS classes, DOM and accessible names stable.
import {useEffect} from 'react';
/** Hidden content above/below a scroll well, as [above, below]. */
export type OverflowCount=(scroller:HTMLElement)=>readonly [number,number];
/** Command keys whose rectangles lie outside the well. */
export const hiddenKeys:OverflowCount=grid=>{const box=grid.getBoundingClientRect();let up=0,down=0;for(const key of Array.from(grid.children)){const rect=key.getBoundingClientRect();if(rect.top<box.top-1)up++;else if(rect.bottom>box.bottom+1)down++}return [up,down]};
/** Presence (1 or 0) of clipped scroll extent at each edge. */
export const hiddenExtent:OverflowCount=node=>[node.scrollTop>1?1:0,node.scrollHeight-node.clientHeight-node.scrollTop>1?1:0];
/** Marks hidden content on a scroll well's cue: `data-count` on the cue's
 * `.more-above`/`.more-below`, `data-overflow` on the well and the well's height as
 * `--fc-overflow-h` on the cue. Measures at most once per frame after a resize of
 * the well or a direct child, a child-list change or a scroll; writes DOM
 * attributes only, never React state. A `focusable` well is a tab stop only while
 * it actually scrolls (a focused well keeps its stop until it loses focus). */
export function useScrollOverflow(scroller:HTMLElement|null,cue:HTMLElement|null,count:OverflowCount,focusable=false){
 useEffect(()=>{
  if(!scroller||!cue)return;
  const above=cue.querySelector<HTMLElement>('.more-above'),below=cue.querySelector<HTMLElement>('.more-below');let frame=0;
  const mark=(node:HTMLElement|null,value:number)=>{if(value)node?.setAttribute('data-count',String(value));else node?.removeAttribute('data-count')};
  const measure=()=>{frame=0;const [up,down]=count(scroller);mark(above,up);mark(below,down);const state=up&&down?'both':up?'above':down?'below':'';if(state)scroller.dataset.overflow=state;else delete scroller.dataset.overflow;
   cue.style.setProperty('--fc-overflow-h',`${scroller.offsetHeight}px`);
   if(focusable){if(scroller.scrollHeight>scroller.clientHeight+1)scroller.tabIndex=0;else if(document.activeElement!==scroller)scroller.removeAttribute('tabindex')}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};
  const resize=new ResizeObserver(schedule);resize.observe(scroller);for(const child of Array.from(scroller.children))resize.observe(child);
  const mutation=new MutationObserver(records=>{for(const record of records){record.removedNodes.forEach(node=>{if(node instanceof Element)resize.unobserve(node)});record.addedNodes.forEach(node=>{if(node instanceof Element)resize.observe(node)})}schedule()});
  mutation.observe(scroller,{childList:true});scroller.addEventListener('scroll',schedule,{passive:true});scroller.addEventListener('blur',schedule);schedule();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();scroller.removeEventListener('scroll',schedule);scroller.removeEventListener('blur',schedule);mark(above,0);mark(below,0);delete scroller.dataset.overflow;cue.style.removeProperty('--fc-overflow-h');if(focusable)scroller.removeAttribute('tabindex')};
 },[scroller,cue,count,focusable]);
}
