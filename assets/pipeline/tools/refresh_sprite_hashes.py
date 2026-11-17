"""Refresh exact-byte sprite identities after export compression.

Run after resize_runtime_units.py and compress_runtime_graphics.py. The hash
matches pack_sprites.py: sorted atlas filenames followed by their exact bytes.
Logical geometry, frame declarations and source provenance are preserved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import os

ROOT = Path(__file__).resolve().parents[3]
BACKUP = ROOT / '.local/asset-compression-originals-20261116/sidecars'


def content_hash(sidecar):
    meta = json.loads(sidecar.read_text())
    names = set()
    for layers in meta['atlases'].values():
        for pages in layers.values():
            for name in pages:
                if Path(name).name != name:
                    raise ValueError('Atlas path escapes sprite directory')
                atlas = json.loads((sidecar.parent / name).read_text())
                image = atlas['meta']['image']
                if Path(image).name != image:
                    raise ValueError('Image path escapes sprite directory')
                names.update((name, image))
    digest = hashlib.sha256()
    for name in sorted(names):
        digest.update(name.encode() + (sidecar.parent / name).read_bytes())
    return meta, digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    checked = updated = 0
    for sidecar in sorted((ROOT / 'assets/build/sprites').glob('*/*.sprite.json')):
        meta, digest = content_hash(sidecar)
        checked += 1
        if meta.get('content_sha256') == digest:
            continue
        if args.check:
            raise ValueError(f'Stale sprite content identity: {sidecar}')
        backup = BACKUP / sidecar.relative_to(ROOT)
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(sidecar, backup)
        meta['content_sha256'] = digest
        pending = sidecar.with_suffix('.json.hash-pending')
        pending.write_text(json.dumps(meta, indent=1) + '\n')
        os.replace(pending, sidecar)
        updated += 1
    print(json.dumps({'checked': checked, 'updated': updated, 'verified': args.check}))


if __name__ == '__main__':
    main()
