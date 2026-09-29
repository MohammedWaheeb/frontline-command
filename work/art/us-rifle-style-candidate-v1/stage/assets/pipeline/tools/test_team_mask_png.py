import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'blender'))
from pathlib import Path
import struct,tempfile,unittest,zlib
from team_mask_png import _read,_chunk,_paeth,merge_coverage,SIGNATURE


def png(path,w,h,rgba,mode=0):
    stride=w*4;previous=bytes(stride);encoded=[]
    for y in range(h):
        row=bytes(rgba[y*stride:(y+1)*stride]);filtered=bytearray(row)
        for x,value in enumerate(row):
            left=row[x-4] if x>=4 else 0;up=previous[x];corner=previous[x-4] if x>=4 else 0
            predict=0 if mode==0 else left if mode==1 else up if mode==2 else (left+up)//2 if mode==3 else _paeth(left,up,corner)
            filtered[x]=(value-predict)&255
        encoded.append(bytes([mode])+filtered);previous=row
    header=struct.pack('>IIBBBBB',w,h,8,6,0,0,0)
    path.write_bytes(SIGNATURE+_chunk(b'IHDR',header)+_chunk(b'tEXt',b'provenance\0preserve-me')+_chunk(b'IDAT',zlib.compress(b''.join(encoded)))+_chunk(b'IEND',b''))


class CoveragePNGTests(unittest.TestCase):
    def test_all_five_filters_and_rgb_preservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=Path(temporary);rgba=bytes((n*47+13)%256 for n in range(7*4*4))
            coverage=bytes(v for n in range(28) for v in [n*9,n*9,n*9,(255-n*7)])
            for mode in range(5):
                with self.subTest(filter=mode):
                    png(p/'shade.png',7,4,rgba,mode);png(p/'coverage.png',7,4,coverage,4-mode)
                    self.assertEqual(bytes(_read(p/'shade.png')[2]),rgba)
                    merge_coverage(p/'shade.png',p/'coverage.png');w,h,result,chunks=_read(p/'shade.png')
                    self.assertEqual((w,h),(7,4));self.assertIn((b'tEXt',b'provenance\0preserve-me'),chunks)
                    for n in range(28):
                        i=n*4;self.assertEqual(result[i:i+3],rgba[i:i+3]);self.assertEqual(result[i+3],(coverage[i]*coverage[i+3]+127)//255)

    def test_no_rgb_change_when_new_alpha_is_zero(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=Path(temporary);png(p/'shade',1,1,bytes([10,20,30,255]));png(p/'mask',1,1,bytes([0,0,0,255]));merge_coverage(p/'shade',p/'mask');self.assertEqual(_read(p/'shade')[2],bytearray([10,20,30,0]))

    def test_rejects_colored_coverage_and_dimension_mismatch(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=Path(temporary);png(p/'shade',1,1,bytes([10,20,30,255]));png(p/'mask',1,1,bytes([10,20,30,255]));before=(p/'shade').read_bytes()
            with self.assertRaises(ValueError):merge_coverage(p/'shade',p/'mask')
            self.assertEqual((p/'shade').read_bytes(),before)
            png(p/'mask',2,1,bytes([255]*8))
            with self.assertRaises(ValueError):merge_coverage(p/'shade',p/'mask')

    def test_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            p=Path(temporary)/'broken';png(p,1,1,bytes([255]*4));data=bytearray(p.read_bytes());data[25]^=1;p.write_bytes(data)
            with self.assertRaises(ValueError):_read(p)


if __name__=='__main__':unittest.main()
