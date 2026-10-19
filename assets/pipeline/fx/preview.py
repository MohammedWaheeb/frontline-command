"""Quick in-memory preview of selected effects (pre-pack iteration aid).
usage: python preview.py <module> <effect-id-substring> [bg] [mag]"""
import importlib
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from contacts import magnify, strip, text

OUT = Path(__file__).resolve().parents[1] / "review" / "iteration"


def main():
    mod, key = sys.argv[1], sys.argv[2]
    bg = sys.argv[3] if len(sys.argv) > 3 else "dirt"
    mag = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    OUT.mkdir(parents=True, exist_ok=True)
    for eff in importlib.import_module(mod).effects({key}):
        if key not in eff.id:
            continue
        rows = []
        for name, clip in eff.clips.items():
            fr = [(f.image, f.ox, f.oy) for f in clip.frames]
            imgs = [f.image for f in clip.frames if f.image is not None]
            W = max(i.width for i in imgs) // eff.resolution + 8
            H = max(i.height for i in imgs) // eff.resolution + 14
            oy = max(f.oy for f in clip.frames if f.image is not None) // eff.resolution + 4
            ox = max(f.ox for f in clip.frames if f.image is not None) // eff.resolution + 4
            s = strip(fr, bg, (int(W), int(H)), (int(ox), int(oy)), eff.resolution)
            lab = Image.new("RGB", (s.width, 12), (33, 31, 26))
            text(ImageDraw.Draw(lab), (2, 0), f"{eff.id} / {name} fps{clip.fps} loop={clip.loop}")
            rows += [lab, s]
        sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), (33, 31, 26))
        y = 0
        for r in rows:
            sheet.paste(r, (0, y)); y += r.height
        if mag > 1:
            sheet = magnify(sheet, mag)
        p = OUT / f"{eff.id}.{bg}.x{mag}.png"
        sheet.save(p)
        print(p, sheet.size)


if __name__ == "__main__":
    main()
