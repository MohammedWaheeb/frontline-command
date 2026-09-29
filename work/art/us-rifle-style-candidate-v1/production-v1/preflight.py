from pathlib import Path
import hashlib,json
B=Path(__file__).resolve().parent;S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'production-lock.json').read_text());pre=json.loads((B/'preparation.json').read_text());assert sha(B.parent/'parent-native-approval.json')==pre['parent_approval_sha256']
for name,w in json.loads((B/'driver-lock.json').read_text())['files'].items():assert sha(B/name)==w,name
for rel,w in lock['sources'].items():assert sha(S/rel)==w,rel
p=S/'work/reuse/unit.US.rifle.json';assert sha(p)==pre['reuse_sha256'];reuse=json.loads(p.read_text())
for rel,v in reuse['files'].items():assert sha(S/'assets/build/frames/unit.US.rifle'/rel)==v['sha256']
print('FC_RIFLE_FULL_PREFLIGHT')
