from pathlib import Path
import hashlib,json,sys
B=Path(__file__).resolve().parent;S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((S/'work/art/building-roster/production-lock.json').read_text())
for rel,w in lock['sources'].items():assert sha(S/rel)==w,rel
for aid in sys.argv[1:]:
 assert aid in lock['assets'];reuse=json.loads((S/'work/reuse'/f'{aid}.json').read_text());assert reuse['model_sha256']==sha(S/'assets/pipeline/blender/models/building_roster.py')
 for rel,v in reuse['files'].items():assert sha(S/'assets/build/frames'/aid/rel)==v['sha256']
print('FC_HQ_FULL_PREFLIGHT',sys.argv[1:])
