#!/usr/bin/env python3
"""Compress only PNGs selected by the runtime art package map.

The tool is safe to resume: it atomically replaces a PNG only after its
decoded pixels, dimensions, and (for lossy art) quality gates have passed.
Original bytes are backed up by SHA-256 before a replacement is made.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from PIL import Image
import numpy as np


ROOT = Path(__file__).resolve().parents[3]
BACKUP = ROOT / ".local/asset-compression-originals-20261116/graphics"
RECEIPT = BACKUP / "receipt.json"
PNGQUANT = Path("/opt/homebrew/bin/pngquant")
MAX_WORKERS = 2
_receipt_lock = Lock()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_receipt() -> dict:
    if RECEIPT.exists():
        try:
            return json.loads(RECEIPT.read_text())
        except (OSError, json.JSONDecodeError):
            pass
    return {"format": 1, "files": {}}


def save_receipt(receipt: dict) -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="receipt.", suffix=".tmp", dir=BACKUP)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(receipt, f, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, RECEIPT)
    finally:
        Path(name).unlink(missing_ok=True)


def runtime_pngs(include_unit_high: bool = False) -> list[Path]:
    code = (
        "import {artPackageSources} from './client/scripts/ui/art-plugin.mjs'; "
        "const {sources}=await artPackageSources('assets'); "
        "console.log(JSON.stringify(sources.filter(x=>x.source.endsWith('.png') "
        "&& x.source.includes('/build/')).map(x=>x.source)))"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code], cwd=ROOT,
        check=True, text=True, capture_output=True,
    )
    base = (ROOT / "assets/build").resolve()
    paths = [(ROOT / Path(p)).resolve() for p in json.loads(result.stdout)]
    for p in paths:
        if not p.is_relative_to(base):
            raise RuntimeError(f"Runtime map escaped build assets: {p}")
    return sorted(
        p for p in paths
        if "/fx/" not in p.as_posix()
        and (include_unit_high or not ("/sprites/unit." in p.as_posix() and "@2x" in p.name))
    )


def dimensions(path: Path) -> list[int]:
    with Image.open(path) as im:
        return [im.width, im.height]


def classify(path: Path) -> str:
    rel = path.relative_to(ROOT / "assets/build").as_posix()
    if ".shadow." in path.name:
        return "shadow"
    if ".team." in path.name:
        return "mask"
    if ".beauty." in path.name:
        return "ui" if rel.startswith("ui/") else "terrain" if rel.startswith("terrain/") else "beauty"
    if rel.startswith("terrain/"):
        return "terrain"
    if rel.startswith("ui/") or rel.startswith("maps/"):
        return "ui"
    return "other"


def rgba_array(im: Image.Image) -> np.ndarray:
    return np.asarray(im.convert("RGBA"), dtype=np.uint8)


def exact_mask_candidate(im: Image.Image) -> Image.Image | None:
    a = rgba_array(im)
    if not np.array_equal(a[..., 0], a[..., 1]) or not np.array_equal(a[..., 1], a[..., 2]):
        return None
    candidate = Image.fromarray(np.stack((a[..., 0], a[..., 3]), axis=-1), "LA")
    if np.array_equal(rgba_array(candidate), a):
        return candidate
    return None


def exact_shadow_candidate(im: Image.Image) -> Image.Image | None:
    a = rgba_array(im)
    if np.any(a[..., :3] != 0):
        return None
    alpha = a[..., 3]
    candidate = Image.fromarray(alpha, "P")
    candidate.putpalette([0, 0, 0] * 256)
    candidate.info["transparency"] = bytes(range(256))
    if np.array_equal(rgba_array(candidate), a):
        return candidate
    # LA retains exact decoded RGBA while still reducing opaque-black RGBA.
    candidate_la = Image.fromarray(np.stack((np.zeros_like(alpha), alpha), axis=-1), "LA")
    if np.array_equal(rgba_array(candidate_la), a):
        return candidate_la
    return None


def metrics(original: np.ndarray, candidate: np.ndarray) -> dict:
    alpha0, alpha1 = original[..., 3], candidate[..., 3]
    support = alpha0 > 0
    rows = {}
    for bg in (0, 128, 255):
        o = original[..., :3].astype(np.float32)
        c = candidate[..., :3].astype(np.float32)
        af = alpha0.astype(np.float32)[..., None] / 255
        bf = alpha1.astype(np.float32)[..., None] / 255
        oc = o * af + bg * (1 - af)
        cc = c * bf + bg * (1 - bf)
        mse = float(np.mean((oc[support] - cc[support]) ** 2)) if np.any(support) else 0.0
        psnr = 99.0 if mse == 0 else 10 * np.log10((255.0 ** 2) / mse)
        rows[str(bg)] = round(float(psnr), 4)
    mask0, mask1 = alpha0 >= 32, alpha1 >= 32
    coverage_union = int(np.count_nonzero(mask0 | mask1))
    support_union = (alpha0 > 0) | (alpha1 > 0)
    return {
        "psnr_by_background": rows,
        "min_psnr": min(rows.values()),
        "alpha_mae": round(float(np.mean(np.abs(alpha0[support_union].astype(np.int16) - alpha1[support_union].astype(np.int16)))) if np.any(support_union) else 0.0, 5),
        "transparent_gained_alpha": int(np.count_nonzero((alpha0 == 0) & (alpha1 > 0))),
        "alpha32_coverage_change_ratio": round(int(np.count_nonzero(mask0 ^ mask1)) / max(1, coverage_union), 7),
    }


def backup_original(path: Path, digest: str, receipt: dict) -> None:
    target = BACKUP / f"{digest}.png"
    if not target.exists():
        BACKUP.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    rel = path.relative_to(ROOT).as_posix()
    with _receipt_lock:
        entry = receipt["files"].setdefault(rel, {"originals": []})
        if digest not in entry["originals"]:
            entry["originals"].append(digest)
        entry["latest_original_sha256"] = digest
        entry["latest_original_bytes"] = path.stat().st_size
        save_receipt(receipt)


def write_temp_png(candidate: Image.Image, near: Path) -> Path:
    fd, name = tempfile.mkstemp(prefix=f".{near.name}.", suffix=".tmp.png", dir=near.parent)
    os.close(fd)
    target = Path(name)
    candidate.save(target, format="PNG", optimize=True)
    return target


def cleanup_owned_temps(path: Path) -> None:
    """Remove only this tool's hidden temp names for a known asset path."""
    prefix = f".{path.name}."
    for candidate in path.parent.glob(prefix + "*"):
        tail = candidate.name[len(prefix):]
        is_mkstemp = bool(re.fullmatch(r"[A-Za-z0-9_-]{6,}\.(?:tmp\.png|png)", tail))
        is_alpha_temp = bool(re.fullmatch(r"alpha\.[A-Za-z0-9_-]{6,}\.png", tail))
        is_restore_temp = tail == "restore.tmp"
        if (is_mkstemp or is_alpha_temp or is_restore_temp) and candidate.is_file():
            candidate.unlink(missing_ok=True)


def pngquant_candidate(path: Path, kind: str) -> tuple[Path | None, dict]:
    quality = "90-100" if kind == "terrain" else "85-98" if kind == "ui" else "75-95"
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".png", dir=path.parent)
    os.close(fd)
    out = Path(name)
    out.unlink()
    env = os.environ.copy()
    env["RAYON_NUM_THREADS"] = "1"
    proc = subprocess.run(
        [str(PNGQUANT), "--quality=" + quality, "--speed", "4", "--strip", "--floyd=0.5",
         "--force", "--output", str(out), str(path)],
        cwd=ROOT, env=env, text=True, capture_output=True,
    )
    if proc.returncode != 0 or not out.exists():
        out.unlink(missing_ok=True)
        return None, {"status": "pngquant-rejected", "quality": quality, "detail": proc.stderr.strip()[-400:]}
    with Image.open(path) as source, Image.open(out) as compressed:
        a, b = rgba_array(source), rgba_array(compressed)
        dims_equal = source.size == compressed.size
    if not dims_equal:
        out.unlink(missing_ok=True)
        return None, {"status": "rejected-dimensions", "quality": quality}
    m = metrics(a, b)
    passed = (m["min_psnr"] >= 38.0 and m["alpha_mae"] <= 1.0
              and m["transparent_gained_alpha"] == 0
              and m["alpha32_coverage_change_ratio"] <= 0.003)
    # pngquant may trade a few originally transparent pixels for partial alpha.
    # Keep its RGB quantization but restore the exact authored alpha channel;
    # this preserves soft edges while retaining palette-derived color savings.
    if not passed and m["min_psnr"] >= 38.0:
        fd, fixed_name = tempfile.mkstemp(prefix=f".{path.name}.alpha.", suffix=".png", dir=path.parent)
        os.close(fd)
        fixed = Path(fixed_name)
        with Image.open(path) as source, Image.open(out) as compressed:
            fixed_pixels = rgba_array(compressed).copy()
            original_pixels = rgba_array(source)
            fixed_pixels[original_pixels[..., 3] == 0, :3] = 0
            rgb = Image.fromarray(fixed_pixels, "RGBA")
            rgb.putalpha(Image.fromarray(original_pixels[..., 3], "L"))
            rgb.save(fixed, format="PNG", optimize=True)
        with Image.open(fixed) as corrected:
            b_fixed = rgba_array(corrected)
        fixed_metrics = metrics(a, b_fixed)
        fixed_pass = (fixed_metrics["min_psnr"] >= 38.0 and fixed_metrics["alpha_mae"] <= 1.0
                      and fixed_metrics["transparent_gained_alpha"] == 0
                      and fixed_metrics["alpha32_coverage_change_ratio"] <= 0.003)
        if fixed_pass and fixed.stat().st_size < path.stat().st_size:
            out.unlink(missing_ok=True)
            return fixed, {"status": "candidate-alpha-preserved", "quality": quality,
                           "alpha_preserved": True, **fixed_metrics}
        fixed.unlink(missing_ok=True)
    if not passed:
        out.unlink(missing_ok=True)
        return None, {"status": "rejected-quality", "quality": quality, **m}
    return out, {"status": "candidate", "quality": quality, **m}


def process(path: Path, receipt: dict) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    before_hash = sha256(path)
    before_bytes = path.stat().st_size
    with Image.open(path) as src:
        original = rgba_array(src)
        dims = list(src.size)
        kind = classify(path)
        exact_candidate = exact_mask_candidate(src) if kind == "mask" else exact_shadow_candidate(src) if kind == "shadow" else None

    old = receipt["files"].get(rel, {})
    if old.get("output_sha256") == before_hash:
        original_hash = old.get("latest_original_sha256")
        original_path = BACKUP / f"{original_hash}.png" if original_hash else None
        if original_path and original_path.exists():
            # Lossless mask/shadow re-encodes have an exact pixel proof in their
            # creation receipt; byte-decoded equality avoids expensive PSNR work.
            if (old.get("quality", {}).get("status") == "lossless"
                    and old.get("kind") in ("mask", "shadow")):
                with Image.open(original_path) as original_image:
                    exact = np.array_equal(rgba_array(original_image), original)
                if exact:
                    return {"path": rel, "status": "already-compressed", "before_bytes": before_bytes,
                            "after_bytes": before_bytes, "kind": kind, "lossless_verified": True}
            with Image.open(original_path) as original_image:
                reference = rgba_array(original_image)
            current_quality = metrics(reference, original)
            if (current_quality["min_psnr"] < 38.0 or current_quality["alpha_mae"] > 1.0
                    or current_quality["transparent_gained_alpha"] != 0
                    or current_quality["alpha32_coverage_change_ratio"] > 0.003):
                restore_tmp = path.with_name(f".{path.name}.restore.tmp")
                shutil.copy2(original_path, restore_tmp)
                os.replace(restore_tmp, path)
                with _receipt_lock:
                    receipt["files"][rel].pop("output_sha256", None)
                    receipt["files"][rel].pop("output_bytes", None)
                    save_receipt(receipt)
                return {"path": rel, "status": "restored-tightened-quality-gate", "before_bytes": before_bytes,
                        "after_bytes": original_path.stat().st_size, "kind": kind, **current_quality}
            return {"path": rel, "status": "already-compressed", "before_bytes": before_bytes,
                    "after_bytes": before_bytes, "kind": kind, **current_quality}
        else:
            return {"path": rel, "status": "already-compressed", "before_bytes": before_bytes, "after_bytes": before_bytes, "kind": kind}

    candidate_path = None
    details = {"status": "unchanged"}
    if exact_candidate is not None:
        tmp = write_temp_png(exact_candidate, path)
        with Image.open(tmp) as candidate:
            exact = np.array_equal(rgba_array(candidate), original)
        if exact and tmp.stat().st_size < before_bytes:
            candidate_path, details = tmp, {"status": "lossless", "mode": exact_candidate.mode}
        else:
            tmp.unlink(missing_ok=True)
    elif kind in ("beauty", "ui", "terrain", "other"):
        candidate_path, details = pngquant_candidate(path, kind)

    if candidate_path is None or candidate_path.stat().st_size >= before_bytes:
        if candidate_path:
            candidate_path.unlink(missing_ok=True)
        return {"path": rel, "status": details.get("status", "unchanged"), "before_bytes": before_bytes,
                "after_bytes": before_bytes, "kind": kind, **details}

    # Back up every currently-authored version, then commit with a same-volume rename.
    backup_original(path, before_hash, receipt)
    after_hash = sha256(candidate_path)
    after_bytes = candidate_path.stat().st_size
    os.replace(candidate_path, path)
    with _receipt_lock:
        entry = receipt["files"].setdefault(rel, {"originals": []})
        entry.update({"output_sha256": after_hash, "output_bytes": after_bytes,
                      "dimensions": dims, "kind": kind, "quality": details})
        save_receipt(receipt)
    return {"path": rel, **details, "status": "compressed", "before_bytes": before_bytes, "after_bytes": after_bytes,
            "kind": kind, "sha256_before": before_hash, "sha256_after": after_hash, "dimensions": dims}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-idempotence", action="store_true", help="only verify every receipt output remains byte-identical")
    parser.add_argument("--include-unit-high", action="store_true", help="include @2x PNGs under unit sprite directories after dimension work is complete")
    parser.add_argument("--workers", type=int, choices=(1, 2, 3, 4), default=MAX_WORKERS, help="bounded image workers (default: 2)")
    args = parser.parse_args()
    paths = runtime_pngs(args.include_unit_high)
    if args.verify_idempotence:
        receipt = load_receipt()
        bad = []
        for path in paths:
            row = receipt["files"].get(path.relative_to(ROOT).as_posix(), {})
            if row.get("output_sha256") and sha256(path) != row["output_sha256"]:
                bad.append(path)
        print(json.dumps({"mapped_runtime_pngs_excluding_fx": len(paths), "receipt_outputs": sum(bool(x.get("output_sha256")) for x in receipt["files"].values()), "mismatches": [str(x) for x in bad]}, indent=2))
        return 1 if bad else 0

    receipt = load_receipt()
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process, path, receipt): path for path in paths}
        for i, future in enumerate(as_completed(futures), 1):
            path = futures[future]
            try:
                row = future.result()
            except Exception as exc:
                cleanup_owned_temps(path)
                row = {"path": path.relative_to(ROOT).as_posix(), "status": "error", "error": repr(exc)}
            results.append(row)
            if i % 100 == 0 or i == len(paths):
                print(f"Processed {i}/{len(paths)} runtime PNGs", flush=True)
    totals = {
        "format": 1,
        "mapped_runtime_pngs_excluding_fx": len(paths),
        "processed": len(results),
        "compressed": sum(r["status"] == "compressed" for r in results),
        "unchanged_or_skipped": sum(r["status"] != "compressed" for r in results),
        "errors": [r for r in results if r["status"] == "error"],
        "before_bytes": sum(r["before_bytes"] for r in results),
        "after_bytes": sum(r["after_bytes"] for r in results),
        "saved_bytes": sum(r["before_bytes"] - r["after_bytes"] for r in results),
        "status_counts": {},
    }
    for r in results:
        totals["status_counts"][r["status"]] = totals["status_counts"].get(r["status"], 0) + 1
    receipt["run"] = totals
    save_receipt(receipt)
    print(json.dumps(totals, indent=2, sort_keys=True))
    return 1 if totals["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
