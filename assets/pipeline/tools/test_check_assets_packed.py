"""Focused checks for paired standard- and high-density sprite atlases."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

from PIL import Image

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import check_assets  # noqa: E402


class PackedAtlasTests(unittest.TestCase):
    def run_pair(self, high_scale=2, high_size=(20, 12), high_keys=None,
                 high_anchor=(0.25, 0.5), high_rect=(4, 4, None, None),
                 high_declared=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sprite = root / 'unit.sample'
            sprite.mkdir()
            original_sprites = check_assets.SPRITES
            original_results = check_assets.results[:]
            check_assets.SPRITES = str(root)
            check_assets.results.clear()
            try:
                standard = {'frame-0': (10, 6, (0.25, 0.5))}
                high = {key: (high_size[0], high_size[1], high_anchor)
                        for key in (high_keys or ['frame-0'])}
                atlases = {'1x': {}, '2x': {}}
                for scale, frames, declared in (
                    ('1x', standard, 1),
                    ('2x', high, high_scale if high_declared is None else high_declared),
                ):
                    image_name = f'{scale}.png'
                    Image.new('RGBA', (64, 64), (0, 0, 0, 0)).save(sprite / image_name)
                    packed_frames = {}
                    for index, (key, (w, h, anchor)) in enumerate(frames.items()):
                        x, y = (4 + index, 4 + index)
                        if scale == '2x' and high_rect[2] is not None:
                            x, y = high_rect[:2]
                            w, h = high_rect[2:]
                        packed_frames[key] = {
                            'frame': {'x': x, 'y': y, 'w': w, 'h': h},
                            'anchor': {'x': anchor[0], 'y': anchor[1]},
                        }
                    descriptor_name = f'{scale}.json'
                    descriptor = {
                        'frames': packed_frames,
                        'meta': {'image': image_name, 'size': {'w': 64, 'h': 64},
                                 'scale': declared},
                    }
                    (sprite / descriptor_name).write_text(json.dumps(descriptor))
                    atlases[scale]['beauty'] = [descriptor_name]
                sidecar = {'atlases': atlases}
                if high_scale != 2:
                    sidecar['atlas_resolution'] = {'1x': 1, '2x': high_scale}
                (sprite / 'unit.sample.sprite.json').write_text(json.dumps(sidecar))
                check_assets.check_packed('unit.sample', {}, 1)
                return check_assets.results[-1]
            finally:
                check_assets.SPRITES = original_sprites
                check_assets.results[:] = original_results

    def test_legacy_one_and_two_scale_pair_passes(self):
        result = self.run_pair(high_scale=2, high_size=(20, 12))
        self.assertTrue(result['ok'], result['detail'])

    def test_resized_one_and_one_point_five_scale_pair_passes(self):
        result = self.run_pair(high_scale=1.5, high_size=(15, 9))
        self.assertTrue(result['ok'], result['detail'])

    def test_world_geometry_anchor_keys_bounds_and_declared_scale_are_checked(self):
        cases = [
            self.run_pair(high_scale=1.5, high_size=(17, 9)),
            self.run_pair(high_scale=1.5, high_size=(15, 9), high_anchor=(0.4, 0.5)),
            self.run_pair(high_scale=1.5, high_size=(15, 9), high_keys=['other']),
            self.run_pair(high_scale=1.5, high_size=(15, 9), high_rect=(60, 4, 15, 9)),
            self.run_pair(high_scale=1.5, high_size=(15, 9), high_declared=2),
        ]
        for result in cases:
            self.assertFalse(result['ok'], result['detail'])


if __name__ == '__main__':
    unittest.main()
