"""Metadata-only RGBA8 page inventory, not measured runtime residency."""
from pathlib import Path
import hashlib
import json
import struct
import sys

REPO = Path(__file__).resolve().parents[3]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
handoff_path = REPO / sys.argv[1]
output = REPO / sys.argv[2]
assert not output.exists(), 'Use a fresh inventory receipt.'
handoff = json.loads(handoff_path.read_text())
aid = handoff['id']
prefix = 'sprites/' + aid + '/'
inputs = {str(handoff_path.relative_to(REPO)): sha(handoff_path)}


def source(name, complete_hash=True):
    row = handoff['files'][prefix + name]
    path = REPO / row['source']
    assert path.stat().st_size == row['bytes'], path
    if complete_hash:
        assert sha(path) == row['sha256'], path
    inputs[str(path.relative_to(REPO))] = row['sha256']
    return path


side = json.loads(source(aid + '.sprite.json').read_text())
result = {'id': aid, 'scope': 'Exact descriptor graph and PNG header RGBA8 allocation '
          'inventory. Handoff hashes supply image identity; only image headers '
          'are read here. No decoding, GPU/browser run or measured residency. '
          'Mipmaps, duplicate upload staging and runtime caches are excluded.',
          'handoff_sha256': sha(handoff_path), 'qualities': {}}
for quality, layers in side['atlases'].items():
    pages, frames = {}, {}
    for layer, descriptors in layers.items():
        for descriptor in descriptors:
            page = json.loads(source(descriptor).read_text())
            name = page['meta']['image']
            path = source(name, complete_hash=False)
            with path.open('rb') as stream:
                header = stream.read(24)
            assert header[:8] == b'\x89PNG\r\n\x1a\n' and header[12:16] == b'IHDR'
            width, height = struct.unpack('>II', header[16:24])
            assert page['meta']['size'] == {'w': width, 'h': height}
            assert name not in pages
            pages[name] = {'layer': layer, 'width': width, 'height': height,
                           'rgba8_bytes': width * height * 4}
            for key in page['frames']:
                frames.setdefault(key, []).append(name)
    states = {}
    maximum = {'rgba8_bytes': 0, 'keys': []}
    for key, names in frames.items():
        assert len(names) == len(set(names))
        byte_count = sum(pages[name]['rgba8_bytes'] for name in names)
        if byte_count > maximum['rgba8_bytes']:
            maximum = {'rgba8_bytes': byte_count, 'keys': [key], 'pages': names}
        elif byte_count == maximum['rgba8_bytes']:
            maximum['keys'].append(key)
        states.setdefault(key.split('/')[0], set()).update(names)
    result['qualities'][quality] = {
        'pages': len(pages), 'rgba8_all_pages_bytes': sum(p['rgba8_bytes'] for p in pages.values()),
        'largest_image_rgba8_bytes': max(p['rgba8_bytes'] for p in pages.values()),
        'largest_single_pose_page_set': maximum,
        'states': {state: {'pages': len(names), 'rgba8_bytes': sum(pages[n]['rgba8_bytes'] for n in names)}
                   for state, names in sorted(states.items())}, 'page_inventory': pages}
result['inputs'] = inputs
result['script_sha256'] = sha(Path(__file__))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({q: {'pages': r['pages'], 'full_mib': round(r['rgba8_all_pages_bytes'] / 1048576, 2),
                         'max_pose_mib': round(r['largest_single_pose_page_set']['rgba8_bytes'] / 1048576, 2)}
                  for q, r in result['qualities'].items()}))
