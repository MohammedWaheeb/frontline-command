"""Validate isolated candidate root and every frozen source before a job."""
from pathlib import Path
import hashlib,json,sys
repo=Path(__file__).resolve().parents[3];base=repo/'work/art/sa-fighter-crash-production-v1';lock=json.loads((base/'production-lock.json').read_text());stage=repo/lock['stage'];assert stage.resolve().is_relative_to(base.resolve())
for rel,want in lock['sources'].items():assert hashlib.sha256((stage/rel).read_bytes()).hexdigest()==want,'Frozen staged input changed: '+rel
for rel,want in lock['drivers'].items():assert hashlib.sha256((repo/rel).read_bytes()).hexdigest()==want,'Frozen driver changed: '+rel
for aid in sys.argv[1:]:
 assert aid in lock['assets'],'Unapproved aircraft '+aid
 spec=json.loads((stage/'assets/pipeline/specs'/(aid+'.json')).read_text());assert spec['model']=='aircraft_roster' and spec['footprint_radius_mt']==600
 print('FC_STAGED_AIRCRAFT_PREFLIGHT_OK',aid)
