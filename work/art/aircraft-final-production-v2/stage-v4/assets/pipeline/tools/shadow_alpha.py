"""Remove disconnected Cycles shadow-catcher noise before runtime atlas packing.

The transparent plane produces alpha 1–6 across otherwise empty image pixels,
plus occasional isolated 1-pixel corner spikes. These are unrelated to geometry
and defeat union trimming. Keep substantive alpha>8 connected components and
four physical pixels of their original penumbra. Never crop a substantive shadow
at the image boundary: the independent clipping check must still reject it.
Raw render PNGs remain untouched for inspection and reproducibility.
"""
import numpy as np
from PIL import Image, ImageFilter

SUPPORT_ALPHA = 8
MIN_COMPONENT_PIXELS = 8
PENUMBRA_PIXELS = 4


def clean_shadow_alpha(alpha):
    source = np.asarray(alpha, dtype=np.uint8)
    if source.ndim != 2:
        raise ValueError('shadow alpha must be a two-dimensional channel')
    # Run-length connected components (8-neighbour). Cost follows silhouette
    # complexity rather than iterating every foreground pixel in Python.
    parents, sizes, runs = [], [], []

    def find(label):
        while parents[label] != label:
            parents[label] = parents[parents[label]]
            label = parents[label]
        return label

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            if sizes[a] < sizes[b]:
                a, b = b, a
            parents[b] = a
            sizes[a] += sizes[b]
        return a

    previous = []
    for y, row in enumerate(source > SUPPORT_ALPHA):
        edges = np.flatnonzero(np.diff(np.concatenate(([False], row, [False]))))
        current, scan = [], 0
        for x0, x1 in zip(edges[::2], edges[1::2]):
            x0, x1 = int(x0), int(x1)
            label = len(parents)
            parents.append(label)
            sizes.append(x1-x0)
            while scan < len(previous) and previous[scan][1] < x0:
                scan += 1
            j = scan
            while j < len(previous) and previous[j][0] <= x1:
                label = union(label, previous[j][2])
                j += 1
            current.append((x0, x1, label))
            runs.append((y, x0, x1, label))
        previous = current
    support = np.zeros(source.shape, dtype=np.uint8)
    for y, x0, x1, label in runs:
        if sizes[find(label)] >= MIN_COMPONENT_PIXELS:
            support[y, x0:x1] = 255
    if not support.any():
        return np.zeros_like(source)
    keep = np.asarray(Image.fromarray(support).filter(ImageFilter.MaxFilter(PENUMBRA_PIXELS*2+1))) > 0
    return np.where(keep, source, 0).astype(np.uint8)
