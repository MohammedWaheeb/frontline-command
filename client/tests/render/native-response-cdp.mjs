import {nativeResponseTrace, reconcileNativeResponses} from './native-response-trace.mjs';

// Passive Chromium page-target ledger. No response interception/body reads.
export class NativeResponseCDPLedger {
 constructor({targetId, observerURL, limit = 100000}) {
  this.targetId = targetId; this.observerURL = observerURL; this.limit = limit;
  this.contexts = new Map(); this.scripts = new Map(); this.requests = new Map(); this.documents = new Map();
  this.failures = []; this.faults = []; this.captureFailures = []; this.order = 0;
 }
 fault(message) {if (this.faults.length < 32) this.faults.push(message);}
 event(name, value, stamp = {}) {
  this.order++;
  if (name === 'Runtime.executionContextCreated') {
   const context = value.context; this.contexts.set(context.id, {id: context.id, uniqueId: context.uniqueId, frameId: context.auxData?.frameId, isDefault: context.auxData?.isDefault === true, active: true});
  } else if (name === 'Runtime.executionContextDestroyed') {
   const context = this.contexts.get(value.executionContextId); if (context) context.active = false;
  } else if (name === 'Runtime.executionContextsCleared') {
   for (const context of this.contexts.values()) context.active = false;
  } else if (name === 'Debugger.scriptParsed') {
   if (this.scripts.size >= this.limit) {this.fault('script-limit'); return;}
   if (this.scripts.has(value.scriptId)) {this.fault('duplicate-script-id'); return;}
   this.scripts.set(value.scriptId, {url: value.url, context: this.contexts.get(value.executionContextId)});
  } else if (name === 'Runtime.bindingCalled') {
   if (value.name !== '__frontlineNativeResponseBinding') return;
   let payload; try {payload = JSON.parse(value.payload);} catch {this.fault('invalid-binding-json'); return;}
   const context = this.contexts.get(value.executionContextId);
   if (!context?.active || !context.isDefault || !context.frameId || typeof payload.scope !== 'string' || !payload.scope) {this.fault('unproven-binding-context'); return;}
   if (context.scope && context.scope !== payload.scope) {this.fault('document-scope-changed'); return;}
   context.scope = payload.scope;
   let doc = this.documents.get(payload.scope);
   if (doc && doc.context !== context) {this.fault('reused-document-scope'); return;}
   if (!doc) {
    doc = {scope: payload.scope, context, records: new Map(), faults: [], overflow: 0, snapshots: [], declared: false}; this.documents.set(payload.scope, doc);
   }
   if (payload.type === 'document') {doc.declared = true; doc.url = payload.url;}
   else if (payload.type === 'record') {doc.lastRecordOrder = this.order; this.record(doc, payload.record);}
   else if (payload.type === 'snapshot') {
    const snapshot = payload.snapshot;
    if (snapshot?.scope !== doc.scope || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.faults)) {this.fault('invalid-snapshot'); return;}
    for (const record of snapshot.records) this.record(doc, record);
    doc.faults.push(...snapshot.faults); doc.overflow = Math.max(doc.overflow, snapshot.overflow || 0); doc.snapshots.push({reason: payload.reason, order: this.order, records: snapshot.records.length});
   } else this.fault('unknown-binding-message');
  } else if (name === 'Network.requestWillBeSent') {
   if (this.requests.size >= this.limit) {this.fault('request-limit'); return;}
   const prior = this.requests.get(value.requestId);
   if (prior) {prior.redirected = true; prior.redirectChain ??= []; prior.redirectChain.push(value.request.url); return;}
   const scriptIds = []; let stack = value.initiator?.stack;
   while (stack) {for (const frame of stack.callFrames ?? []) scriptIds.push(frame.scriptId); stack = stack.parent;}
   this.requests.set(value.requestId, {id: `${this.targetId}:${value.requestId}`, nativeRequestId: value.requestId, url: value.request.url, method: value.request.method, type: value.type, frameId: value.frameId, loaderId: value.loaderId, documentURL: value.documentURL, initiator: value.initiator?.type, scriptIds, redirected: !!value.redirectResponse, order: this.order, stamp});
  } else if (name === 'Network.responseReceived') {
   const request = this.requests.get(value.requestId); if (!request) return;
   Object.assign(request, {status: value.response.status, responseURL: value.response.url, fromServiceWorker: value.response.fromServiceWorker, responseOrder: this.order});
  } else if (name === 'Network.loadingFinished') {
   const request = this.requests.get(value.requestId); if (request) request.finishedOrder = this.order;
  } else if (name === 'Network.loadingFailed') {
   const request = this.requests.get(value.requestId);
   this.failures.push({requestId: `${this.targetId}:${value.requestId}`, url: request?.url, message: value.errorText, canceled: value.canceled, blockedReason: value.blockedReason, order: this.order, ...stamp});
  }
 }
 record(doc, record) {
  if (doc.records.size >= this.limit) {this.fault('record-limit'); return;}
  if (!record || record.scope !== doc.scope || typeof record.url !== 'string' || typeof record.method !== 'string' || !Number.isInteger(record.ordinal) || record.ordinal < 1 || !Number.isInteger(record.updatedOrder)) {this.fault('invalid-native-record'); return;}
  const key = JSON.stringify([record.url, record.method, record.ordinal]), prior = doc.records.get(key);
  if (!prior || record.updatedOrder >= prior.updatedOrder) doc.records.set(key, {...record});
 }
 snapshot() {
  const network = [], ordinals = new Map();
  for (const request of this.requests.values()) {
   const contexts = new Set(request.scriptIds.map(id => this.scripts.get(id)).filter(script => script?.url === this.observerURL).map(script => script.context).filter(Boolean));
   const context = contexts.size === 1 ? [...contexts][0] : undefined, document = context?.scope ? this.documents.get(context.scope) : undefined;
   const proven = request.type === 'Fetch' && request.initiator === 'script' && context?.isDefault && context.frameId === request.frameId && document?.declared && document.context === context;
   const row = {...request, realm: proven ? 'window-fetch' : 'unproven', scope: proven ? context.scope : undefined, proof: proven ? {targetId: this.targetId, executionContextId: context.id, executionContextUniqueId: context.uniqueId, frameId: context.frameId, observerURL: this.observerURL} : undefined};
   if (proven) {const key = JSON.stringify([row.scope, row.method, row.url]), ordinal = (ordinals.get(key) ?? 0) + 1; ordinals.set(key, ordinal); row.ordinal = ordinal;}
   network.push(row);
  }
  const traces = [...this.documents.values()].map(doc => {
   const last = doc.snapshots.at(-1), complete = last && last.reason !== 'installed' && last.records >= doc.records.size && last.order >= (doc.lastRecordOrder ?? 0);
   return {scope: doc.scope, records: [...doc.records.values()], faults: [...doc.faults, ...this.faults, ...(!complete ? ['missing-final-document-snapshot'] : [])], overflow: doc.overflow, snapshots: doc.snapshots, declared: doc.declared, url: doc.url};
  });
  return {targetId: this.targetId, observerURL: this.observerURL, faults: [...this.faults], captureFailures: [...this.captureFailures], network, failures: [...this.failures], traces};
 }
}

export async function installNativeResponseCDP(page, {caseId, origin, stamp = () => ({})}) {
 const session = await page.context().newCDPSession(page), info = await session.send('Target.getTargetInfo');
 if (info.targetInfo.type !== 'page') throw Error('Native tracing requires an actual page target.');
 // sourceURL is a debugger identity only; no request is made to this label.
 const observerURL = new URL(`__diagnostics__/native-response-observer-${caseId}.js`, origin + '/').href, ledger = new NativeResponseCDPLedger({targetId: info.targetInfo.targetId, observerURL});
 for (const event of ['Runtime.executionContextCreated', 'Runtime.executionContextDestroyed', 'Runtime.executionContextsCleared', 'Runtime.bindingCalled', 'Debugger.scriptParsed', 'Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed']) session.on(event, value => ledger.event(event, value, stamp()));
 await session.send('Runtime.enable'); await session.send('Debugger.enable'); await session.send('Network.enable'); await session.send('Page.enable');
 await session.send('Runtime.addBinding', {name: '__frontlineNativeResponseBinding'});
 const source = `(() => {
  const observe = ${nativeResponseTrace.toString()};
  const scope = ${JSON.stringify(caseId)} + ':' + crypto.randomUUID();
  const emit = payload => window.__frontlineNativeResponseBinding(JSON.stringify({scope,...payload}));
  emit({type:'document',url:location.href});
  const observer = observe(window.fetch,{scope,baseURL:location.href,limit:20000,onRecord:record=>emit({type:'record',record})});
  window.fetch = observer.fetch;
  const snapshot = reason => emit({type:'snapshot',reason,snapshot:observer.snapshot()});
  window.__frontlineNativeTrace = {snapshot};
  window.addEventListener('pagehide',()=>snapshot('pagehide'));
  snapshot('installed');
 })();\n//# sourceURL=${observerURL}`;
 await session.send('Page.addScriptToEvaluateOnNewDocument', {source});
 return {ledger, source, async capture(reason) {
  try {
   const result = await session.send('Runtime.evaluate', {expression: `(() => {if(!window.__frontlineNativeTrace)throw Error('Native response observer not installed');window.__frontlineNativeTrace.snapshot(${JSON.stringify(reason)});return true})()`, returnByValue: true});
   if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
   // A protocol round trip drains earlier binding callbacks without sleeping or
   // altering application state. No reader/abort/pending operation is advanced.
   await session.send('Runtime.evaluate', {expression: '0', returnByValue: true});
  } catch (error) {ledger.captureFailures.push({reason, error: String(error)});}
 }};
}

export function reconcileCDPTraces({ledgers, playwrightFailures, served, expected}) {
 const snapshots = ledgers.map(ledger => ledger.snapshot()), network = snapshots.flatMap(value => value.network), failures = snapshots.flatMap(value => value.failures), traces = snapshots.flatMap(value => value.traces);
 const counts = values => {const map = new Map(); for (const value of values) {const key = JSON.stringify([value.url, value.message]); map.set(key, (map.get(key) ?? 0) + 1);} return [...map].sort(([a], [b]) => a.localeCompare(b));};
 const nativeCounts = counts(failures), playwrightCounts = counts(playwrightFailures);
 const result = reconcileNativeResponses({engine: 'chromium', failures, network, traces, served, expected});
 return {...result, afterBrowserClose: true, snapshots, nativeCounts, playwrightCounts, diagnosticsAgree: JSON.stringify(nativeCounts) === JSON.stringify(playwrightCounts), collectorFaults: snapshots.flatMap(value => value.faults), captureFailures: snapshots.flatMap(value => value.captureFailures)};
}
