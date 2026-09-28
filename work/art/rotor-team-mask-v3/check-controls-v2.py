from pathlib import Path
import json
import numpy as np
from PIL import Image,ImageDraw
HERE=Path(__file__).resolve().parent;OUT=HERE/'controls-v2';report=json.loads((OUT/'render.json').read_text());checks=[];equivalence=[]
def check(name,ok,detail=None):checks.append({'name':name,'ok':bool(ok),'detail':detail})
def read(v,name,layer):return np.asarray(Image.open(OUT/v/name/(layer+'.png')).convert('RGBA'))
cases=[r for r in report['records'] if r.get('version')=='candidate']
for row in cases:
 name=row['name'];alpha=read('candidate',name,'team')[:,:,3];expected=(1-row['source_alpha'])**row['planes'];amount=float(alpha[56:72,38:50].mean()/255)
 check(name+'/team transmission',abs(amount-expected)<=.035,{'observed':amount,'expected':expected})
 check(name+'/plain surface transparent in mask',int(alpha[56:72,78:90].max())==0,int(alpha[56:72,78:90].max()))
 check(name+'/ray budget restored',row['restored_limit']==4)
 for layer in ['beauty','shadow']:
  a=read('before',name,layer);b=read('candidate',name,layer);delta=np.abs(a.astype(int)-b.astype(int));equivalence.append({'name':name,'layer':layer,'byte_equal':bool(np.array_equal(a,b)),'changed_pixels':int(np.any(delta,axis=2).sum()),'max_difference':int(delta.max())})
page=Image.new('RGBA',(len(cases)*130,430),'#8C806B');draw=ImageDraw.Draw(page)
for i,row in enumerate(cases):
 draw.text((i*130+2,2),row['name']+' layers-alpha',fill='#171713')
 for j,v in enumerate(['before','failed','candidate']):page.alpha_composite(Image.open(OUT/v/row['name']/'team.png').convert('RGBA'),(i*130,25+j*132))
page.convert('RGB').save(OUT/'stacked-controls@1x.png')
check('error restores all source state',any(r.get('restoration_error_injection_passed') for r in report['records']))
failures=[r for r in checks if not r['ok']];(OUT/'check.json').write_text(json.dumps({'checks':checks,'failures':failures,'strict_byte_comparisons':equivalence,'strict_byte_gate':'PASS' if all(r['byte_equal'] for r in equivalence) else 'FAIL; render noise not reclassified'},indent=2)+'\n');print('FC_STACKED_MASK_CONTROLS_CHECK',len(checks),len(failures));assert not failures,failures
