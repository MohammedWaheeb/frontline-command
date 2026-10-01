import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerTeamColor,type PublicColorOwner,type TeamPaletteScheme} from '../../src/design/team-colors';
import {tokens} from '../../src/design/tokens';

const schemes:readonly TeamPaletteScheme[]=['standard','cvd_safe'];
function expectNeutral(out:ReturnType<typeof ownerTeamColor>){
 assert.equal(out.css,tokens.color.team.relation.neutral);assert.equal(out.tint,parseInt(tokens.color.team.relation.neutral.slice(1),16));assert.equal(out.slot,null);assert.equal(out.faction,undefined);
}

test('neutral, unmatched and absent or invalid public slots never invent an owner slot',()=>{
 for(const scheme of schemes){
  expectNeutral(ownerTeamColor(0,[{id:0,faction:'IR',color:8}],scheme));
  expectNeutral(ownerTeamColor(99,[{id:1,faction:'US',color:8}],scheme));
  for(const color of [undefined,0,-1,9,1.5,NaN,Infinity])expectNeutral(ownerTeamColor(99,[{id:99,faction:'IR',color}],scheme));
 }
});

test('a valid chosen slot with unknown public faction keeps the existing scheme token',()=>{
 for(const scheme of schemes)for(const color of [1,8])for(const faction of [undefined,'UNKNOWN']){
  const out=ownerTeamColor(99,[{id:99,faction,color}],scheme),css=tokens.color.team[scheme][color-1]!;
  assert.equal(out.css,css);assert.equal(out.tint,parseInt(css.slice(1),16));assert.equal(out.slot,color);assert.equal(out.faction,undefined);
 }
});

test('same-faction owners retain actual chosen slots and do not depend on roster order or owner number',()=>{
 const rows:readonly PublicColorOwner[]=Object.freeze([Object.freeze({id:1,faction:'IR',color:8}),Object.freeze({id:99,faction:'IR',color:3})]);
 for(const scheme of schemes){
  const first=ownerTeamColor(1,rows,scheme),second=ownerTeamColor(99,rows,scheme);
  assert.equal(first.slot,8);assert.equal(second.slot,3);assert.equal(first.faction,'IR');assert.equal(second.faction,'IR');
  assert.notEqual(first.css,second.css);
  assert.deepEqual(ownerTeamColor(99,[rows[1],rows[0]],scheme),second);
  assert.deepEqual(ownerTeamColor(1,[rows[1],rows[0]],scheme),first);
 }
});

test('the selector reads only the allowed public identity fields, including when records are accessors',()=>{
 const reads:string[]=[];
 const guarded=new Proxy(Object.freeze({id:99,faction:'SA',color:8}),{
  get(target,key,receiver){
   if(key!=='id'&&key!=='faction'&&key!=='color')throw Error(`Forbidden owner-colour read: ${String(key)}`);
   reads.push(key);return Reflect.get(target,key,receiver);
  },
  set(){throw Error('Public colour record mutation');}
 }) as PublicColorOwner;
 for(const scheme of schemes){
  const out=ownerTeamColor(99,Object.freeze([guarded]),scheme);
  assert.equal(out.slot,8);assert.equal(out.faction,'SA');
 }
 assert.ok(reads.includes('id')&&reads.includes('faction')&&reads.includes('color'));
});

test('private data, player team and model prefixes cannot override the disclosed owner colour',()=>{
 const publicRow={id:99,faction:'US',color:8};
 const row=Object.defineProperties({...publicRow},{
  private:{get(){throw Error('Private entity read');}},
  economy:{get(){throw Error('Owner economy read');}},
  upgrades:{get(){throw Error('Private upgrades read');}},
  team:{get(){throw Error('Diplomacy belongs to the separate public relation selector');}},
  type:{get(){throw Error('Physical actor type is not an owner faction');}},
  footprintType:{get(){throw Error('Captured physical art is not an owner faction');}},
  viewerFaction:{get(){throw Error('Viewer faction is not an owner faction');}},
 });
 for(const scheme of schemes)assert.deepEqual(ownerTeamColor(99,[row],scheme),ownerTeamColor(99,[publicRow],scheme));
});

test('owner tint is stable across viewer perspectives while only current public rows are supplied',()=>{
 const players:readonly PublicColorOwner[]=[{id:1,faction:'US',color:8},{id:99,faction:'IR',color:3}];
 const ownerView={player:99,players},enemyView={player:1,players:[players[1],players[0]]};
 for(const scheme of schemes)assert.deepEqual(ownerTeamColor(99,ownerView.players,scheme),ownerTeamColor(99,enemyView.players,scheme));
});

test('a fresh snapshot or session must replace the chosen slot without mutating earlier public inputs',()=>{
 const prior=Object.freeze([Object.freeze({id:99,faction:'SY',color:3})]);
 const current=Object.freeze([Object.freeze({id:99,faction:'SY',color:8})]);
 for(const scheme of schemes){
  const before=ownerTeamColor(99,prior,scheme),after=ownerTeamColor(99,current,scheme);
  assert.equal(before.slot,3);assert.equal(after.slot,8);assert.notEqual(before.css,after.css);
  assert.deepEqual(ownerTeamColor(99,prior,scheme),before);
 }
 assert.deepEqual(prior,[{id:99,faction:'SY',color:3}]);assert.deepEqual(current,[{id:99,faction:'SY',color:8}]);
});

test('capture recolours through the current public owner while the retained physical Model is irrelevant',()=>{
 const players:readonly PublicColorOwner[]=[{id:1,faction:'US',color:8},{id:99,faction:'IR',color:3}];
 const captured={owner:99,get type():string{throw Error('Producer role must not select owner colour');},get footprintType():string{throw Error('Retained workshop Model must not select owner colour');},get private():never{throw Error('Owner-private capture state must not select colour');}};
 for(const scheme of schemes){
  const oldOwner=ownerTeamColor(1,players,scheme),newOwner=ownerTeamColor(captured.owner,players,scheme);
  assert.equal(oldOwner.faction,'US');assert.equal(oldOwner.slot,8);assert.equal(newOwner.faction,'IR');assert.equal(newOwner.slot,3);assert.notEqual(oldOwner.css,newOwner.css);
 }
});
