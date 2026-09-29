"""Native same-anchor HQ comparison; evaluated proof and pixels are separate gates."""
from pathlib import Path
import hashlib,json,sys,math
import numpy as np
from PIL import Image,ImageDraw
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';aid=sys.argv[1];out=B/'pilot-v1'/aid;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();r=json.loads((out/'render.json').read_text());spec=json.loads((S/'assets/pipeline/specs'/f'{aid}.json').read_text());states={s['name']:s for s in spec['states']};sys.path.insert(0,str(S/'assets/pipeline/tools'));from pack_sprites import normalise,downsample_premultiplied;from composite import tint,shadow_layer
refs=B/'references-v1'/aid;checks=[];arrays={};identity=[]
def rec(k,ok):checks.append({'check':k,'ok':bool(ok)})
reference_receipt=json.loads((B/'references-v1/receipt.json').read_text())
for row in reference_receipt['files']:
 if 'copy' in row:assert sha(B/row['copy'])==row['sha256']
for row in r['records']:
 key=row['key'];name=key.split('/')[0];layers=states[name].get('layers',spec['passes'])
 for folder,root in [('before',refs/'raw'),('candidate',out)]:
  current={}
  for layer in layers:
   p=root/layer/(key+'.png')
   if folder=='candidate':assert sha(p)==row['files'][str(p.relative_to(out))]
   with Image.open(p) as im:rec(f'{folder}/{key}/{layer}/dimensions',im.size==tuple(spec['canvas']));a=normalise(layer,im)
   alpha=a[:,:,3];border=np.concatenate([alpha[0],alpha[-1],alpha[:,0],alpha[:,-1]]);rec(f'{folder}/{key}/{layer}/no_border',not (border>8).any())
   if layer=='beauty':rec(f'{folder}/{key}/visible',int((alpha>8).sum())>30)
   if layer=='shadow':rec(f'{folder}/{key}/black_shadow',not a[:,:,:3].any())
   current[layer]=a;arrays[folder,key,layer]=a
  if 'team' in current:
   body,team=current['beauty'][:,:,3],current['team'][:,:,3];rec(f'{folder}/{key}/team_inside',int(((team>32)&(body<8)).sum())<=max(4,.005*int((team>32).sum())))
 if name in ('foundation','rubble'):
  for layer in layers:
   before=np.asarray(Image.open(refs/'raw'/layer/(key+'.png')).convert('RGBA'));after=np.asarray(Image.open(out/layer/(key+'.png')).convert('RGBA'));delta=np.abs(before.astype(np.int16)-after.astype(np.int16));identity.append({'key':key,'layer':layer,'png_byte_exact':sha(refs/'raw'/layer/(key+'.png'))==sha(out/layer/(key+'.png')),'decoded_pixel_exact':bool(np.array_equal(before,after)),'changed_pixels':int(np.any(delta,axis=2).sum()),'max_channel_delta':int(delta.max())})
contacts=out/'contacts';assert not contacts.exists();contacts.mkdir();images={}
def compose(folder,key,div):
 im=Image.new('RGBA',tuple(v//div for v in spec['canvas']),'#8C806B');st=states[key.split('/')[0]]
 for layer in ['shadow','beauty','team']:
  if layer not in st.get('layers',spec['passes']):continue
  a=arrays[folder,key,layer];a=downsample_premultiplied(a) if div==2 else a.clip(0,255).astype(np.uint8);part=Image.fromarray(a,'RGBA');part=shadow_layer(part) if layer=='shadow' else tint(part,'#BDA14D') if layer=='team' else part;im.alpha_composite(part)
 return im
for div in [2,1]:
 w,h=[v//div for v in spec['canvas']]
 for start in range(0,len(r['records']),3):
  group=r['records'][start:start+3];sheet=Image.new('RGBA',(2*w,(h+24)*len(group)),'#8C806B');draw=ImageDraw.Draw(sheet)
  for n,row in enumerate(group):
   y=n*(h+24)
   for col,folder in enumerate(['before','candidate']):sheet.paste(compose(folder,row['key'],div),(col*w,y+24));draw.text((col*w+5,y+5),f"{folder} {row['key']}",fill='#171713')
  p=contacts/f'before-after-{start//3+1:02d}@{1 if div==2 else 2}x.png';sheet.convert('RGB').save(p);images[p.name]=sha(p)
# Standard UI output is optional at this phase; if supplied it must be complete.
uiroot=S/'assets/build/ui';uipaths=[uiroot/folder/f'{aid}@2x.{layer}.png' for folder in ['portraits','icons/build'] for layer in ['beauty','team']]
if any(p.exists() for p in uipaths):
 assert all(p.exists() for p in uipaths)
 sheet=Image.new('RGBA',(672,336),'#8C806B');draw=ImageDraw.Draw(sheet)
 for row,folder in enumerate(['portraits','icons/build']):
  x=0 if row==0 else 400
  for col,root in enumerate([refs/'ui',uiroot]):
   body=Image.open(root/folder/f'{aid}@2x.beauty.png').convert('RGBA');team=Image.open(root/folder/f'{aid}@2x.team.png').convert('RGBA');a=np.asarray(body)[:,:,3];t=np.asarray(team)[:,:,3];rec(f'ui/{folder}/{col}/inside',int(((t>32)&(a<8)).sum())<=max(4,.005*int((t>32).sum())));rec(f'ui/{folder}/{col}/no_border',not (np.concatenate([a[0],a[-1],a[:,0],a[:,-1]])>8).any());cell=Image.alpha_composite(body,tint(team,'#BDA14D'));sheet.alpha_composite(cell,(x+col*196 if row==0 else x+col*132,24));draw.text((x+col*(196 if row==0 else 132)+3,5),('before' if col==0 else 'candidate')+' '+folder,fill='#171713');small=Image.fromarray(downsample_premultiplied(np.asarray(cell,dtype=np.float32)),'RGBA');sheet.alpha_composite(small,(x+col*(196 if row==0 else 132),232))
 p=contacts/'ui-before-after@1x-2x.png';sheet.convert('RGB').save(p);images[p.name]=sha(p)
result={'id':aid,'checks':len(checks),'failures':sum(not x['ok'] for x in checks),'results':checks,'images':images,'terminal_strict_pixel_identity':identity,'terminal_strict_pixel_gate':'PASS' if all(x['decoded_pixel_exact'] for x in identity) else 'FAIL - preserve and diagnose; source parity does not establish identical pixels','scope':'Selected native comparisons only. Static UI and all native images need direct review before any promotion.'};(out/'check.json').write_text(json.dumps(result,indent=2)+'\n');print('FC_HQ_PILOT_CHECK',aid,len(checks),result['failures'],result['terminal_strict_pixel_gate']);assert result['failures']==0
