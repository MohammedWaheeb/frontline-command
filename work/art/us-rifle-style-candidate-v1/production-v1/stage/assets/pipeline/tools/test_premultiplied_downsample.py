"""Coverage/color regressions for exported 1x beauty, team and shadow plates."""
import unittest
import numpy as np
from PIL import Image
from pack_sprites import downsample_premultiplied, normalise


def filtered_channel(channel, factor=2):
    return np.asarray(Image.fromarray(np.asarray(channel, dtype=np.float32)).resize(
        (max(1, channel.shape[1] // factor), max(1, channel.shape[0] // factor)), Image.Resampling.LANCZOS))


class PremultipliedDownsampleTests(unittest.TestCase):
    def fixture(self, color=(96, 128, 160)):
        image = np.zeros((32, 32, 4), dtype=np.float32)
        image[5:27, 5:27] = [*color, 255]
        return image

    def test_constant_color_survives_partial_and_opaque_edges(self):
        source = self.fixture()
        result = downsample_premultiplied(source)
        visible = result[..., 3] > 0
        partial = (result[..., 3] >= 32) & (result[..., 3] <= 223)
        self.assertGreater(int(partial.sum()), 20)
        np.testing.assert_array_equal(result[..., :3][visible], np.tile([96, 128, 160], (int(visible.sum()), 1)))

    def test_invisible_rgb_cannot_bleed(self):
        source = self.fixture()
        hidden = source[..., 3] == 0
        dirty = source.copy()
        dirty[hidden, :3] = [255, 0, 255]
        np.testing.assert_array_equal(downsample_premultiplied(source), downsample_premultiplied(dirty))
        result = downsample_premultiplied(dirty)
        self.assertTrue((result[result[..., 3] == 0, :3] == 0).all())

    def test_lanczos_impulse_negative_and_overshoot_edges(self):
        impulse = np.zeros((32, 32, 4), dtype=np.float32)
        impulse[:, 15] = [96, 128, 160, 255]
        raw_alpha = filtered_channel(impulse[..., 3])
        self.assertTrue((raw_alpha < 0).any())
        result = downsample_premultiplied(impulse)
        self.assertTrue((result[raw_alpha < 0] == 0).all())
        visible = result[..., 3] > 0
        np.testing.assert_array_equal(result[..., :3][visible], np.tile([96, 128, 160], (int(visible.sum()), 1)))
        step = self.fixture()
        raw_alpha = filtered_channel(step[..., 3])
        overshoot = raw_alpha > 255
        self.assertTrue(overshoot.any())
        result = downsample_premultiplied(step)
        np.testing.assert_array_equal(result[overshoot], np.tile([96, 128, 160, 255], (int(overshoot.sum()), 1)))

    def test_alpha_is_filtered_once(self):
        source = self.fixture()
        source[7:25, 7:25, 3] = 77
        result = downsample_premultiplied(source)
        expected = filtered_channel(source[..., 3]).clip(0, 255).round().astype(np.uint8)
        np.testing.assert_array_equal(result[..., 3], expected)

    def test_opaque_rgb_filter_and_odd_dimensions(self):
        rng = np.random.default_rng(17)
        source = rng.integers(0, 256, (23, 35, 4)).astype(np.float32)
        source[..., 3] = 255
        result = downsample_premultiplied(source)
        expected = np.stack([filtered_channel(source[..., c]) for c in range(3)], axis=-1).clip(0, 255).round().astype(np.uint8)
        self.assertEqual(result.shape, (11, 17, 4))
        np.testing.assert_array_equal(result[..., :3], expected)
        self.assertTrue((result[..., 3] == 255).all())

    def test_composition_matches_filtering_at_partial_edges(self):
        source = self.fixture((48, 150, 92))
        background = np.array([129, 117, 94], dtype=np.float32)
        coverage = source[..., 3:4] / 255
        composited = source[..., :3] * coverage + background * (1 - coverage)
        expected = np.stack([filtered_channel(composited[..., c]) for c in range(3)], axis=-1)
        result = downsample_premultiplied(source).astype(np.float32)
        alpha = result[..., 3:4] / 255
        actual = result[..., :3] * alpha + background * (1 - alpha)
        partial = (result[..., 3] > 16) & (result[..., 3] < 239)
        self.assertLess(float(np.abs(actual - expected)[partial].max()), 1.0)

    def test_beauty_team_shadow_contracts(self):
        source = self.fixture()
        source[9:21, 9:21, :3] = [40, 70, 90]
        beauty = downsample_premultiplied(normalise('beauty', Image.fromarray(source.astype(np.uint8), 'RGBA')))
        team = downsample_premultiplied(normalise('team', Image.fromarray(source.astype(np.uint8), 'RGBA')))
        shadow = downsample_premultiplied(normalise('shadow', Image.fromarray(source.astype(np.uint8), 'RGBA')))
        np.testing.assert_array_equal(beauty[..., 3], team[..., 3])
        np.testing.assert_array_equal(team[..., 0], team[..., 1])
        np.testing.assert_array_equal(team[..., 1], team[..., 2])
        self.assertTrue((shadow[..., :3] == 0).all())
        self.assertGreater(int((shadow[..., 3] > 0).sum()), 20)


if __name__ == '__main__':
    unittest.main()
