"""Moderate runtime audio compression; editable masters and originals are retained.

Run with .local/audio-venv/bin/python assets/pipeline/audio/compress_runtime.py.
The complete index is merged without recreating event routing/captions. A second
run verifies the published fingerprints and does not transcode lossy files again.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from common import ROOT, OUT, SOURCE, atomic_json, digest

BACKUP = ROOT / '.local/asset-compression-originals-20261116/audio'
REPORT = BACKUP / 'compression-report.json'
SETTINGS = {'version': 2, 'vorbis_compression_level': .70,
            'mono_mp3_bitrate': '64k', 'stereo_mp3_bitrate': '112k',
            'sample_rate': 'preserve', 'channels': 'preserve',
            'effects_rms_ratio': [.95, 1.05], 'effects_min_correlation': .97}
DESCRIPTORS = {'bytes', 'sha256', 'mp3_bytes', 'mp3_sha256'}


def relative(url):
    prefix = '/art/audio/'
    if not url.startswith(prefix):
        raise ValueError(f'Unexpected audio URL: {url}')
    path = Path(url[len(prefix):])
    if path.is_absolute() or '..' in path.parts:
        raise ValueError(f'Unsafe audio path: {url}')
    return path


def metadata(index):
    result = deepcopy(index)
    for entry in result['entries'].values():
        for variant in entry['variants']:
            for key in DESCRIPTORS:
                variant.pop(key, None)
    return result


def codec_metrics(file, original):
    signal, rate = sf.read(file, dtype='float32', always_2d=True)
    baseline, original_rate = sf.read(original, dtype='float32', always_2d=True)
    if signal.shape != baseline.shape or rate != original_rate:
        raise ValueError(f'Codec changed original timing/channels/rate: {file}')
    energy = float(np.sum(baseline.astype(np.float64) ** 2))
    actual_energy = float(np.sum(signal.astype(np.float64) ** 2))
    error_energy = float(np.sum((signal.astype(np.float64) - baseline) ** 2))
    correlation = float(np.sum(signal.astype(np.float64) * baseline)) / np.sqrt(energy * actual_energy)
    return {'rms_ratio': float(np.sqrt(actual_energy / energy)),
            'correlation': min(1., correlation),
            'snr_db': min(120., float(10 * np.log10(energy / max(error_energy, 1e-30))))}


def effects_quality_pass(metrics):
    low, high = SETTINGS['effects_rms_ratio']
    return low <= metrics['rms_ratio'] <= high and metrics['correlation'] >= SETTINGS['effects_min_correlation']


def refine_effects(index, baseline, report):
    """Tighten transient quality without transcoding voice/music or source files."""
    previous = deepcopy(report)
    captured_index = deepcopy(index)
    outcomes = []
    changes = []
    for event, entry in index['entries'].items():
        if entry['bus'] not in ('effects', 'ui'):
            continue
        for variant in entry['variants']:
            for url_key, size_key, hash_key in (
                    ('url', 'bytes', 'sha256'), ('mp3_url', 'mp3_bytes', 'mp3_sha256')):
                rel = relative(variant[url_key])
                target, original = OUT / rel, BACKUP / rel
                original_variant = next(v for v in baseline['entries'][event]['variants']
                                        if v['url'] == variant['url'])
                raw, original_raw = target.read_bytes(), original.read_bytes()
                if (digest(raw) != variant[hash_key] or len(raw) != variant[size_key]
                        or digest(original_raw) != original_variant[hash_key]
                        or len(original_raw) != original_variant[size_key]):
                    raise ValueError(f'Current/original index integrity mismatch: {rel}')
                before = codec_metrics(target, original)
                restore = not effects_quality_pass(before)
                after = {'rms_ratio': 1., 'correlation': 1., 'snr_db': 120.} if restore else before
                outcomes.append({'event': event, 'bus': entry['bus'], 'url': variant[url_key],
                                 'before_guard': before, 'final': after,
                                 'restored_by_guard': restore})
                if restore:
                    changes.append((target, original))
                    variant[size_key] = len(original_raw)
                    variant[hash_key] = digest(original_raw)
    # All quality decisions are ready before changing any output.
    if json.loads((OUT / 'index.json').read_text()) != captured_index:
        raise ValueError('Audio index changed during refinement.')
    previous_path = BACKUP / 'compression-report-v1.json'
    if not previous_path.exists():
        atomic_json(previous_path, previous)
    for target, original in changes:
        temporary = target.with_suffix(target.suffix + '.quality-pending')
        shutil.copy2(original, temporary)
        os.replace(temporary, target)
    atomic_json(OUT / 'index.json', index)
    variants = {v['url']: v for e in index['entries'].values() for v in e['variants']}
    for row in report['clips']:
        row['variant'] = deepcopy(variants[row['variant']['url']])
        row['after_bytes'] = row['variant']['bytes'] + row['variant']['mp3_bytes']
    report['settings'] = SETTINGS
    report['summary']['after_bytes'] = sum(row['after_bytes'] for row in report['clips'])
    report['summary']['saved_percent'] = 100 * (1 - report['summary']['after_bytes'] / report['summary']['before_bytes'])
    report['summary']['effects_formats_checked'] = len(outcomes)
    report['summary']['effects_formats_restored'] = len(changes)
    report['effects_quality'] = outcomes
    report['validated'] = validate_index(index, baseline)
    atomic_json(REPORT, report)
    return report


def validate_index(index, baseline):
    if metadata(index) != metadata(baseline):
        raise ValueError('Audio routing/captions changed since backup; use a new backup generation.')
    results = []
    for event, entry in index['entries'].items():
        for variant in entry['variants']:
            shapes = []
            for url_key, size_key, hash_key in (
                    ('url', 'bytes', 'sha256'), ('mp3_url', 'mp3_bytes', 'mp3_sha256')):
                rel = relative(variant[url_key])
                raw = (OUT / rel).read_bytes()
                if len(raw) != variant[size_key] or digest(raw) != variant[hash_key]:
                    raise ValueError(f'Audio index integrity mismatch: {rel}')
                signal, rate = sf.read(OUT / rel, dtype='float32', always_2d=True)
                original = sf.info(BACKUP / rel)
                if (rate, signal.shape) != (original.samplerate, (original.frames, original.channels)):
                    raise ValueError(f'Audio timing/shape changed: {rel}')
                if not np.isfinite(signal).all() or np.max(np.abs(signal)) >= .995:
                    raise ValueError(f'Nonfinite or clipping audio: {rel}')
                if float(np.sqrt(np.mean(signal ** 2))) < .0001:
                    raise ValueError(f'Silent audio: {rel}')
                if url_key == 'url' and abs(len(signal) / rate - variant['duration']) > 1 / rate:
                    raise ValueError(f'Duration metadata changed: {rel}')
                if entry['bus'] in ('effects', 'ui'):
                    metrics = codec_metrics(OUT / rel, BACKUP / rel)
                    if not effects_quality_pass(metrics):
                        raise ValueError(f'Effects quality guard failed: {rel}: {metrics}')
                shapes.append((len(signal), rate, signal.shape[1]))
            # Some original MP3s expose a 23-sample decoder padding tail.
            # Each codec is checked against its own original sample count above.
            results.append({'event': event, 'url': variant['url'], 'frames': shapes[0][0],
                            'sample_rate': shapes[0][1], 'channels': shapes[0][2],
                            'mp3_frames': shapes[1][0]})
    # The three synchronized battle layers must remain exactly aligned.
    by_event = {row['event']: row for row in results}
    for faction in ('US', 'IR', 'SY', 'SA'):
        layers = [by_event[f'music.battle_{faction}_{layer}'] for layer in ('calm', 'tension', 'combat')]
        if len({(row['frames'], row['sample_rate']) for row in layers}) != 1:
            raise ValueError(f'Music layer phase drift: {faction}')
    return results


def source_for(rel):
    original = BACKUP / rel
    shape = sf.info(original)
    for candidate in (SOURCE / 'masters' / rel.with_suffix('.wav'),
                      SOURCE / 'masters/rough-combat' / rel.with_suffix('.wav')):
        if candidate.exists():
            info = sf.info(candidate)
            if (info.frames, info.samplerate, info.channels) != (shape.frames, shape.samplerate, shape.channels):
                raise ValueError(f'WAV master does not match shipped clip: {candidate}')
            return candidate
    return original


def encode(job, stage):
    event, variant, bus = job
    rel = relative(variant['url'])
    source = source_for(rel)
    signal, rate = sf.read(source, dtype='float32', always_2d=True)
    before_rms = float(np.sqrt(np.mean(signal ** 2)))
    if not np.isfinite(signal).all() or not before_rms > .0001:
        raise ValueError(f'Invalid compression source: {source}')
    ogg, mp3 = stage / rel, stage / relative(variant['mp3_url'])
    ogg.parent.mkdir(parents=True, exist_ok=True)
    # Block writes avoid the libsndfile large-buffer Vorbis problem.
    with sf.SoundFile(ogg, 'w', rate, signal.shape[1], format='OGG', subtype='VORBIS',
                      compression_level=SETTINGS['vorbis_compression_level']) as target:
        for start in range(0, len(signal), 16384):
            target.write(signal[start:start + 16384])
    wav = ogg.with_suffix('.encode.wav')
    sf.write(wav, signal, rate, subtype='FLOAT')
    bitrate = SETTINGS['mono_mp3_bitrate' if signal.shape[1] == 1 else 'stereo_mp3_bitrate']
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', str(wav),
                    '-c:a', 'libmp3lame', '-b:a', bitrate, '-map_metadata', '-1', str(mp3)], check=True)
    wav.unlink()
    # Retain the higher-quality original if compression cannot save bytes.
    for target, url in ((ogg, variant['url']), (mp3, variant['mp3_url'])):
        original = BACKUP / relative(url)
        if target.stat().st_size >= original.stat().st_size:
            shutil.copy2(original, target)
        decoded, decoded_rate = sf.read(target, dtype='float32', always_2d=True)
        original_info = sf.info(original)
        expected_shape = (original_info.frames, original_info.channels)
        if decoded.shape != expected_shape or decoded_rate != original_info.samplerate:
            shutil.copy2(original, target)
            decoded, decoded_rate = sf.read(target, dtype='float32', always_2d=True)
        ratio = float(np.sqrt(np.mean(decoded ** 2))) / before_rms
        # Noisy impacts can change energy disproportionately at lower Vorbis
        # quality. Retain their original encoding rather than changing the mix.
        if (not np.isfinite(decoded).all() or np.max(np.abs(decoded)) >= .995
                or not .90 < ratio < 1.10):
            shutil.copy2(original, target)
            decoded, decoded_rate = sf.read(target, dtype='float32', always_2d=True)
            ratio = float(np.sqrt(np.mean(decoded ** 2))) / before_rms
            if (decoded.shape != expected_shape or decoded_rate != original_info.samplerate
                    or not np.isfinite(decoded).all() or np.max(np.abs(decoded)) >= .995
                    or not .90 < ratio < 1.10):
                raise ValueError(f'Original encoding/master mismatch: {target} ({ratio})')
        if bus in ('effects', 'ui') and not effects_quality_pass(codec_metrics(target, original)):
            shutil.copy2(original, target)
    changed = {**variant, 'bytes': ogg.stat().st_size, 'sha256': digest(ogg.read_bytes()),
               'mp3_bytes': mp3.stat().st_size, 'mp3_sha256': digest(mp3.read_bytes())}
    return {'event': event, 'variant': changed, 'source': str(source.relative_to(ROOT)),
            'source_sha256': digest(source.read_bytes()),
            'before_bytes': variant['bytes'] + variant['mp3_bytes'],
            'after_bytes': changed['bytes'] + changed['mp3_bytes']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--refine-effects', action='store_true', help='Apply stricter SFX/UI guards to the original v1 migration without retranscoding.')
    args = parser.parse_args()
    index_path = OUT / 'index.json'
    index = json.loads(index_path.read_text())
    BACKUP.mkdir(parents=True, exist_ok=True)
    original_index = BACKUP / 'index.json'
    if not original_index.exists():
        if args.verify_only:
            raise ValueError('No compression baseline exists.')
        shutil.copy2(index_path, original_index)
    baseline = json.loads(original_index.read_text())
    if metadata(index) != metadata(baseline):
        raise ValueError('Audio metadata changed since backup; use a new backup generation.')
    jobs = [(event, variant, entry['bus']) for event, entry in baseline['entries'].items()
            for variant in entry['variants']]
    if REPORT.exists():
        report = json.loads(REPORT.read_text())
        if report['settings'] != SETTINGS:
            old = {k: v for k, v in report['settings'].items() if k != 'version'}
            compatible = {k: v for k, v in SETTINGS.items() if k not in ('version', 'effects_rms_ratio', 'effects_min_correlation')}
            if args.refine_effects and report['settings'].get('version') == 1 and old == compatible:
                report = refine_effects(index, baseline, report)
                index = json.loads(index_path.read_text())
                print(json.dumps({**report['summary'], 'reencoded': 0}), flush=True)
            else:
                raise ValueError('Compression settings changed; use --refine-effects for the v1 quality refinement.')
        for row in report['clips']:
            if digest((ROOT / row['source']).read_bytes()) != row['source_sha256']:
                raise ValueError(f'Compression source changed: {row["source"]}')
        validated = validate_index(index, baseline)
        print(json.dumps({**report['summary'], 'verified_clips': len(validated), 'reencoded': 0}))
        return
    if args.verify_only:
        raise ValueError('No completed compression report exists.')
    for _, variant, _ in jobs:
        for url_key, hash_key, size_key in (('url', 'sha256', 'bytes'), ('mp3_url', 'mp3_sha256', 'mp3_bytes')):
            rel = relative(variant[url_key])
            backup = BACKUP / rel
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(OUT / rel, backup)
            raw = backup.read_bytes()
            if digest(raw) != variant[hash_key] or len(raw) != variant[size_key]:
                raise ValueError(f'Original backup failed integrity: {rel}')
    print(f'Compressing {len(jobs)} audio pairs with two workers; originals: {BACKUP}', flush=True)
    with tempfile.TemporaryDirectory(prefix='audio-stage-', dir=BACKUP) as directory:
        stage = Path(directory)
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows = []
            for row in pool.map(lambda job: encode(job, stage), jobs):
                rows.append(row)
                if len(rows) % 50 == 0 or len(rows) == len(jobs):
                    print(f'{len(rows)}/{len(jobs)} encoded and validated', flush=True)
        changed_by_url = {row['variant']['url']: row for row in rows}
        # Do not silently replace metadata written by another author during encoding.
        if json.loads(index_path.read_text()) != index:
            raise ValueError('Audio index changed during encoding; retry after authoring completes.')
        for entry in index['entries'].values():
            for variant in entry['variants']:
                row = changed_by_url[variant['url']]
                for key in DESCRIPTORS:
                    variant[key] = row['variant'][key]
                for key in ('url', 'mp3_url'):
                    rel = relative(variant[key])
                    os.replace(stage / rel, OUT / rel)
                receipt_path = SOURCE / 'renders' / Path(relative(variant['url']).as_posix() + '.json')
                if receipt_path.exists():
                    receipt = json.loads(receipt_path.read_text())
                    if receipt.get('url') == variant['url']:
                        receipt_backup = BACKUP / 'receipts' / receipt_path.relative_to(SOURCE / 'renders')
                        receipt_backup.parent.mkdir(parents=True, exist_ok=True)
                        if not receipt_backup.exists():
                            shutil.copy2(receipt_path, receipt_backup)
                        for key in DESCRIPTORS:
                            receipt[key] = variant[key]
                        decoded, _ = sf.read(OUT / relative(variant['url']), dtype='float32', always_2d=True)
                        receipt.update(peak=float(np.max(np.abs(decoded))), rms=float(np.sqrt(np.mean(decoded ** 2))),
                                       runtime_compression=SETTINGS)
                        atomic_json(receipt_path, receipt)
        atomic_json(index_path, index)
    validated = validate_index(index, baseline)
    summary = {'events': len(index['entries']), 'clips': len(rows),
               'before_bytes': sum(row['before_bytes'] for row in rows),
               'after_bytes': sum(row['after_bytes'] for row in rows),
               'wav_master_clips': sum(row['source'].endswith('.wav') for row in rows),
               'original_ogg_source_clips': sum(row['source'].endswith('.ogg') for row in rows)}
    summary['saved_percent'] = 100 * (1 - summary['after_bytes'] / summary['before_bytes'])
    report = {'settings': SETTINGS, 'summary': summary, 'clips': rows,
              'validated': validated, 'listening_review': 'not performed; signal and timing checks only'}
    atomic_json(REPORT, report)
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
