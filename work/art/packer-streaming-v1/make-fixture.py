from pathlib import Path
import json
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent;root=HERE/'fixture';assert not root.exists();root.mkdir();aid='prop.fixture_stream';specs=root/'specs';specs.mkdir()
states=[{'name':'idle','part':'body','directions':2,'frames':2,'fps':4,'loop':True,'layers':['beauty','team','shadow']},{'name':'wreck','part':'whole','directions':1,'frames':2,'fps':0,'loop':False,'layers':['beauty','shadow']}]
spec={'id':aid,'canvas':[96,96],'anchor':[48,68],'passes':['beauty','team','shadow'],'states':states,'aliases':[],'overlays':[],'footprint_radius_mt':500};(specs/(aid+'.json')).write_text(json.dumps(spec,indent=2)+'\n')
y,x=np.mgrid[:96,:96];hp={'ground':{}}
for st in states:
 for d in range(st['directions']):
  for f in range(st['frames']):
   radius=25+d*4+f;dist=((x-48)**2+(y-46)**2)**.5;alpha=np.clip((radius+1-dist)*127,0,255).astype(np.uint8);alpha[12,12]=1
   for layer in st['layers']:
    a=np.zeros((96,96,4),np.uint8);a[:,:,3]=alpha
    if layer=='beauty':a[:,:,:3]=np.stack([(x*17+f*31)%256,(y*11+d*63)%256,((x+y)*13)%256],axis=-1)
    elif layer=='team':
     a[:,:,:3]=np.stack([(x*7+80)%256,(y*5+60)%256,((x+y)*3+30)%256],axis=-1);a[:,:,3]=np.where((x>35)&(x<60),alpha,0)
     if d==1 and f==1:a[:]=0
    else:
     a[:,:,:3]=0;a[:,:,3]=np.clip((radius+5-dist)*13,0,180).astype(np.uint8);a[0,95,3]=47
    p=root/'frames'/aid/layer/st['name']/f'd{d:02d}_f{f:02d}.png';p.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(a).save(p)
   hp['ground'][f"{st['name']}/d{d:02d}_f{f:02d}"]=[48,68]
(root/'frames'/aid/'hardpoints.json').write_text(json.dumps(hp)+'\n')
