from pathlib import Path
import hashlib,json,sys,tempfile,unittest
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE/'candidate'))
from sprite_ink_bounds import add_ink_bounds

class InkBoundsTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.atlases={};self.before={};self.pngs={}
 def tearDown(self):self.tmp.cleanup()
 def page(self,scale,layer,alpha,frames,suffix='0'):
  name=f'{scale}.{layer}.{suffix}';arr=np.zeros((*alpha.shape,4),dtype=np.uint8);arr[...,:3]=157;arr[...,3]=alpha;Image.fromarray(arr,'RGBA').save(self.root/(name+'.png'))
  desc={'frames':{key:{'frame':rect,'sourceSize':{'w':rect['w'],'h':rect['h']},'anchor':{'x':.4,'y':.8},'custom':{'preserve':True}} for key,rect in frames.items()},'meta':{'image':name+'.png','scale':scale,'existing':'kept'}};p=self.root/(name+'.json');p.write_text(json.dumps(desc,separators=(',',':')));self.before[p.name]=desc;self.pngs[name+'.png']=hashlib.sha256((self.root/(name+'.png')).read_bytes()).hexdigest();self.atlases.setdefault(scale,{}).setdefault(layer,[]).append(p.name);return p
 def frame(self,p,key='pose'):return json.loads(p.read_text())['frames'][key]['ink_bounds']
 def assert_preserved(self):
  for name,sha in self.pngs.items():self.assertEqual(hashlib.sha256((self.root/name).read_bytes()).hexdigest(),sha)
  for name,old in self.before.items():
   d=json.loads((self.root/name).read_text());d['meta'].pop('ink_bounds_policy');[f.pop('ink_bounds') for f in d['frames'].values()];self.assertEqual(d,old)
 def test_alpha_one_team_union_and_shadow_separate(self):
  b=np.zeros((6,8),np.uint8);b[2,3]=255;t=np.zeros_like(b);t[4,6]=1;s=np.zeros_like(b);s[5,0]=3;r={'pose':{'x':0,'y':0,'w':8,'h':6}}
  bp=self.page('1x','beauty',b,r);tp=self.page('1x','team',t,r);sp=self.page('1x','shadow',s,r);self.assertEqual(add_ink_bounds(self.root,self.atlases),3);want={'x':3,'y':2,'w':4,'h':3};self.assertEqual(self.frame(bp),want);self.assertEqual(self.frame(tp),want);self.assertEqual(self.frame(sp),{'x':0,'y':5,'w':1,'h':1});self.assert_preserved()
 def test_empty_body_has_null_despite_shadow(self):
  z=np.zeros((2,3),np.uint8);r={'pose':{'x':0,'y':0,'w':3,'h':2}};bp=self.page('1x','beauty',z,r);self.page('1x','shadow',np.full_like(z,255),r);add_ink_bounds(self.root,self.atlases);self.assertIsNone(self.frame(bp));self.assert_preserved()
 def test_scale_bounds_are_independent(self):
  r1={'pose':{'x':0,'y':0,'w':4,'h':3}};r2={'pose':{'x':0,'y':0,'w':8,'h':6}};a=np.zeros((3,4),np.uint8);a[1,0]=1;b=np.zeros((6,8),np.uint8);b[2:4,3:5]=255;p=self.page('1x','beauty',a,r1);q=self.page('2x','beauty',b,r2);add_ink_bounds(self.root,self.atlases);self.assertEqual(self.frame(p),{'x':0,'y':1,'w':1,'h':1});self.assertEqual(self.frame(q),{'x':3,'y':2,'w':2,'h':2});self.assert_preserved()
 def test_page_offset_and_multiple_pages(self):
  a=np.zeros((8,12),np.uint8);a[4,7]=128;r={'pose':{'x':5,'y':3,'w':4,'h':3}};p=self.page('1x','beauty',a,r);b=np.zeros((3,4),np.uint8);b[2,3]=255;q=self.page('1x','beauty',b,{'other':{'x':0,'y':0,'w':4,'h':3}},'1');add_ink_bounds(self.root,self.atlases);self.assertEqual(self.frame(p),{'x':2,'y':1,'w':1,'h':1});self.assertEqual(self.frame(q,'other'),{'x':3,'y':2,'w':1,'h':1});self.assert_preserved()
 def test_rejects_outside_rectangle(self):
  self.page('1x','beauty',np.zeros((3,4),np.uint8),{'pose':{'x':3,'y':0,'w':2,'h':3}})
  with self.assertRaisesRegex(ValueError,'Invalid packed frame'):add_ink_bounds(self.root,self.atlases)
 def test_rejects_mismatched_body_mask(self):
  self.page('1x','beauty',np.zeros((3,4),np.uint8),{'pose':{'x':0,'y':0,'w':4,'h':3}});self.page('1x','team',np.zeros((3,3),np.uint8),{'pose':{'x':0,'y':0,'w':3,'h':3}})
  with self.assertRaisesRegex(ValueError,'Body/team frame sizes'):add_ink_bounds(self.root,self.atlases)
 def test_rejects_path_escape(self):
  with self.assertRaisesRegex(ValueError,'inside their asset'):add_ink_bounds(self.root,{'1x':{'beauty':['../outside.json']}})

if __name__=='__main__':unittest.main()
