import importlib.util
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("backup_runtime", Path(__file__).parents[1] / "deploy/backup-runtime.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeBackupTest(unittest.TestCase):
    def test_live_wal_restores_committed_rows_without_sidecars(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / "source", root / "backup"
            source.mkdir()
            destination.mkdir()
            with sqlite3.connect(source / "cms.sqlite") as live:
                live.execute("PRAGMA journal_mode=WAL")
                live.execute("CREATE TABLE data(value TEXT)")
                live.execute("INSERT INTO data VALUES ('saved')")
                live.commit()
                (source / "inquiries.jsonl").write_text('{"id":"saved"}\n{"id":')
                (source / "cms-media").mkdir()
                (source / "cms-media/photo.webp").write_bytes(b"photo")
                module.snapshot(source, destination)
                with tarfile.open(destination / "runtime.tar.gz") as archive:
                    names = archive.getnames()
                    self.assertFalse(any(name.endswith(("-wal", "-shm")) for name in names))
                    archive.extractall(root / "restore")
                with sqlite3.connect(root / "restore/runtime/cms.sqlite") as restored:
                    self.assertEqual(restored.execute("SELECT value FROM data").fetchall(), [("saved",)])
                    self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual((root / "restore/runtime/inquiries.jsonl").read_text(), '{"id":"saved"}\n')
                self.assertEqual((root / "restore/runtime/cms-media/photo.webp").read_bytes(), b"photo")
                live.execute("INSERT INTO data VALUES ('still writable')")


if __name__ == "__main__":
    unittest.main()
