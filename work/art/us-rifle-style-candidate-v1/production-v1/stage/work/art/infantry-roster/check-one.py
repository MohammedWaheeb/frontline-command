"""Standard pixel checks plus the complete infantry runtime metadata contract."""
import hashlib
import json
import math
from pathlib import Path
import sys

repo = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo/'assets/pipeline/tools'))
import check_assets

aid = sys.argv[1]
spec_path = repo/'assets/pipeline/specs'/f'{aid}.json'
spec = json.loads(spec_path.read_text())
assert spec['model'] == 'infantry_roster'
out = repo/'work/art/infantry-roster'
manifest = json.loads((repo/'assets/manifest/asset-manifest.json').read_text())
entry = next(e for e in manifest['entries'] if e['id']==aid)
check_assets.check_spec(str(spec_path))
record = lambda name,ok,detail='':check_assets.rec(aid,name,ok,detail)
root = repo/'assets/build/sprites'/aid
side = json.loads((root/f'{aid}.sprite.json').read_text())
expected = {f"{s['name']}/d{d:02d}_f{f:02d}" for s in spec['states']
            for d in range(s['directions']) for f in range(s['frames'])}
record('manifest_state_contract', spec['states']==entry['spec']['states'])
record('identity_and_radius', side['id']==aid and side['role_id']==spec['role_id']
       and side['faction']==spec['faction'] and side['footprint_radius_mt']==350)
record('complete_sidecar_states', side['states']==spec['states'] and side['frame_count']==len(expected))
record('cosmetic_squad', side['squad']==spec['squad']
       and len(spec['squad']['member_offsets_mt'])==entry['spec']['squad_members']
       and spec['squad']['members']==entry['spec']['squad_members'])
record('trimmed_anchor', all(0<=a<n for a,n in zip(side['anchor_2x'],side['frame_size_2x'])))
raw = json.loads((repo/'assets/build/frames'/aid/'hardpoints.json').read_text())
hp_names = ('healthbar','work') if spec['params']['role'] in ('engineer','medic') else ('healthbar','work','muzzle')
for name in hp_names:
    points=side['hardpoints_2x_rel_anchor'].get(name,{})
    ok=set(points)==expected
    for key,point in points.items():
        ok=ok and len(point)==2 and all(math.isfinite(v) for v in point)
        ok=ok and all(abs(v-(raw[name][key][axis]-spec['anchor'][axis]))<=.051 for axis,v in enumerate(point))
    record(name+'_every_pose',ok)
blend=repo/'assets/source/blender'/f'{aid}.blend'
record('editable_scene',blend.exists() and blend.stat().st_size>1024)
lock_path=out/'source-lock.json'
if lock_path.exists():
    lock=json.loads(lock_path.read_text())
    for path in ('assets/pipeline/blender/models/infantry_roster.py',str(spec_path.relative_to(repo))):
        record('source_hash:'+path, hashlib.sha256((repo/path).read_bytes()).hexdigest()==lock['sha256'][path])
else:
    record('source_snapshot',False,'Production requires a source snapshot after pilot review')
memory={}
for scale,layers in side['atlases'].items():
    dimensions=[json.loads((root/name).read_text())['meta']['size'] for names in layers.values() for name in names]
    memory[scale]={'pages':len(dimensions),'rgba_mib':round(sum(d['w']*d['h']*4 for d in dimensions)/1024**2,2),
                   'png_mib':round(sum(p.stat().st_size for p in root.glob(f'*@{scale}*.png'))/1024**2,2)}
failures=[r for r in check_assets.results if not r['ok']]
report={'id':aid,'poses':len(expected),'frame_2x':side['frame_size_2x'],'memory':memory,
        'checks':len(check_assets.results),'failures':len(failures),'results':check_assets.results}
(out/f'check-{aid}.json').write_text(json.dumps(report,indent=2)+'\n')
lines=[f'# {aid} production checks','',f"{len(expected)} poses; {report['checks']} checks; {len(failures)} failures.",
       '', '| Check | Result | Detail |','|---|---|---|']
lines += [f"| {r['check']} | {'PASS' if r['ok'] else 'FAIL'} | {r['detail']} |" for r in check_assets.results]
lines += ['', 'Atlas sizes count every page; they are not a simultaneous runtime allocation.',
          '', '| Scale | Pages | Decoded MiB | PNG MiB |','|---|---:|---:|---:|']
lines += [f"| {scale} | {v['pages']} | {v['rgba_mib']} | {v['png_mib']} |" for scale,v in memory.items()]
(out/f'check-{aid}.md').write_text('\n'.join(lines)+'\n')
print(aid,report['checks'],'checks;',len(failures),'failures')
for f in failures:print(f['check'],f['detail'])
raise SystemExit(bool(failures))
