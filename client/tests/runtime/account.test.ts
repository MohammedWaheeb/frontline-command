import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalCredentialVault,LocalProfileSession} from '../../src/runtime/account';
import {LocalStore} from '../../src/runtime/storage';
import {FakeLocalHost,fixtureSave,inspectFixture} from './account-fixture';
async function hostTest(work:(host:FakeLocalHost)=>Promise<void>){const old=globalThis.fetch,host=new FakeLocalHost();globalThis.fetch=host.fetch as typeof fetch;try{await work(host)}finally{globalThis.fetch=old}}
test('guest solo needs no profile; remembered local profiles restore without appearing in state or game backups',async()=>hostTest(async host=>{
 const vault=new LocalCredentialVault('auth-private'),session=new LocalProfileSession({baseURL:host.origin,credentials:vault});assert.equal(session.state.phase,'guest');assert.equal((await session.restore()).phase,'guest');
 const files=new LocalStore('auth-game-files',inspectFixture);await files.putSave('solo','Solo',fixtureSave());await session.create('Commander');const token=(await vault.read(host.origin))!.token;assert.equal(session.state.phase,'signed-in');assert.equal(JSON.stringify(session).includes(token),false);assert.equal(JSON.stringify(session.state).includes(token),false);assert.equal((await(await files.backup()).text()).includes(token),false);
 const restored=new LocalProfileSession({baseURL:host.origin,credentials:vault});assert.equal((await restored.restore()).profile?.id,session.state.profile?.id);await restored.logout();assert.equal(await vault.read(host.origin),undefined);assert.equal((await files.listSaves()).length,1);await files.close();await vault.close();
}));
test('401 becomes a recoverable sign-in state and removes only the rejected token',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('auth-401');const credential=(await vault.read(host.origin))!;host.profiles.delete(credential.token);await assert.rejects(()=>account.authenticated(api=>api.me()),{code:'sign_in_required',recoverable:true});assert.equal(account.state.phase,'sign-in-required');assert.equal(account.context,undefined);assert.equal(await vault.read(host.origin),undefined);await vault.close();
}));
test('offline restore retains remembered credentials and a later successful service request recovers',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('auth-offline');const original=account.state.profile!.id;host.offline=true;const restored=new LocalProfileSession({baseURL:host.origin,credentials:vault});assert.equal((await restored.restore()).phase,'offline');assert.ok(await vault.read(host.origin));host.offline=false;assert.equal((await restored.authenticated(api=>api.me())).id,original);assert.equal(restored.state.phase,'signed-in');await vault.close();
}));
test('tokens are host scoped and stale logout cannot erase a newer remembered profile',async()=>hostTest(async host=>{
 const {account:first,vault}=await host.account('auth-scoped');const second=new LocalProfileSession({baseURL:host.origin,credentials:vault});await second.create('Other');await first.logout();assert.equal((await vault.read(host.origin))?.profile.id,second.state.profile?.id);
 const otherHost=new LocalProfileSession({baseURL:'http://127.0.0.1:9998',credentials:vault});assert.equal((await otherHost.restore()).phase,'guest');assert.equal((await vault.read(host.origin))?.profile.id,second.state.profile?.id);await vault.close();
}));
test('session-only sign-in clears the prior remembered credential and logout preserves gameplay files',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('auth-session-only');await account.create('Temporary',{remember:false});assert.equal(account.state.persistent,false);assert.equal(await vault.read(host.origin),undefined);await account.logout();assert.equal(account.state.phase,'guest');await vault.close();
}));
test('credential vault CAS rejects cross-tab replacement without exposing tokens in error details',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('auth-cas');const credential=(await vault.read(host.origin))!;await assert.rejects(()=>vault.write({origin:host.origin,token:'a'.repeat(64),profile:credential.profile},0),error=>{assert.equal((error as any).code,'credential_conflict');assert.equal(JSON.stringify(error).includes(credential.token),false);return true});assert.equal((await vault.read(host.origin))?.token,credential.token);await account.logout();await vault.close();
}));

test('credential revisions survive logout/recreation, rejecting stale writes and stale cleanup of the same token',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('auth-aba'),old=(await vault.read(host.origin))!;await account.logout();await vault.close();const reopened=new LocalCredentialVault('auth-aba');const next=await reopened.write(old,0);assert.equal(next.revision,old.revision+1);await assert.rejects(()=>reopened.write({...old,token:'b'.repeat(64)},old.revision),{code:'credential_conflict'});assert.equal(await reopened.remove(host.origin,old.token,old.revision),false);assert.equal((await reopened.read(host.origin))?.revision,next.revision);await reopened.close();
}));

test('schema-one credentials migrate without token loss and seed the next revision after removal',async()=>hostTest(async host=>{
 const created=await new (await import('../../src/runtime/api')).LocalAPI(host.origin).createProfile('Legacy');const record={origin:host.origin,token:created.token,profile:created.profile,revision:11};
 const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('auth-legacy',1);r.onupgradeneeded=()=>r.result.createObjectStore('credentials',{keyPath:'origin'});r.onsuccess=()=>resolve(r.result)});await new Promise<void>(resolve=>{const tx=db.transaction('credentials','readwrite');tx.objectStore('credentials').put(record);tx.oncomplete=()=>resolve()});db.close();const vault=new LocalCredentialVault('auth-legacy');assert.deepEqual(await vault.read(host.origin),record);assert.equal(await vault.remove(host.origin,record.token,11),true);assert.equal((await vault.write(record,0)).revision,12);await vault.close();
}));

test('stale session logout cannot remove the same token restored into a newer credential generation',async()=>hostTest(async host=>{
 const {account:first,vault}=await host.account('auth-same-token'),token=(await vault.read(host.origin))!.token,stale=new LocalProfileSession({baseURL:host.origin,credentials:vault});await stale.restore();await first.logout();const fresh=new LocalProfileSession({baseURL:host.origin,credentials:vault});await fresh.restoreToken(token);assert.equal((await vault.read(host.origin))?.revision,2);await stale.logout();assert.equal((await vault.read(host.origin))?.revision,2);assert.equal((await vault.read(host.origin))?.token,token);await vault.close();
}));

test('explicit private sign-in keys restore only their exact host and verified profile; never public state or backups',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('key-export-source'),files=new LocalStore('key-game-files',inspectFixture);const key=account.exportSignInKey(),value=JSON.parse(await key.text());assert.equal(value.origin,host.origin);assert.equal(value.profile_id,account.context!.profileId);assert.equal(JSON.stringify(account.state).includes(value.token),false);assert.equal((await (await files.backup()).text()).includes(value.token),false);const targetVault=new LocalCredentialVault('key-target'),target=new LocalProfileSession({baseURL:host.origin,credentials:targetVault});await target.restoreSignInKey(key,{remember:true});assert.equal(target.state.profile?.id,account.state.profile?.id);assert.equal((await targetVault.read(host.origin))?.token,value.token);
 const other=new LocalProfileSession({baseURL:'http://127.0.0.1:9998',credentials:targetVault});let calls=0;const fetch=globalThis.fetch;globalThis.fetch=(async(...args)=>{calls++;return fetch(...args)}) as typeof fetch;await assert.rejects(()=>other.restoreSignInKey(key),{code:'credential_host_mismatch'});assert.equal(calls,0);globalThis.fetch=fetch;
 await target.create('Existing');const before=target.context!.profileId;await assert.rejects(()=>target.restoreSignInKey(new Blob([JSON.stringify({...value,profile_id:'wrong-profile'})])),{code:'credential_profile_mismatch'});assert.equal(target.context!.profileId,before);assert.equal((await targetVault.read(host.origin))?.profile.id,before);await files.close();await targetVault.close();await vault.close();
}));
test('sign-in key parsing rejects malformed, oversized and unsupported files without exposing token in errors',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('key-malformed'),key=JSON.parse(await account.exportSignInKey().text()),before=account.context!.profileId;for(const file of [new Blob(['x'.repeat(2049)]),new Blob(['{bad']),new Blob([JSON.stringify({...key,version:2})]),new Blob([JSON.stringify({...key,extra:key.token})]),new Blob([JSON.stringify({...key,token:'bad'})]),new Blob([JSON.stringify({...key,origin:host.origin+'/'})])]){await assert.rejects(()=>account.restoreSignInKey(file),error=>{assert.equal(JSON.stringify(error).includes(key.token),false);return true});assert.equal(account.context!.profileId,before)}await account.logout();assert.throws(()=>account.exportSignInKey(),{code:'sign_in_required'});await vault.close();
}));

test('profile changes during asynchronous key reads reject before adopting the old exported account',async()=>hostTest(async host=>{
 const {account,vault}=await host.account('key-read-race'),key=account.exportSignInKey();let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);Object.defineProperty(key,'text',{value:async()=>{await waiting;return Blob.prototype.text.call(key)}});const restore=account.restoreSignInKey(key);await account.create('New profile');const current=account.context!.profileId;release();await assert.rejects(()=>restore,{code:'account_changed'});assert.equal(account.context!.profileId,current);assert.equal((await vault.read(host.origin))?.profile.id,current);await vault.close();
}));
