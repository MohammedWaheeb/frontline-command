from pathlib import Path
import json, hashlib, shutil
B=Path(__file__).resolve().parent; R=B.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
reportpath=B.parent/'normalized-roster-v2/result.json'; report=json.loads(reportpath.read_text())
roles=['US.rifle','US.at','IR.recon','SA.medic','US.tank']
tokens=R/'client/src/design/tokens.json'; palettes=json.loads(tokens.read_text())['color']['team']
def luminance(color):
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(c*v for c,v in zip((.2126,.7152,.0722),linear))
colors=[]
for palette in ['standard','cvd_safe']:
    for bound,func in [('darkest',min),('lightest',max)]:
        color=func(palettes[palette],key=luminance)
        colors.append({'palette':palette,'bound':bound,'hex':color,'relative_luminance':luminance(color)})
inputs={str(reportpath.relative_to(R)):sha(reportpath),str(tokens.relative_to(R)):sha(tokens)}
rows=[]
for role in roles:
    hentry=next(x for x in report['handoffs'] if x['id']=='unit.'+role)
    hp=R/hentry['path']; assert sha(hp)==hentry['sha256']; h=json.loads(hp.read_text());inputs[hentry['path']]=hentry['sha256']
    for folder in ['portraits','icons/build']:
        for layer in ['beauty','team']:
            dest=f'ui/{folder}/{role}@2x.{layer}.png'; original=h['files'][dest]; old=R/original['source'];assert sha(old)==original['sha256']
            for mode in ['raw','normalized']:
                src=old
                if mode=='normalized' and layer=='team':
                    entry=next(x for x in report['files'] if x['destination']==dest);src=R/entry['candidate'];assert sha(src)==entry['candidate_sha256']
                inputs[str(src.relative_to(R))]=sha(src)
                dst=B/'inputs'/mode/folder/f'{role}@2x.{layer}.png';dst.parent.mkdir(parents=True,exist_ok=True);assert not dst.exists();shutil.copyfile(src,dst)
                rows.append({'source':str(src.relative_to(R)),'copy':str(dst.relative_to(R)),'sha256':sha(dst)})
config={'roles':roles,'colors':colors,'scope':'Actual palette luminance extrema, exact private 136-mask candidate subset; original US rifle is historical pending spec-only replacement.'}
(B/'config.json').write_text(json.dumps(config,indent=2)+'\n')
(B/'input-receipt.json').write_text(json.dumps({'inputs':inputs,'copies':rows,'config_sha256':sha(B/'config.json')},indent=2)+'\n')
print(json.dumps(colors,indent=2))
