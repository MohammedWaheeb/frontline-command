"""Regression checks for reduced high-tier unit atlas geometry and packing."""
import json
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import resize_runtime_units as resize  # noqa: E402

class ResizeRuntimeUnitsTests(unittest.TestCase):
    def test_resize_uses_premultiplied_alpha_to_avoid_colored_halos(self):
        image = Image.new('RGBA', (8, 8), (255, 0, 255, 0))
        for y in range(8):
            for x in range(4, 8):
                image.putpixel((x, y), (255, 255, 255, 255))
        resized = np.asarray(resize.resize_rgba(image, (4, 4)))
        visible = resized[resized[..., 3] > 20, :3]
        self.assertGreater(len(visible), 0)
        # A magenta fringe would make R materially larger than G/B.
        self.assertLess(int(np.max(visible) - np.min(visible)), 12)

    def test_pack_preserves_frame_keys_anchors_states_and_world_dimensions(self):
        with tempfile.TemporaryDirectory() as tmp:
            unit_dir = Path(tmp) / 'unit.fixture'
            unit_dir.mkdir()
            source = Image.new('RGBA', (10, 4), (0, 0, 0, 0))
            source.paste((200, 120, 60, 255), (0, 0, 4, 4))
            source.paste((20, 180, 220, 255), (6, 0, 10, 4))
            source.save(unit_dir / 'fixture@2x.beauty.png')
            keys = ['idle/d00_f00', 'move/d03_f02']
            frames = {}
            for index, key in enumerate(keys):
                frames[key] = {
                    'frame': {'x': index * 6, 'y': 0, 'w': 4, 'h': 4},
                    'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': 4, 'h': 4},
                    'sourceSize': {'w': 4, 'h': 4},
                    'anchor': {'x': .5, 'y': .75},
                }
            atlas_name = 'fixture@2x.beauty.0.json'
            old_desc = {'frames': frames, 'meta': {'image': 'fixture@2x.beauty.png',
                        'size': {'w': 10, 'h': 4}, 'scale': 2}}
            (unit_dir / atlas_name).write_text(json.dumps(old_desc))
            meta = {'id': 'unit.fixture', 'frame_size_2x': [4, 4],
                    'anchor_2x': [2, 3], 'hardpoints_2x': {'gun': [1, 2]},
                    'states': [{'name': 'idle', 'directions': 16, 'frames': 1},
                               {'name': 'move', 'directions': 16, 'frames': 3}],
                    'atlases': {'2x': {'beauty': [atlas_name]}, '1x': {'beauty': []}}}
            outputs = resize.build_unit(unit_dir, meta)
            desc = json.loads(outputs[atlas_name])
            self.assertEqual(list(desc['frames']), keys)
            self.assertEqual(desc['meta']['scale'], 1.5)
            self.assertEqual(meta['atlas_resolution'], {'1x': 1, '2x': 1.5})
            self.assertEqual(meta['frame_size_2x'], [4, 4])
            self.assertEqual(meta['anchor_2x'], [2, 3])
            self.assertEqual(meta['hardpoints_2x'], {'gun': [1, 2]})
            self.assertEqual(meta['states'][1]['directions'], 16)
            rects = []
            for key in keys:
                old, new = frames[key], desc['frames'][key]
                rect = new['frame']
                self.assertEqual((rect['w'], rect['h']), (3, 3))
                self.assertEqual(new['sourceSize'], {'w': 3, 'h': 3})
                self.assertEqual(new['anchor'], old['anchor'])
                self.assertLessEqual(abs(rect['w'] / 1.5 - old['frame']['w'] / 2), .5)
                self.assertLessEqual(abs(rect['h'] / 1.5 - old['frame']['h'] / 2), .5)
                rects.append(rect)
            a, b = rects
            self.assertTrue(a['x'] + a['w'] + 2 <= b['x'] or b['x'] + b['w'] + 2 <= a['x'])
            resized_bytes = outputs['fixture@2x.beauty.png']
            with Image.open(BytesIO(resized_bytes)) as packed:
                self.assertEqual(desc['meta']['size'], {'w': packed.width, 'h': packed.height})
                self.assertEqual(packed.size, (12, 7))
                self.assertLessEqual(max(packed.size), resize.PAGE_LIMIT)


if __name__ == '__main__':
    unittest.main()
