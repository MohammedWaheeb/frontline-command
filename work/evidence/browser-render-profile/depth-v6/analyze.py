#!/usr/bin/env python3
"""Read-only Chrome CPU-profile sampled-time accounting. No browser or app edits."""
from pathlib import Path
from collections import Counter
import hashlib, json, sys
source=Path(sys.argv[1]); output=Path(sys.argv[2]); output.mkdir(parents=True,exist_ok=True)
raw=source.read_bytes(); profile=json.loads(raw)
nodes={node['id']:node for node in profile['nodes']}
parents={child:node['id'] for node in profile['nodes'] for child in node.get('children',[])}
exclusive=Counter(); inclusive=Counter()
assert len(profile['samples'])==len(profile['timeDeltas'])
for sample,delta in zip(profile['samples'],profile['timeDeltas']):
    exclusive[sample]+=delta
    seen=set()
    while sample is not None:
        assert sample not in seen
        seen.add(sample); inclusive[sample]+=delta; sample=parents.get(sample)
def row(node_id):
    frame=nodes[node_id]['callFrame']; stack=[]; current=node_id
    while current is not None:
        f=nodes[current]['callFrame']; stack.append({'id':current,'function':f['functionName'] or '<anonymous>','line':f['lineNumber']+1}); current=parents.get(current)
    return {'id':node_id,'function':frame['functionName'] or '<anonymous>','url':frame['url'],'line':frame['lineNumber']+1,'column':frame['columnNumber']+1,'exclusive_ms':exclusive[node_id]/1000,'inclusive_ms':inclusive[node_id]/1000,'stack':list(reversed(stack))}
result={'input':str(source),'sha256':hashlib.sha256(raw).hexdigest(),'profile_wall_ms':(profile['endTime']-profile['startTime'])/1000,'sampled_ms':sum(profile['timeDeltas'])/1000,'samples':len(profile['samples']),'exclusive_top':[row(id) for id,_ in exclusive.most_common(40)],'inclusive_top':[row(id) for id,_ in inclusive.most_common(40)],'qualification':'Sampled elapsed attribution, not independent CPU utilization, exact call counts, GPU time, or uninstrumented benchmark. Inclusive rows overlap and must not be summed.'}
(output/'sampled-time.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['sha256','profile_wall_ms','sampled_ms','samples']},indent=2))
