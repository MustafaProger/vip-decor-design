#!/usr/bin/env python3
"""Snapshot SQLite with its online backup API; never copy live WAL files."""
import json
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tarfile
import tempfile
import time


def snapshot(source, destination):
    source, destination = Path(source), Path(destination)
    with tempfile.TemporaryDirectory(prefix=".runtime-", dir=destination) as temporary:
        target = Path(temporary) / "runtime"
        target.mkdir(mode=0o700)
        databases = list(source.rglob("*.sqlite"))
        for database in databases:
            copied = target / database.relative_to(source)
            copied.parent.mkdir(parents=True, exist_ok=True)
            deadline = time.monotonic() + 60
            def progress(*_):
                if time.monotonic() > deadline:
                    raise TimeoutError("SQLite snapshot exceeded 60 seconds")
            with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as live:
                with closing(sqlite3.connect(copied)) as backup:
                    live.backup(backup, pages=256, progress=progress)
                    if backup.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                        raise RuntimeError("Backup could not leave WAL mode")
                    if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise RuntimeError("Invalid SQLite backup")
            # All snapshot connections are closed and DELETE mode is verified.
            for suffix in ("-wal", "-shm"):
                Path(str(copied) + suffix).unlink(missing_ok=True)
        # CMS snapshot comes before media and the append-only inquiry log.
        # New log entries are imported by syncInquiries after restoration.
        shutil.copytree(source, target, dirs_exist_ok=True, ignore=lambda _, names: [
            name for name in names if name.endswith((".sqlite", ".sqlite-wal", ".sqlite-shm", ".lock"))
        ])
        inquiry_log = target / "inquiries.jsonl"
        if inquiry_log.exists():
            raw = inquiry_log.read_bytes()
            if raw and not raw.endswith(b"\n"):
                raw = raw[:raw.rfind(b"\n") + 1]
                inquiry_log.write_bytes(raw)
            for line in raw.splitlines():
                if line.strip():
                    json.loads(line)
        archive = destination / "runtime.tar.gz.partial"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(target, arcname="runtime")
        os.replace(archive, destination / "runtime.tar.gz")


if __name__ == "__main__":
    snapshot(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
