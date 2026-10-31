// Menu kit: direct fc-icons symbol reference. Unlike primitives.Icon it applies no alias map,
// so kit glyphs always match their ids.
export function KitIcon({id,className=''}:{id:string;className?:string}){
 return <svg className={`icon fcm-icon${className?` ${className}`:''}`} aria-hidden="true"><use href={`/art/ui/icons/fc-icons.svg#${id}`}/></svg>;
}
