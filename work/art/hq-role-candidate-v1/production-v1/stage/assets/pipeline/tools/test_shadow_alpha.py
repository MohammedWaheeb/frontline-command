"""Focused production-normalization regression. Run with the art venv Python."""
import unittest
import numpy as np
from shadow_alpha import clean_shadow_alpha

class ShadowCleanupTests(unittest.TestCase):
    def test_substantive_shadow_and_penumbra_are_pixel_exact(self):
        raw=np.full((40,60),4,dtype=np.uint8)
        raw[12:28,20:40]=100
        raw[10:30,18:42]=np.maximum(raw[10:30,18:42],6)
        raw[0,-1]=49
        cleaned=clean_shadow_alpha(raw)
        np.testing.assert_array_equal(cleaned[8:32,16:44],raw[8:32,16:44])
        self.assertEqual(int(cleaned[0,-1]),0)
        self.assertFalse(cleaned[0].any())
        self.assertFalse(cleaned[-1].any())
        np.testing.assert_array_equal(clean_shadow_alpha(cleaned),cleaned)

    def test_substantive_clipped_shadow_is_not_hidden(self):
        for border in ('top','bottom','left','right'):
            raw=np.zeros((40,60),dtype=np.uint8)
            if border=='top':raw[:10,20:40]=80
            elif border=='bottom':raw[-10:,20:40]=80
            elif border=='left':raw[12:28,:10]=80
            else:raw[12:28,-10:]=80
            np.testing.assert_array_equal(clean_shadow_alpha(raw),raw)

    def test_disconnected_real_shadows_and_diagonal_connectivity(self):
        raw=np.zeros((40,60),dtype=np.uint8)
        raw[10:20,12:20]=200
        raw[20:25,40:45]=40
        for i in range(10):raw[i,i]=30
        cleaned=clean_shadow_alpha(raw)
        np.testing.assert_array_equal(raw,cleaned)

    def test_noise_only_and_empty_inputs_stay_empty(self):
        raw=np.full((40,60),6,dtype=np.uint8)
        raw[0,-1]=49
        self.assertFalse(clean_shadow_alpha(raw).any())
        self.assertFalse(clean_shadow_alpha(np.zeros((1,1),dtype=np.uint8)).any())
        with self.assertRaises(ValueError):clean_shadow_alpha(np.zeros((2,2,4),dtype=np.uint8))

if __name__=='__main__':unittest.main()
