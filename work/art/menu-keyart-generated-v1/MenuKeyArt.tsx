// Isolated menu candidate. Only the preview build substitutes this module.
// The existing authored diorama remains the unavailable-image fallback.
import {useState} from 'react';
import {MenuDiorama as PreviousDiorama} from './MenuDioramaPrevious';

export function MenuDiorama(){
 const [failed,setFailed]=useState(false);
 if(failed)return <PreviousDiorama/>;
 return <div data-key-art="painted-column-02" aria-hidden="true" style={{position:'absolute',inset:0,overflow:'hidden',background:'#171511'}}>
  <img alt="" src="/art/ui/main_menu_key_art-column-02.png" decoding="async" fetchPriority="high" onError={()=>setFailed(true)} style={{display:'block',width:'100%',height:'100%',objectFit:'cover',objectPosition:'68% 50%'}}/>
  <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(90deg,rgba(14,13,11,.32),transparent 54%),linear-gradient(0deg,rgba(14,13,11,.72),transparent 18%)'}}/>
 </div>;
}
