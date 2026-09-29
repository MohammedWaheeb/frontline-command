"""Replace a shaded RGBA8 PNG's alpha with linear emission coverage.

Uses only Python's standard library, including inside Blender. Original RGB
bytes and ancillary PNG chunks are preserved. No quantization tolerance is used.
"""
import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def _read(path):
    with open(path, 'rb') as handle:
        source = handle.read()
    if source[:8] != SIGNATURE:
        raise ValueError('Not a PNG')
    chunks, compressed, offset = [], bytearray(), 8
    while offset < len(source):
        size = struct.unpack('>I', source[offset:offset+4])[0]
        kind = source[offset+4:offset+8]
        data = source[offset+8:offset+8+size]
        crc = struct.unpack('>I', source[offset+8+size:offset+12+size])[0]
        if zlib.crc32(kind + data) & 0xffffffff != crc:
            raise ValueError('PNG CRC mismatch')
        chunks.append((kind, data))
        if kind == b'IDAT':
            compressed.extend(data)
        offset += 12 + size
    if chunks[0][0] != b'IHDR' or chunks[-1][0] != b'IEND':
        raise ValueError('Invalid PNG chunk sequence')
    w, h, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunks[0][1])
    if depth != 8 or color != 6 or compression or filtering or interlace:
        raise ValueError('Only non-interlaced RGBA8 PNG is supported')
    if not 0 < w <= 8192 or not 0 < h <= 8192 or w*h > 16777216:
        raise ValueError('Unexpected mask dimensions')
    stride = w * 4
    packed = zlib.decompress(compressed)
    if len(packed) != h * (stride + 1):
        raise ValueError('Invalid PNG scanline length')
    pixels = bytearray(h * stride)
    previous = bytearray(stride)
    for y in range(h):
        start = y * (stride + 1)
        mode = packed[start]
        row = bytearray(packed[start+1:start+1+stride])
        if mode > 4:
            raise ValueError('Invalid PNG filter')
        if mode:
            for x in range(stride):
                left = row[x-4] if x >= 4 else 0
                up = previous[x]
                upper_left = previous[x-4] if x >= 4 else 0
                prediction = left if mode == 1 else up if mode == 2 else (left+up)//2 if mode == 3 else _paeth(left, up, upper_left)
                row[x] = (row[x] + prediction) & 255
        pixels[y*stride:(y+1)*stride] = row
        previous = row
    return w, h, pixels, chunks


def _chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def merge_coverage(shaded_path, coverage_path):
    """Keep shaded RGB exact; alpha = linear white-team coverage * film alpha."""
    w, h, rgba, chunks = _read(shaded_path)
    cw, ch, coverage, _ = _read(coverage_path)
    if (w, h) != (cw, ch):
        raise ValueError('Coverage dimensions changed')
    for offset in range(0, len(rgba), 4):
        red, green, blue, alpha = coverage[offset:offset+4]
        if max(red, green, blue) - min(red, green, blue) > 1:
            raise ValueError('Coverage is not neutral linear emission')
        rgba[offset+3] = (red * alpha + 127) // 255
    stride = w * 4
    scanlines = b''.join(b'\0' + rgba[y*stride:(y+1)*stride] for y in range(h))
    compressed = zlib.compress(scanlines)
    result, written = bytearray(SIGNATURE), False
    for kind, data in chunks:
        if kind == b'IDAT':
            if not written:
                result.extend(_chunk(kind, compressed))
                written = True
        else:
            result.extend(_chunk(kind, data))
    with open(shaded_path, 'wb') as handle:
        handle.write(result)
