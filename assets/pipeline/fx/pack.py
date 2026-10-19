"""Serial, exact-byte FX atlas exporter. No live asset or manifest writes."""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import math
import re
import time
from pathlib import Path

from PIL import Image, ImageDraw

from contacts import background, text


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def crop_frame(frame, label):
    """Retain the authored world origin and transparent padding around it."""
    if frame.image is None:
        return Image.new("RGBA", (1, 1)), (0, 0), {"empty": True}
    im = frame.image
    if im.mode != "RGBA":
        raise ValueError(f"{label}: expected straight RGBA")
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("RGBA", (1, 1)), (0, 0), {"empty": True}
    if bbox[0] == 0 or bbox[1] == 0 or bbox[2] == im.width or bbox[3] == im.height:
        raise ValueError(f"{label}: painted alpha touches source canvas edge: {bbox} / {im.size}")
    ox, oy = frame.ox, frame.oy
    if not (math.isfinite(ox) and math.isfinite(oy) and 0 <= ox < im.width and 0 <= oy < im.height):
        raise ValueError(f"{label}: source anchor must be inside the authored canvas")
    # Including the anchor prevents drift during crop and avoids an invalid
    # far-outside anchor for late drifting smoke. No origin clamping or shifting.
    box = (min(bbox[0], math.floor(ox)), min(bbox[1], math.floor(oy)),
           max(bbox[2], math.floor(ox) + 1), max(bbox[3], math.floor(oy) + 1))
    out = im.crop(box)
    origin = (ox - box[0], oy - box[1])
    assert 0 <= origin[0] < out.width and 0 <= origin[1] < out.height
    return out, origin, {"empty": False, "canvas": im.size, "crop": box, "origin": origin}


def arrange(images, limit, gutter=2):
    """Stable height-first shelves, with no overlapping or touching frames."""
    order = sorted(range(len(images)), key=lambda i: (-images[i].height, -images[i].width, i))
    positions = {}
    pages = []
    x = y = row_height = 0
    used_w = used_h = 0
    for i in order:
        w, h = images[i].width + gutter * 2, images[i].height + gutter * 2
        if w > limit or h > limit:
            return None
        if x + w > limit:
            x, y, row_height = 0, y + row_height, 0
        if y + h > limit:
            pages.append((used_w, used_h))
            x = y = row_height = used_w = used_h = 0
        positions[i] = (len(pages), x + gutter, y + gutter)
        used_w, used_h = max(used_w, x + w), max(used_h, y + h)
        row_height = max(row_height, h)
        x += w
    pages.append((used_w, used_h))
    if len(pages) > 8:
        return None
    return positions, pages


def pack_effect(effect, root):
    if not re.fullmatch(r"fx\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+", effect.id):
        raise ValueError("invalid effect id")
    group, name = effect.id.split(".")[1:]
    directory = root / "fx" / group / name
    directory.mkdir(parents=True, exist_ok=False)
    unique, lookup, clips, checks = [], {}, {}, []
    for clip_name, clip in effect.clips.items():
        refs = []
        for i, frame in enumerate(clip.frames):
            im, origin, check = crop_frame(frame, f"{effect.id}/{clip_name}/{i}")
            raw = im.tobytes()
            key = (im.size, digest(raw))
            if key not in lookup:
                lookup[key] = len(unique)
                unique.append(im)
            refs.append((lookup[key], origin))
            checks.append({"clip": clip_name, "frame": i, **check})
        clips[clip_name] = {"fps": clip.fps, "loop": clip.loop, "refs": refs}
    candidates = [arrange(unique, n) for n in (128, 256, 512, 1024, 2048)]
    candidates = [p for p in candidates if p is not None]
    if not candidates:
        raise ValueError(f"{effect.id}: cannot fit runtime page limits")
    positions, sizes = min(candidates, key=lambda p: (sum(w*h for w, h in p[1]), len(p[1])))
    atlases = [Image.new("RGBA", size) for size in sizes]
    for i, im in enumerate(unique):
        page, x, y = positions[i]
        # No alpha mask: source bytes remain straight RGBA, not applied twice.
        atlases[page].paste(im, (x, y))
    pages = []
    for i, atlas in enumerate(atlases):
        file = f"page{i}.png"
        atlas.save(directory / file, optimize=False)
        data = (directory / file).read_bytes()
        if len(data) > 8 * 1024 * 1024:
            raise ValueError("PNG exceeds runtime byte limit")
        pages.append({"file": file, "sha256": digest(data), "bytes": len(data), "width": atlas.width, "height": atlas.height})
    packed = {}
    for clip_name, clip in clips.items():
        frames = []
        for index, origin in clip["refs"]:
            page, x, y = positions[index]
            im = unique[index]
            frames.append({"page": page, "x": x, "y": y, "w": im.width, "h": im.height, "origin": origin})
            assert atlases[page].crop((x, y, x + im.width, y + im.height)).tobytes() == im.tobytes()
        packed[clip_name] = {"fps": clip["fps"], "loop": clip["loop"], "frames": frames}
    metadata = {"format": 1, "id": effect.id, "resolution": effect.resolution,
                "pages": pages, "clips": packed, "variants": effect.variants}
    data = json_bytes(metadata)
    (directory / "effect.json").write_bytes(data)
    descriptor = {"url": f"fx/{group}/{name}/effect.json", "sha256": digest(data), "bytes": len(data)}
    report = {"id": effect.id, "intent": effect.intent, "wiring": effect.wiring, "notes": effect.notes,
              "unique_images": len(unique), "pages": pages, "decoded_bytes": sum(w*h*4 for w, h in sizes),
              "clips": {n: {"frames": len(c.frames), "fps": c.fps,
                              "duration_ticks": len(c.frames)*20/c.fps if c.fps else 0,
                              "terminal_empty": c.frames[-1].image is None or c.frames[-1].image.getchannel("A").getbbox() is None}
                        for n, c in effect.clips.items()},
              "edge_crop_roundtrip_checks": checks}
    return descriptor, report


def review(effect, root, kinds=("dirt", "dark", "concrete")):
    """Every sampled tick at native size, eight cells per row; no upscaling."""
    root.mkdir(parents=True, exist_ok=True)
    imgs = [f for c in effect.clips.values() for f in c.frames if f.image is not None]
    cw = max(f.image.width for f in imgs) // effect.resolution + 8
    ch = max(f.image.height for f in imgs) // effect.resolution + 18
    for kind in kinds:
        rows = []
        for name, clip in effect.clips.items():
            label = Image.new("RGB", (cw * 8, 16), (33, 31, 26))
            text(ImageDraw.Draw(label), (3, 2), f"{effect.id} / {name} / {clip.fps} fps / {len(clip.frames)} ticks")
            rows.append(label)
            for start in range(0, len(clip.frames), 8):
                row = Image.new("RGB", (cw * 8, ch), (33, 31, 26))
                for k, f in enumerate(clip.frames[start:start+8]):
                    tile = background(kind, cw, ch)
                    if f.image is not None:
                        im = f.image if effect.resolution == 1 else f.image.resize((f.image.width//effect.resolution, f.image.height//effect.resolution), Image.Resampling.BOX)
                        tile.paste(im, (4, 2), im)
                    text(ImageDraw.Draw(tile), (3, ch-13), f"tick {start+k}")
                    row.paste(tile, (k*cw, 0))
                rows.append(row)
        sheet = Image.new("RGB", (cw*8, sum(r.height for r in rows)))
        y = 0
        for row in rows:
            sheet.paste(row, (0, y)); y += row.height
        sheet.save(root / f"{effect.id}.{kind}@1x.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--module", default="fam_explosion")
    ap.add_argument("--ids", required=True, nargs="+")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    source = Path(__file__).parent
    report = {"source_sha256": {f.name: digest(f.read_bytes()) for f in sorted(source.glob("*.py"))},
              "ids": args.ids, "effects": [], "status": "running"}
    index = {"format": 1, "effects": {}}
    try:
        for eid in args.ids:
            tick = time.monotonic()
            generated = importlib.import_module(args.module).effects({eid})
            if len(generated) != 1 or generated[0].id != eid:
                raise ValueError(f"unknown or repeated effect {eid}")
            eff = generated[0]
            desc, result = pack_effect(eff, args.out)
            review(eff, args.out / "review")
            index["effects"][eid] = desc
            result["elapsed_seconds"] = round(time.monotonic()-tick, 3)
            report["effects"].append(result)
            print(eid, "packed", result["unique_images"], "unique frames,", result["decoded_bytes"], "decoded bytes,", result["elapsed_seconds"], "seconds", flush=True)
            del generated, eff
        (args.out / "fx/index.json").write_bytes(json_bytes(index))
        report["status"] = "packed; runtime-schema and visual acceptance pending"
    except BaseException as error:
        report.update(status="failed", error=str(error))
        raise
    finally:
        report["elapsed_seconds"] = round(time.monotonic()-started, 3)
        (args.out / "report.json").write_bytes(json_bytes(report))


if __name__ == "__main__":
    main()
