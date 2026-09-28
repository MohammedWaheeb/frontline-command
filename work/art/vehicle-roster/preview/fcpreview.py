"""Blender-free design preview for the vehicle/aircraft roster models.

Why: this host allows exactly one Blender worker (operated by the coordinator), so
model iteration would otherwise be blind. This module is a *recording stub* of the
fclib API subset used by vehicle_roster.py / aircraft_roster.py: the same primitive
geometry (box taper/top_shift, cone/cylinder, slab, prism, UV sphere, circle decal),
the same parenting (parent.matrix_world @ T @ Rxyz @ S), the same camera basis
(30 deg elevation, 45 deg azimuth, 2x pixels) and the same sun vector. A painter's
rasterizer draws flat-shaded faces and projected ground shadows.

It is a design/registration review aid only. It is NOT production art: no Cycles
lighting, bevels, AO, grime or materials. Production frames come only from
assets/pipeline/blender/render_asset.py via the coordinator's single worker.
"""
import math
import random
import sys
import types

import numpy as np
from PIL import Image, ImageDraw

ART_SCALE = 2
PX_PER_BU = 64 * ART_SCALE / math.sqrt(2)
CAM_EL = math.radians(30.0)
SUN_EL, SUN_TR = 50.0, 33.4

FACTION_PAINT = {
    'US': {'paint': '#666B5C', 'paint2': '#555A4E', 'trim': '#2F3331', 'wall': '#B3B2A2'},
    'IR': {'paint': '#6E6A47', 'paint2': '#56593F', 'trim': '#2E3128', 'wall': '#A59C7C'},
    'SY': {'paint': '#8A6A43', 'paint2': '#6F6553', 'trim': '#3F3226', 'wall': '#AE9670'},
    'SA': {'paint': '#AE9669', 'paint2': '#8F7D5C', 'trim': '#4C4436', 'wall': '#CDB98F'},
}
TEAM_BEAUTY_GREY = '#9DA3A8'
STATE = {'char': 0.0, 'grime': 0.0, 'emission': 1.0}
SCENE = []            # every created object, in creation order


# --------------------------------------------------------------------------- math
def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class V3(list):
    """Mutable 3-vector with .x/.y/.z like mathutils.Vector/Euler."""
    def __init__(self, v=(0, 0, 0)):
        super().__init__([float(v[0]), float(v[1]), float(v[2])])
    x = property(lambda s: s[0], lambda s, v: s.__setitem__(0, float(v)))
    y = property(lambda s: s[1], lambda s, v: s.__setitem__(1, float(v)))
    z = property(lambda s: s[2], lambda s, v: s.__setitem__(2, float(v)))

    def copy(self):
        return V3(self)


class Obj:
    def __init__(self, name, verts=None, faces=None, material=None):
        self.name = name
        self.type = 'MESH' if verts is not None else 'EMPTY'
        self.verts = np.array(verts, float) if verts is not None else None
        self.faces = faces or []
        self.material = material
        self._loc, self._rot, self._scl = V3(), V3(), V3((1, 1, 1))
        self.parent = None
        self.hide_render = False
        self.visible_shadow = True
        self.props = {}
        SCENE.append(self)

    location = property(lambda s: s._loc, lambda s, v: setattr(s, '_loc', V3(v)))
    rotation_euler = property(lambda s: s._rot, lambda s, v: setattr(s, '_rot', V3(v)))
    scale = property(lambda s: s._scl, lambda s, v: setattr(s, '_scl', V3(v)))

    def __getitem__(self, k):
        return self.props[k]

    def __setitem__(self, k, v):
        self.props[k] = v

    def get(self, k, d=None):
        return self.props.get(k, d)

    @property
    def children(self):
        return [o for o in SCENE if o.parent is self]

    def local_matrix(self):
        m = np.eye(4)
        r = rz(self._rot[2]) @ ry(self._rot[1]) @ rx(self._rot[0])
        m[:3, :3] = r @ np.diag(self._scl)
        m[:3, 3] = self._loc
        return m

    @property
    def matrix_world(self):
        m = self.local_matrix()
        return (self.parent.matrix_world @ m) if self.parent is not None else m

    def world_verts(self):
        m = self.matrix_world
        return self.verts @ m[:3, :3].T + m[:3, 3]


class Mat:
    def __init__(self, name, color, team=False, emission=None, alpha=1.0):
        self.name, self.color, self.team, self.emission, self.alpha = name, color, team, emission, alpha

    def get(self, k, d=None):
        return {'fc_team': 1 if self.team else 0, 'fc_emissive': 1 if self.emission else 0}.get(k, d)


_MATS = {}


def mat(name, color, rough=0.6, metal=0.0, grime=0.35, team=False, emission=None, emission_strength=0.0, alpha=1.0):
    if name not in _MATS:
        _MATS[name] = Mat(name, TEAM_BEAUTY_GREY if team else (color or '#888888'), team, emission, alpha)
    return _MATS[name]


def faction_mats(faction):
    p = FACTION_PAINT[faction]
    return {
        'paint': mat(f'{faction}_paint', p['paint']), 'paint2': mat(f'{faction}_paint2', p['paint2']),
        'trim': mat(f'{faction}_trim', p['trim']), 'wall': mat(f'{faction}_wall', p['wall']),
        'team': mat(f'{faction}_team', None, team=True), 'metal': mat('gunmetal', '#3C4044'),
        'dark': mat('dark_rubber', '#1E2022'), 'glass': mat('glass_dark', '#1F2A30'),
        'canvas': mat('canvas_khaki', '#8A7F62'), 'light': mat('lamp_amber', '#403424', emission='#FFC46B'),
        'lens': mat('lens_cyan', '#10202A', emission='#6BE6FF'), 'concrete': mat('concrete', '#8E8A80'),
        'concrete_dark': mat('concrete_dark', '#6A675F'),
    }


def set_grime_all(v):
    STATE['grime'] = v


def set_char_all(v):
    STATE['char'] = v


def set_emission_scale(v):
    STATE['emission'] = v


def srgb(h):
    return h


def rng(seed):
    return random.Random(seed)


def heading_to_blender_z(index, count):
    return -2 * math.pi * index / count


# --------------------------------------------------------------------------- primitives (mirror fclib)
def _obj(name, verts, faces, material, parent, loc, rot):
    o = Obj(name, verts, faces, material)
    o.location, o.rotation_euler = loc, rot
    o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = Obj(name)
    o.location = loc
    o.parent = parent
    return o


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.015, parent=None, taper=(1.0, 1.0),
        top_shift=(0.0, 0.0)):
    sx, sy, sz = size
    v = []
    for z in (-0.5, 0.5):
        for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            X, Y = x * sx, y * sy
            if z > 0:
                X, Y = X * taper[0] + top_shift[0], Y * taper[1] + top_shift[1]
            v.append((X, Y, z * sz))
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return _obj(name, v, f, material, parent, loc, rot)


def cyl(name, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), material=None, verts=20, bevel=0.01, parent=None,
        radius_top=None, smooth=True):
    rt = radius if radius_top is None else radius_top
    n = verts
    v = [(radius * math.cos(2 * math.pi * i / n), radius * math.sin(2 * math.pi * i / n), -depth / 2) for i in range(n)]
    v += [(rt * math.cos(2 * math.pi * i / n), rt * math.sin(2 * math.pi * i / n), depth / 2) for i in range(n)]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _obj(name, v, f, material, parent, loc, rot)


def sphere(name, radius, loc=(0, 0, 0), material=None, parent=None, scale=(1, 1, 1), segs=16):
    u, w = segs, max(8, segs // 2)
    v = [(0, 0, radius)]
    for j in range(1, w):
        t = math.pi * j / w
        for i in range(u):
            p = 2 * math.pi * i / u
            v.append((radius * math.sin(t) * math.cos(p), radius * math.sin(t) * math.sin(p), radius * math.cos(t)))
    v.append((0, 0, -radius))
    f = []
    for i in range(u):
        f.append((0, 1 + i, 1 + (i + 1) % u))
    for j in range(w - 2):
        a, b = 1 + j * u, 1 + (j + 1) * u
        for i in range(u):
            f.append((a + i, b + i, b + (i + 1) % u, a + (i + 1) % u))
    last = len(v) - 1
    base = 1 + (w - 2) * u
    for i in range(u):
        f.append((base + (i + 1) % u, base + i, last))
    o = _obj(name, v, f, material, parent, loc, (0, 0, 0))
    o.scale = scale
    return o


def prism(name, profile, depth, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.01, parent=None):
    n = len(profile)
    v = [(x, -depth / 2, z) for x, z in profile] + [(x, depth / 2, z) for x, z in profile]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _obj(name, v, f, material, parent, loc, rot)


def slab(name, poly, z0, z1, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.012, parent=None, top_scale=1.0,
         top_shift=(0.0, 0.0)):
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cy = sum(p[1] for p in poly) / n
    v = [(x, y, z0) for x, y in poly]
    v += [(cx + (x - cx) * top_scale + top_shift[0], cy + (y - cy) * top_scale + top_shift[1], z1) for x, y in poly]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _obj(name, v, f, material, parent, loc, rot)


def scorch_decal(name, radius, parent=None, seed=3):
    n = 24
    v = [(radius * math.cos(2 * math.pi * i / n), radius * math.sin(2 * math.pi * i / n), 0) for i in range(n)]
    o = _obj(name, v, [tuple(range(n))], Mat(name, '#141210', alpha=0.72), parent, (0, 0, 0.004), (0, 0, 0))
    o.visible_shadow = False
    o.props['decal'] = True
    return o


class Rig:
    def __init__(self, root):
        self.root = root
        self.parts = {}
        self.hardpoints = {}

    def meshes(self):
        return [o for o in SCENE if o.type == 'MESH']


def reset():
    SCENE.clear()
    _MATS.clear()
    STATE.update(char=0.0, grime=0.0, emission=1.0)


# --------------------------------------------------------------------------- camera / raster
def camera_basis(elevation_deg=30.0, azimuth_view=(1, -1)):
    el = math.radians(elevation_deg)
    h = np.array([azimuth_view[0], azimuth_view[1], 0.0])
    h /= np.linalg.norm(h)
    d = np.array([h[0] * math.cos(el), h[1] * math.cos(el), math.sin(el)])   # toward camera
    r = np.cross(-d, [0, 0, 1])
    r /= np.linalg.norm(r)
    u = np.cross(d, r)
    return r, u, d


def sun_travel():
    """fclib sun: rotation (0, -(90-el), tr) applied to (0, 0, -1)."""
    a = -math.radians(90 - SUN_EL)
    x, z = -math.sin(a), -math.cos(a)          # Ry(a) @ (0, 0, -1)
    t = math.radians(SUN_TR)
    v = np.array([x * math.cos(t), x * math.sin(t), z])
    return v / np.linalg.norm(v)


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def project(points, canvas, anchor, basis, px_per_bu=PX_PER_BU, ss=1):
    r, u, _ = basis
    ax, ay = anchor
    return np.stack([(ax + points @ r * px_per_bu) * ss, (ay - points @ u * px_per_bu) * ss], axis=1)


def render(objs, shadow_objs, canvas, anchor, team='#C6A34A', basis=None, ss=3, px_per_bu=PX_PER_BU, ground=None,
           shadow=True):
    """Return RGBA preview: ground shadow (0.46) + flat-shaded faces, painter-sorted."""
    basis = basis or camera_basis()
    r, u, d = basis
    W, H = canvas
    img = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0) if ground is None else ground)
    trav = sun_travel()
    lfrom = -trav
    if shadow:
        sh = Image.new('L', (W * ss, H * ss), 0)
        sd = ImageDraw.Draw(sh)
        for o in shadow_objs:
            if o.type != 'MESH' or not o.visible_shadow:
                continue
            wv = o.world_verts()
            t = np.clip(wv[:, 2], 0, None) / -trav[2]
            g = wv + trav[None, :] * t[:, None]
            g[:, 2] = 0
            p = project(g, canvas, anchor, basis, px_per_bu, ss)
            for f in o.faces:
                if len(f) >= 3:
                    sd.polygon([tuple(p[i]) for i in f], fill=255)
        shimg = Image.new('RGBA', sh.size, (0, 0, 0, 0))
        shimg.putalpha(sh.point(lambda a: int(a * 0.46)))
        img.alpha_composite(shimg)
    faces = []
    team_rgb = hex_rgb(team)
    for o in objs:
        if o.type != 'MESH':
            continue
        wv = o.world_verts()
        p = project(wv, canvas, anchor, basis, px_per_bu, ss)
        m = o.material
        base = hex_rgb(m.color) if m else np.array([128, 128, 128.0])
        if m and m.team:
            base = team_rgb
        dark = 1 - 0.85 * STATE['char'] if not (m and m.team) else 1 - 0.6 * STATE['char']
        for f in o.faces:
            if len(f) < 3:
                continue
            pts = wv[list(f)]
            n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
            ln = np.linalg.norm(n)
            if ln < 1e-12:
                continue
            n /= ln
            if o.get('decal'):
                col = np.array([20, 18, 16.0])
                alpha = int(255 * 0.72)
            else:
                if n @ d <= 0:      # back face
                    continue
                lam = max(0.0, float(n @ lfrom))
                shade = 0.42 + 0.72 * lam + 0.10 * max(0.0, float(n[2]))
                col = base * shade * dark
                if m and m.emission and STATE['emission'] > 0:
                    col = col * 0.3 + hex_rgb(m.emission) * 0.8 * STATE['emission']
                alpha = 255 if not m or m.alpha >= 1 else int(255 * m.alpha)
            depth = float(pts.mean(axis=0) @ d) + (-10 if o.get('decal') else 0)
            faces.append((depth, [tuple(p[i]) for i in f], tuple(int(c) for c in np.clip(col, 0, 255)) + (alpha,)))
    faces.sort(key=lambda t: t[0])
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer, 'RGBA')
    for _, poly, col in faces:
        dr.polygon(poly, fill=col, outline=tuple(int(c * 0.55) for c in col[:3]) + (col[3],))
    img.alpha_composite(layer)
    return img.resize((W, H), Image.LANCZOS)


def portrait_basis(elevation=20.0):
    az = math.radians(-35)
    return camera_basis(elevation, (math.cos(az), math.sin(az)))


def install():
    """Register this module as `fclib` (and a tiny `bpy`) so model scripts import unchanged."""
    me = sys.modules[__name__]
    sys.modules['fclib'] = me
    bpy = types.ModuleType('bpy')
    bpy.context = types.SimpleNamespace(view_layer=types.SimpleNamespace(update=lambda: None))
    sys.modules['bpy'] = bpy
    me.bpy = bpy
    mu = types.ModuleType('mathutils')
    mu.Vector = lambda v: np.array(v, float)
    sys.modules.setdefault('mathutils', mu)
    return me
