import type {ControlBindings,InputContext,KeyboardStroke} from '../runtime/keybindings';

type QueueModifierEvent=Pick<KeyboardStroke,'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>;

/** Immediate sidebar orders use the same configured modifier/latch as keyboard and pointer orders. */
export function sidebarQueueIntent(kind:string,event:QueueModifierEvent,bindings:Pick<ControlBindings,'modifiers'>,context:Pick<InputContext,'queueLatched'>={}):boolean{
 if(!['stop','hold','return'].includes(kind))return false;
 return !!event[`${bindings.modifiers.queue}Key` as keyof QueueModifierEvent]||!!context.queueLatched;
}
