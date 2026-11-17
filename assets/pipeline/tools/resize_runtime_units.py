#!/usr/bin/env python3
"""Reduce high-tier unit atlas dimensions while preserving the 2x world contract.

The resized atlas is still sampled as a high-tier runtime atlas, at 1.5 px per
logical pixel. Source frames and logical anchor/hardpoint metadata stay at 2x.
Original atlas and sprite metadata files are retained in a dated backup tree;
the receipt makes reruns safe and detects any subsequent source edits.
"""
from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import math
import os
from pathlib import Path
import shutil
import tempfile

from PIL import Image
from sprite_ink_bounds import add_ink_bounds

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / 'assets/build/sprites'
BACKUP = ROOT / '.local/asset-compression-originals-20261116/dimensions'
SCALE = 0.75
RUNTIME_SCALE = 1.5
ELIGIBLE_MIN = 96
ELIGIBLE_MAX = 200
PADDING = 2
PAGE_LIMIT = 2048


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def descriptor_sha256(path: Path) -> str:
    """Hash atlas geometry while tolerating a separately refreshed content hash.

    Atlas sidecars may be refreshed after final palette compression. That
    metadata-only update must not invalidate the resize receipt.
    """
    def without_content_hash(value):
        if isinstance(value, dict):
            return {k: without_content_hash(v) for k, v in value.items()
                    if k != 'content_sha256'}
        if isinstance(value, list):
            return [without_content_hash(v) for v in value]
        return value
    normalized = json.dumps(without_content_hash(json.loads(path.read_text())),
                            sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(normalized).hexdigest()


def dump_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, separators=(',', ':')) + '\n')


def eligible(meta: dict) -> bool:
    w, h = meta.get('frame_size_2x', (0, 0))
    return max(w, h) >= ELIGIBLE_MAX and min(w, h) >= ELIGIBLE_MIN


def resize_rgba(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Filtering unassociated RGB creates bright/dark fringes around transparent
    # pixels. Pillow's RGBa mode premultiplies alpha for the resampling pass.
    return im.convert('RGBA').convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')


def build_unit(unit_dir: Path, unit_meta: dict) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    atlas_files = unit_meta['atlases']['2x']
    for layer, names in atlas_files.items():
        for atlas_name in names:
            atlas_path = unit_dir / atlas_name
            desc = json.loads(atlas_path.read_text())
            im_path = unit_dir / desc['meta']['image']
            with Image.open(im_path) as source:
                source = source.convert('RGBA')
                frames = []
                for key, item in desc['frames'].items():
                    rect = item['frame']
                    crop = source.crop((rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h']))
                    w, h = max(1, math.floor(rect['w'] * SCALE + 0.5)), max(1, math.floor(rect['h'] * SCALE + 0.5))
                    frames.append((key, item, resize_rgba(crop, (w, h))))

            # The pages are uniform-frame atlases. A near-square shelf grid
            # gives each existing page a smaller, deterministic canvas.
            if not frames:
                raise ValueError(f'{atlas_name}: empty atlas')
            fw, fh = frames[0][2].size
            if any(frame.size != (fw, fh) for _, _, frame in frames):
                raise ValueError(f'{atlas_name}: variable frame dimensions are unsupported')
            count = len(frames)
            max_cols = (PAGE_LIMIT - PADDING) // (fw + PADDING)
            max_rows = (PAGE_LIMIT - PADDING) // (fh + PADDING)
            min_cols = math.ceil(count / max_rows)
            if max_cols < 1 or min_cols > max_cols:
                raise ValueError(f'{atlas_name}: frames cannot fit under {PAGE_LIMIT}px')
            cols = min(max_cols, max(min_cols, math.ceil(math.sqrt(count))))
            rows = math.ceil(len(frames) / cols)
            width = cols * fw + (cols + 1) * PADDING
            height = rows * fh + (rows + 1) * PADDING
            if width > PAGE_LIMIT or height > PAGE_LIMIT:
                raise ValueError(f'{atlas_name}: repacked page exceeds {PAGE_LIMIT}px')
            packed = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            for i, (key, item, frame) in enumerate(frames):
                col, row = i % cols, i // cols
                x, y = PADDING + col * (fw + PADDING), PADDING + row * (fh + PADDING)
                packed.alpha_composite(frame, (x, y))
                item['frame'] = {'x': x, 'y': y, 'w': fw, 'h': fh}
                item['spriteSourceSize'] = {'x': 0, 'y': 0, 'w': fw, 'h': fh}
                item['sourceSize'] = {'w': fw, 'h': fh}
            desc['meta']['size'] = {'w': width, 'h': height}
            desc['meta']['scale'] = RUNTIME_SCALE
            png = BytesIO()
            packed.save(png, format='PNG', optimize=True)
            png.seek(0)
            out[im_path.name] = png.read()
            out[atlas_path.name] = (json.dumps(desc, separators=(',', ':')) + '\n').encode()

    unit_meta['atlas_resolution'] = {'1x': 1, '2x': RUNTIME_SCALE}
    out[unit_dir.name + '.sprite.json'] = (json.dumps(unit_meta, indent=1) + '\n').encode()
    return out


def backup_unit(unit_dir: Path, receipt_path: Path) -> dict:
    # Capture only files touched by this transformation, keeping the backup
    # directory layout identical to the source tree.
    meta_path = unit_dir / (unit_dir.name + '.sprite.json')
    meta = json.loads(meta_path.read_text())
    paths = {meta_path}
    for names in meta['atlases']['2x'].values():
        for atlas_name in names:
            atlas_path = unit_dir / atlas_name
            desc = json.loads(atlas_path.read_text())
            paths.add(atlas_path)
            paths.add(unit_dir / desc['meta']['image'])
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    sources = {}
    for path in sorted(paths):
        rel = path.relative_to(ROOT)
        destination = BACKUP / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            shutil.copy2(path, destination)
        elif sha256(path) != sha256(destination):
            raise ValueError(f'{unit_dir.name}: input changed since its backup: {rel}')
        sources[str(rel)] = sha256(destination)
    return {'schema': 'fc-runtime-unit-resize/1', 'unit': unit_dir.name,
            'source_sha256': sources, 'output_sha256': {}}


def process(unit_dir: Path) -> str:
    unit_meta_path = unit_dir / (unit_dir.name + '.sprite.json')
    meta = json.loads(unit_meta_path.read_text())
    if not eligible(meta):
        return 'ineligible'
    receipt_path = BACKUP / unit_dir.name / 'resize-receipt.json'
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if receipt['unit'] != unit_dir.name:
            raise ValueError(f'{unit_dir.name}: invalid receipt')
        if receipt.get('status') == 'pending':
            output_hashes = receipt['pending_output_sha256']
            source_hashes = receipt['source_sha256']
            states = []
            for rel, output_hash in output_hashes.items():
                current_hash = sha256(ROOT / rel)
                states.append('output' if current_hash == output_hash else
                              'source' if current_hash == source_hashes[rel] else 'changed')
            if all(state == 'output' for state in states):
                receipt['status'] = 'complete'
                receipt['output_sha256'] = {
                    rel: digest for rel, digest in output_hashes.items() if rel.endswith('.json')
                }
                receipt.pop('pending_output_sha256', None)
                dump_json(receipt_path, receipt)
            elif all(state == 'source' for state in states):
                receipt_path.unlink()
            else:
                raise ValueError(f'{unit_dir.name}: interrupted resize left mixed or changed outputs; restore the unit from its backup before retrying')
        elif receipt.get('status') is None:
            receipt['status'] = 'complete'
            dump_json(receipt_path, receipt)
        if not receipt_path.exists():
            pass
        else:
            receipt = json.loads(receipt_path.read_text())
            if receipt.get('status') != 'complete':
                raise ValueError(f'{unit_dir.name}: invalid resize receipt state')
            expected = receipt['output_sha256']
            legacy_raw = any(not rel.endswith('.json') for rel in expected)
            mismatched = [rel for rel, digest in expected.items()
                          if (sha256(ROOT / rel) if legacy_raw else descriptor_sha256(ROOT / rel)) != digest]
            if mismatched:
                raise ValueError(f'{unit_dir.name}: output changed since resize: {mismatched[0]}')
            # Palette-only compression is allowed to rewrite PNG bytes. Validate
            # the packed page dimensions and frame geometry without requiring
            # pixel-identical output, and never touch an already-resized unit.
            for names in meta['atlases']['2x'].values():
                for atlas_name in names:
                    desc = json.loads((unit_dir / atlas_name).read_text())
                    image_path = unit_dir / desc['meta']['image']
                    with Image.open(image_path) as page:
                        declared = desc['meta']['size']
                        if page.size != (declared['w'], declared['h']):
                            raise ValueError(f'{unit_dir.name}: atlas geometry changed: {image_path.name}')
            # Upgrade receipts created by earlier versions and drop PNG hashes
            # so lossless palette optimization does not make a rerun destructive.
            receipt['status'] = 'complete'
            receipt['output_sha256'] = {
                rel: descriptor_sha256(ROOT / rel) for rel in receipt['output_sha256']
                if rel.endswith('.json')
            }
            receipt.pop('pending_output_sha256', None)
            dump_json(receipt_path, receipt)
            return 'already-resized'
    receipt = backup_unit(unit_dir, receipt_path)
    outputs = build_unit(unit_dir, meta)
    # Stage all changed outputs before replacing any of the unit's originals.
    with tempfile.TemporaryDirectory(prefix='.resize-unit-', dir=unit_dir) as tmp:
        staged = Path(tmp)
        for name, data in outputs.items():
            (staged / name).write_bytes(data)
        add_ink_bounds(staged, {'2x': meta['atlases']['2x']})
        for atlas_names in meta['atlases']['2x'].values():
            for atlas_name in atlas_names:
                outputs[atlas_name] = (staged / atlas_name).read_bytes()
        pending_hashes = {}
        for name, data in outputs.items():
            pending_path = staged / name
            if not pending_path.exists():
                pending_path.write_bytes(data)
            pending_hashes[str((unit_dir / name).relative_to(ROOT))] = hashlib.sha256(data).hexdigest()
        receipt['status'] = 'pending'
        receipt['pending_output_sha256'] = pending_hashes
        dump_json(receipt_path, receipt)
        for name in outputs:
            os.replace(staged / name, unit_dir / name)
    receipt['status'] = 'complete'
    # Atlas JSON and unit metadata define the layout. PNG bytes can be
    # losslessly palette-compressed later without making this tool destructive.
    receipt['output_sha256'] = {
        str((unit_dir / name).relative_to(ROOT)): descriptor_sha256(unit_dir / name)
        for name in outputs if name.endswith('.json')
    }
    receipt.pop('pending_output_sha256', None)
    dump_json(receipt_path, receipt)
    # Preserve original receipt schema, and make reruns detect edits to backup.
    return 'resized'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='*', help='Unit IDs to process (default: every eligible unit)')
    args = parser.parse_args()
    wanted = set(args.ids or [])
    units = sorted(SPRITES.glob('unit.*/unit.*.sprite.json'))
    counts = {'resized': 0, 'already-resized': 0, 'ineligible': 0}
    for path in units:
        meta = json.loads(path.read_text())
        if wanted and meta['id'] not in wanted:
            continue
        status = process(path.parent)
        counts[status] += 1
        print(f'{status}: {meta["id"]} frame_size_2x={meta["frame_size_2x"]}')
    if wanted:
        missing = wanted - {json.loads(path.read_text())['id'] for path in units}
        if missing:
            raise SystemExit('unknown unit IDs: ' + ', '.join(sorted(missing)))
    print(json.dumps(counts, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
