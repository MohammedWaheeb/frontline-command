import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

import fam_explosion
from detonation import Spec
from fxkit import Canvas, Clip, Effect, Frame
from pack import crop_frame, pack_effect


class EffectsContract(unittest.TestCase):
    def test_region_composite_preserves_full_canvas_source_over_exactly(self):
        cv = Canvas(64, 60, 30, 30, ss=4)
        baseline = np.zeros_like(cv.buf)
        for i in range(40):
            mask = cv.ellipse((i*7 % 50)-25, (i*3 % 46)-23, i % 9+1, i % 7+1)
            # Exercise both PIL and ndarray paths, alpha saturation and empties.
            source = cv.arr(mask) if i % 2 else mask
            alpha = i / 30
            color = ((i*11) % 255, (i*17) % 255, (i*23) % 255)
            a = np.clip(cv.arr(mask)*alpha, 0, 1)[..., None]
            c = np.array([color[0]/255, color[1]/255, color[2]/255, 1], np.float32)
            baseline = baseline*(1-a) + c*a
            cv.paint(source, color, alpha)
        np.testing.assert_array_equal(cv.buf, baseline)

    def test_filter_runs_before_any_frame_generation(self):
        with patch.object(fam_explosion, 'build', side_effect=lambda eid, *a, **kw: eid) as build:
            effects = fam_explosion.effects({'fx.explosion.small'})
            self.assertEqual(effects, ['fx.explosion.small'])
            self.assertEqual(build.call_count, 1)

    def test_actual_twenty_hz_sampling_has_equal_terminals(self):
        def paint(cv, t, *args):
            cv.paint(cv.ellipse(0, 0, 2, 2), (200, 110, 30), max(0, 1-t))
        with patch.object(fam_explosion, 'paint', paint), patch.object(fam_explosion, '_settled', paint):
            for duration, frames, fps in [(12, 11, 20), (22, 20, 20), (60, 36, 12)]:
                eff = fam_explosion.build('fx.explosion.small', (16, 16), (8, 8), Spec(), frames, fps,
                                          ss=1, duration_ticks=duration)
                for clip in eff.clips.values():
                    self.assertEqual(clip.fps, 20)
                    self.assertEqual(len(clip.frames), duration)
                    for tick in range(duration, duration+10):
                        index = min(len(clip.frames)-1, tick*clip.fps//20)
                        self.assertIsNone(clip.frames[index].image)

    def test_crop_preserves_offset_anchor_and_exact_atlas_pixels(self):
        im = Image.new('RGBA', (32, 28))
        im.putpixel((25, 20), (220, 130, 40, 120))
        frame = Frame(im, 8, 7)
        cropped, anchor, proof = crop_frame(frame, 'test')
        self.assertEqual(anchor, (0, 0))
        restored = Image.new('RGBA', im.size)
        restored.paste(cropped, proof['crop'][:2])
        self.assertEqual(im.tobytes(), restored.tobytes())
        eff = Effect('fx.explosion.small', 1, {'burst': Clip(20, False, [frame, frame, Frame(None)])},
                     {v: 'burst' for v in ('standard', 'low', 'reducedMotion', 'reducedFlashing', 'reduced')})
        with tempfile.TemporaryDirectory() as tmp:
            _, proof = pack_effect(eff, Path(tmp))
            self.assertEqual(proof['unique_images'], 2)
            self.assertTrue(proof['clips']['burst']['terminal_empty'])

    def test_painted_edge_is_a_failure_not_silently_cropped(self):
        im = Image.new('RGBA', (16, 16))
        im.putpixel((0, 5), (40, 30, 20, 3))
        with self.assertRaisesRegex(ValueError, 'touches source canvas edge'):
            crop_frame(Frame(im, 8, 8), 'clipped')


if __name__ == '__main__':
    unittest.main()
