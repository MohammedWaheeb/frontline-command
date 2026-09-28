from pathlib import Path
import ast,json,sys
import numpy as np
from PIL import Image,ImageDraw
repo=Path(__file__).resolve().parents[3];sys.path.insert(0,str(repo/'assets/pipeline/tools'));from pack_sprites import downsample_premultiplied,normalise
out=Path(__file__).resolve().parent
# Reproduce the original defect from the exact hash-verified saved helper.
_tree=ast.parse((out/'before-pack_sprites.py').read_text());_fn=next(n for n in _tree.body if isinstance(n,ast.FunctionDef) and n.name=='downsample_premultiplied');_ns={'Image':Image,'np':np};exec(compile(ast.Module(body=[_fn],type_ignores=[]),'before-pack_sprites.py','exec'),_ns);downsample_premultiplied=_ns['downsample_premultiplied']
def reference(a):
 a=np.asarray(a,dtype=np.float32);alpha=a[:,:,3:4]/255;pm=np.concatenate((a[:,:,:3]*alpha,a[:,:,3:4]),axis=2)
 b=np.stack([np.asarray(Image.fromarray(pm[:,:,i],'F').resize((pm.shape[1]//2,pm.shape[0]//2),Image.Resampling.LANCZOS)) for i in range(4)],axis=2)
 al=np.clip(b[:,:,3:4],0,255);rgb=np.where(al>0,b[:,:,:3]*255/np.maximum(al,1e-6),0)
 return np.concatenate((rgb,al),axis=2).clip(0,255).round().astype(np.uint8)
a=np.zeros((32,32,4),dtype=np.float32);a[5:27,5:27]=[96,128,160,255]
old=downsample_premultiplied(a);new=reference(a);edges=(new[:,:,3]>=32)&(new[:,:,3]<=223)
result={'synthetic_original_rgb':[96,128,160],'partial_edge_pixels':int(edges.sum()),'current_edge_rgb_mean':np.mean(old[:,:,:3][edges],axis=0).tolist(),'reference_edge_rgb_mean':np.mean(new[:,:,:3][edges],axis=0).tolist(),'current_edge_rgb_max':old[:,:,:3][edges].max(axis=0).tolist(),'reference_edge_rgb_max':new[:,:,:3][edges].max(axis=0).tolist()}
# Render a diagnostic from the original full palm beauty, no shipping mutation.
root=repo/'assets/build/frames/prop.palm';a=normalise('beauty',Image.open(root/'beauty/idle/d00_f00.png').convert('RGBA'));b=downsample_premultiplied(a);c=reference(a);alpha=c[:,:,3];edges=(alpha>=24)&(alpha<=224);result['palm_partial_edge_pixels']=int(edges.sum());result['palm_current_minus_reference_edge_rgb_mean']=float((b[:,:,:3].astype(float)-c[:,:,:3])[edges].mean())
ys,xs=np.nonzero(alpha>8);box=(max(0,int(xs.min())-5),max(0,int(ys.min())-5),int(xs.max())+6,int(ys.max())+6);w=box[2]-box[0];h=box[3]-box[1]
sheet=Image.new('RGB',(w*2,h+24),'#81755E');draw=ImageDraw.Draw(sheet)
for i,(title,pixels) in enumerate([('CURRENT export',b),('REFERENCE once',c)]):
 im=Image.new('RGBA',(a.shape[1]//2,a.shape[0]//2),'#81755E');im.alpha_composite(Image.fromarray(pixels,'RGBA'));sheet.paste(im.crop(box),(i*w,24));draw.text((i*w+2,4),title,fill='white')
sheet.save(out/'palm-export-comparison@1x.png');sheet.resize((sheet.width*4,sheet.height*4),Image.Resampling.NEAREST).save(out/'palm-export-comparison-diagnostic@4x.png')
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
