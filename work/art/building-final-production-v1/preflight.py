from pathlib import Path
import hashlib,json,sys
B=Path(__file__).resolve().parent;S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'production-lock.json').read_text());entries={e['id']:e for e in json.loads((S/'assets/manifest/asset-manifest.json').read_text())['entries']}
for name,w in json.loads((B/'driver-lock.json').read_text())['files'].items():assert sha(B/name)==w,name
for rel,w in lock['sources'].items():assert sha(S/rel)==w,rel
for aid in sys.argv[1:]:
 assert aid in lock['assets'];spec=json.loads((S/'assets/pipeline/specs'/f'{aid}.json').read_text());assert spec['states']==entries[aid]['spec']['states'] and spec['model']=='building_roster';print('FC_REMAINING_BUILDING_PREFLIGHT_OK',aid)
