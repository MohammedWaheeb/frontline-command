"""Real closed-match host recovery, using private copies and ephemeral test keys."""
from contextlib import closing
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import selectors
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
assert re.fullmatch(r"run-[0-9]+", sys.argv[1])
OUT = HERE / sys.argv[1]
OUT.mkdir()
shutil.copyfile(__file__, OUT / "original-run.py")
sha = lambda b: hashlib.sha256(b).hexdigest()
report = {"status": "running", "started": datetime.datetime.now(datetime.timezone.utc).isoformat(), "scope": "Actual completed 3H1AI host data copied while closed; native host startup, new synthetic profile/save API, stopped whole-directory restore and record/replay preservation. No browser, original-profile key recovery, live WAL/crash, OS packaging or simulation conversion.", "pins": {}, "hosts": [], "requests": []}
active = None


def save_report():
    (OUT / "receipt.json").write_text(json.dumps(report, indent=2) + "\n")


def pin(path, expected=None):
    b = path.read_bytes()
    digest = sha(b)
    if expected:
        assert digest == expected, str(path)
    report["pins"][str(path.relative_to(ROOT))] = digest
    return b


def inventory(directory):
    return {str(p.relative_to(directory)): {"bytes": p.stat().st_size, "sha256": sha(p.read_bytes())} for p in sorted(directory.rglob("*")) if p.is_file()}


def stopped(directory):
    assert all(p.stat().st_size == 0 for p in directory.glob("*-wal")), "Nonempty WAL is outside this clean-copy course"


def copy_closed(source, target):
    stopped(source)
    shutil.copytree(source, target)
    assert inventory(source) == inventory(target), "Whole-directory copy differs"


def database(directory):
    stopped(directory)
    with closing(sqlite3.connect((directory / "frontline.db").as_uri() + "?mode=ro", uri=True)) as db:
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("PRAGMA user_version").fetchone() == (8,)
        tables = {}
        for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            assert name.replace("_", "").isalnum()
            rows = db.execute('SELECT * FROM "' + name + '"').fetchall()
            # Hash records, never serialize credentials or private record values.
            values = sorted(sha(json.dumps(row, separators=(",", ":"), default=lambda value: {"blob": value.hex()}).encode()) for row in rows)
            tables[name] = values
        return tables


def table_summary(tables):
    return {name: {"rows": len(rows), "sha256": sha(json.dumps(rows, separators=(",", ":")).encode())} for name, rows in tables.items()}


def start_host(directory, label):
    global active
    log = (OUT / (label + "-stdout.log")).open("wb")
    err = (OUT / (label + "-stderr.log")).open("wb")
    args = [str(binary), "-addr", "127.0.0.1:0", "-data", str(directory), "-static", str(product), "-maps", str(product / "content/maps"), "-missions", str(product / "content/missions")]
    process = subprocess.Popen(args, cwd=ROOT, env=dict(os.environ, GOMAXPROCS="1"), stdout=subprocess.PIPE, stderr=err)
    row = {"label": label, "pid": process.pid, "data": str(directory.relative_to(ROOT)), "args": args}
    report["hosts"].append(row)
    active = (process, log, err, row)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    try:
        assert selector.select(15), "Host did not announce a loopback address"
        line = process.stdout.readline()
        log.write(line)
        log.flush()
        match = re.fullmatch(rb"Frontline Command local server: (http://127\.0\.0\.1:[0-9]+)\n", line)
        assert match, "Unexpected startup; inspect isolated host logs"
        return match.group(1).decode()
    finally:
        selector.close()


def stop_host():
    global active
    if active is None:
        return
    process, log, err, row = active
    try:
        process.send_signal(signal.SIGTERM)
        try:
            remaining, _ = process.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            remaining, _ = process.communicate(timeout=5)
            row["forcedKill"] = True
        log.write(remaining)
        row["exit"] = process.returncode
        row["closed"] = process.poll() is not None
    finally:
        log.close()
        err.close()
        active = None
    assert row["exit"] == 0 and not row.get("forcedKill"), "Host did not close normally"


def request(origin, method, path, expected=200, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(origin + path, data=body, method=method, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read()
        status = response.status
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
    report["requests"].append({"method": method, "path": path, "status": status, "bytes": len(payload)})
    assert status == expected, (method, path, status, "Response body deliberately not printed")
    return payload


def verify_catalogs(origin):
    for folder in ("maps", "missions"):
        values = json.loads(request(origin, "GET", "/api/v1/" + folder))
        if folder == "maps":
            values = [value for value in values if value.get("installed")]
        assert sorted(value["id"] for value in values) == catalog_ids[folder], "Installed catalog differs from frozen product"


try:
    pin(Path(__file__).resolve())
    original = ROOT / "work/multiplayer-current-loader-v1/3h1ai-01/host-data"
    earned = json.loads(pin(original.parent / "browser.json"))
    assert earned["browserAndHostClosed"] and earned["hostExit"] == {"code": 0, "signal": None}
    prepared = ROOT / "work/multiplayer-current-loader-v1/prepared-03"
    build = json.loads(pin(prepared / "build.json"))
    binary = prepared / "frontline"
    pin(binary, earned["actualBuild"]["host"]["sha256"])
    product = Path(build["product"])
    pack = json.loads(pin(product / "assets/packs/base.json", build["sha256"]["pack"]))
    descriptors = {file["path"]: file for file in pack["files"]}
    catalog_ids = {}
    for folder in ("maps", "missions"):
        directory = product / "content" / folder
        assert directory.is_dir(), "Installed catalog directory is absent"
        paths = sorted(directory.rglob("*.json"))
        expected_paths = sorted(key for key in descriptors if key.startswith("/content/" + folder + "/") and key.endswith(".json"))
        assert paths and sorted("/" + str(p.relative_to(product)) for p in paths) == expected_paths, "Catalog file inventory differs from frozen pack"
        catalog_ids[folder] = []
        for p in paths:
            descriptor = descriptors["/" + str(p.relative_to(product))]
            content = pin(p, descriptor["sha256"])
            assert len(content) == descriptor["bytes"]
            catalog_ids[folder].append(json.loads(content)["id"])
        assert len(catalog_ids[folder]) == len(set(catalog_ids[folder]))
        catalog_ids[folder].sort()
    report["installedCatalogs"] = catalog_ids
    payload_path = ROOT / "work/ground-launcher-runtime-course-v1/native-03/evidence/US.launcher/01-initial.save.json"
    native = json.loads(pin(payload_path.parents[2] / "receipt.json"))
    payload = pin(payload_path, native["evidence"]["evidence/US.launcher/01-initial.save.json"])
    assert payload == payload.strip(), "Preserve exact native save value bytes"
    original_inventory = inventory(original)
    working = OUT / "working host data"
    copy_closed(original, working)
    original_rows = database(working)
    assert len(original_rows["results"]) == 1, "Expected exactly the earned match result"
    assert not original_rows["active_matches"], "Completed host still has active matches"
    report["originalTables"] = table_summary(original_rows)
    report["originalObjects"] = inventory(original / "objects")
    assert report["originalObjects"], "Earned replay object missing"
    origin = start_host(working, "before-backup")
    verify_catalogs(origin)
    health = json.loads(request(origin, "GET", "/api/v1/health"))
    for key in ("simulation", "protocol", "content_hash"):
        assert health[key] == build["version"][key]
    profile = json.loads(request(origin, "POST", "/api/v1/profiles", 201, body=b'{"name":"Recovery rehearsal"}'))
    token = profile["token"]  # Exists only in process memory, never in receipts.
    profile_id = profile["profile"]["id"]
    assert json.loads(request(origin, "GET", "/api/v1/profiles/me", token=token))["id"] == profile_id
    body = b'{"name":"Recovery rehearsal","expected_revision":0,"data":' + payload + b'}'
    created = json.loads(request(origin, "PUT", "/api/v1/saves/recovery-proof", token=token, body=body))
    assert created["revision"] == 1
    assert request(origin, "GET", "/api/v1/saves/recovery-proof/download", token=token) == payload
    stop_host()
    after_write = database(working)
    for table, rows in original_rows.items():
        assert set(rows).issubset(after_write[table]), (table, "Original record changed")
        assert len(after_write[table]) - len(rows) == (1 if table in ("profiles", "saves", "record_revisions") else 0), (table, "Unexpected record delta")
    assert inventory(working / "objects") == report["originalObjects"]
    report["afterWriteTables"] = table_summary(after_write)
    backup = OUT / "closed whole directory backup"
    copy_closed(working, backup)
    backup_inventory = inventory(backup)
    restored = OUT / "restored host data"
    copy_closed(backup, restored)
    origin = start_host(restored, "after-restore")
    verify_catalogs(origin)
    assert json.loads(request(origin, "GET", "/api/v1/profiles/me", token=token))["id"] == profile_id
    assert request(origin, "GET", "/api/v1/saves/recovery-proof/download", token=token) == payload
    stale = json.loads(request(origin, "PUT", "/api/v1/saves/recovery-proof", 409, token=token, body=body))
    assert stale["code"] == "save_conflict"
    request(origin, "GET", "/api/v1/saves/recovery-proof/download", 401)
    request(origin, "GET", "/api/v1/profiles/me", 401, token="wrong-recovery-key")
    stop_host()
    assert database(restored) == after_write, "Restart/read/rejected write mutated stored records"
    assert inventory(restored / "objects") == report["originalObjects"]
    # A second ordinary startup must also preserve the earned result/replay.
    origin = start_host(restored, "second-restart")
    verify_catalogs(origin)
    request(origin, "GET", "/api/v1/health")
    assert request(origin, "GET", "/api/v1/saves/recovery-proof/download", token=token) == payload
    stop_host()
    assert database(restored) == after_write
    assert inventory(restored / "objects") == report["originalObjects"]
    assert inventory(backup) == backup_inventory, "Backup was changed"
    assert inventory(original) == original_inventory, "Original match directory was changed"
    for rel, digest in report["pins"].items():
        assert sha((ROOT / rel).read_bytes()) == digest, rel
    report.update(status="passed", wholeDirectoryCopiesExact=True, originalUnchanged=True, originalRecordsPreserved=True, replayObjectsExact=True, noSpuriousResultOrRatingRows=True, newProfileAuthenticationAndSaveRestored=True, repeatedRestartRowsExact=True, inputPinsUnchanged=True, installedCatalogsExactOnAllStarts=True)
except BaseException as error:
    report["status"] = "failed"
    report["failure"] = str(error)
    raise
finally:
    try:
        stop_host()
    finally:
        report["finished"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        save_report()
        print(json.dumps({"status": report["status"], "hosts": len(report["hosts"]), "requests": len(report["requests"]), "out": str(OUT)}), flush=True)
