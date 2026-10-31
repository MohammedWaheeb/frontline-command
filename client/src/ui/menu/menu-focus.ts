/** Retain a home control's stable key across unmounts; never hold detached DOM nodes. */
export class MenuFocus{
 private page?:string;private homeKey?:string;
 remember(root:HTMLElement,target:HTMLElement){
  const control=target.closest<HTMLElement>('[data-menu-focus]');
  if(control&&root.contains(control))this.homeKey=control.dataset.menuFocus;
 }
 enter(root:HTMLElement,page:string,home:boolean){
  if(this.page===page)return;
  const previous=this.page;this.page=page;
  if(root.ownerDocument.querySelector('[role="dialog"],[role="alertdialog"]'))return;
  if(home){
   if(previous===undefined)return;
   const control=[...root.querySelectorAll<HTMLElement>('[data-menu-focus]')].find(node=>node.dataset.menuFocus===this.homeKey);
   (control??root.querySelector<HTMLElement>('[data-menu-focus]'))?.focus();
  }else root.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
 }
}
