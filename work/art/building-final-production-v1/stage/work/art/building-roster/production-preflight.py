"""Enforce approved immutable batch inputs before each complete-asset operation."""
from pathlib import Path
import hashlib,json,sys
repo=Path(__file__).resolve().parents[3];base=repo/'work/art/building-roster';lock=json.loads((base/'production-lock.json').read_text())
assert lock['model_sha256']=='f69e9291bcbe4b074d460b550f26b1dab1688dd1ae9f9518f8aae7a3be059b60'
for p,h in lock['sources'].items():assert hashlib.sha256((repo/p).read_bytes()).hexdigest()==h,'Frozen input changed: '+p
manifest=json.loads((repo/'assets/manifest/asset-manifest.json').read_text());entries={e['id']:e for e in manifest['entries']}
for aid in sys.argv[1:]:
 assert aid in lock['assets'],'Unapproved asset '+aid
 s=json.loads((repo/'assets/pipeline/specs'/(aid+'.json')).read_text());assert s['states']==entries[aid]['spec']['states'],'Manifest mismatch '+aid
 print('FC_BUILDING_FROZEN_INPUTS_OK',aid)
