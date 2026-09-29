import {useSyncExternalStore} from 'react';

/** Minimal observable value for React. Battlefield objects never flow through it per frame. */
export class Observable<T>{
 private listeners=new Set<()=>void>();
 constructor(private value:T){}
 get():T{return this.value}
 set(next:T){if(Object.is(next,this.value))return;this.value=next;for(const l of [...this.listeners])l()}
 update(fn:(value:T)=>T){this.set(fn(this.value))}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
}
export function useObservable<T>(o:Observable<T>):T{return useSyncExternalStore(o.subscribe,()=>o.get(),()=>o.get())}
