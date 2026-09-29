"""Contact sheet of rendered frames, composited exactly as the client will draw them.

Order per sprite: shadow (multiplied at SHADOW_OPACITY) -> beauty -> team mask tinted
with the player colour (Pixi `tint`, i.e. per-channel multiply) -> nothing else.

Usage:
  work/art/.venv/bin/python assets/pipeline/tools/preview_frames.py <asset-id> \
      [--states idle,move] [--team #3E8EDE] [--scale 2] [--out path.png]
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from composite import composite_sprite, hex_rgb  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('asset')
    ap.add_argument('--states')
    ap.add_argument('--team', default='#3E8EDE')
    ap.add_argument('--scale', type=int, default=1)
    ap.add_argument('--ground', default='#8C7F66')
    ap.add_argument('--out')
    ap.add_argument('--max-per-row', type=int, default=8)
    a = ap.parse_args()
    root = os.path.join(REPO, 'assets', 'build', 'frames', a.asset)
    states = sorted(os.listdir(os.path.join(root, 'beauty')))
    if a.states:
        states = [s for s in states if s in a.states.split(',')]
    tiles = []
    for s in states:
        for p in sorted(glob.glob(os.path.join(root, 'beauty', s, '*.png'))):
            tiles.append((s, os.path.basename(p)[:-4]))
    if not tiles:
        raise SystemExit('no frames')
    first = Image.open(os.path.join(root, 'beauty', tiles[0][0], tiles[0][1] + '.png'))
    w, h = first.size
    cols = min(a.max_per_row, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    lab = 14
    sheet = Image.new('RGBA', (cols * w, rows * (h + lab)), hex_rgb(a.ground) + (255,))
    draw = ImageDraw.Draw(sheet)
    for i, (s, fn) in enumerate(tiles):
        x, y = (i % cols) * w, (i // cols) * (h + lab)
        cell = sheet.crop((x, y + lab, x + w, y + lab + h))
        cell = composite_sprite(cell, root, s, fn, a.team)
        sheet.paste(cell, (x, y + lab))
        draw.text((x + 3, y + 1), f'{s} {fn}', fill=(20, 20, 20, 255))
    if a.scale != 1:
        sheet = sheet.resize((sheet.width * a.scale, sheet.height * a.scale), Image.LANCZOS)
    out = a.out or os.path.join(REPO, 'work', 'art', 'previews', f'{a.asset}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.convert('RGB').save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
