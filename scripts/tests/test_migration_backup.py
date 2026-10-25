import importlib.util
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('migration_backup', Path(__file__).parents[1] / 'migration/backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def test_committed_wal_and_private_credentials_are_separate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / 'live'
            data.mkdir()
            database = sqlite3.connect(data / 'free-sleep.db')
            database.execute('PRAGMA journal_mode=WAL')
            database.execute('CREATE TABLE records (value TEXT)')
            database.execute("INSERT INTO records VALUES ('committed in WAL')")
            database.commit()
            (data / 'features.env').write_text('EXAMPLE_TOKEN=synthetic\n')
            (data / 'settings.json').write_text('{"timezone":"America/Los_Angeles"}')
            output = root / 'backup'
            manifest = backup.create_backup(data, output)
            with tarfile.open(output / 'data.tar.gz') as archive:
                self.assertNotIn('data/features.env', archive.getnames())
                self.assertFalse(any(name.endswith(('-wal', '-shm')) for name in archive.getnames()))
                restored = root / 'restored.db'
                restored.write_bytes(archive.extractfile('data/free-sleep.db').read())
            with sqlite3.connect(restored) as restored_database:
                self.assertEqual(restored_database.execute('SELECT value FROM records').fetchone()[0], 'committed in WAL')
            with tarfile.open(output / 'private.tar.gz') as archive:
                self.assertIn('private/features.env', archive.getnames())
            self.assertEqual(manifest['databasesVerified'], ['free-sleep.db'])
            self.assertEqual((output.stat().st_mode & 0o777), 0o700)
            self.assertEqual((output / 'private.tar.gz').stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads((output / 'manifest.json').read_text())['archives']['data.tar.gz'], backup.digest(output / 'data.tar.gz'))
            database.close()

    def test_rejects_recursive_output_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / 'data'
            data.mkdir()
            with self.assertRaises(ValueError):
                backup.create_backup(data, data / 'backup')
            (data / 'linked').symlink_to(root)
            with self.assertRaises(ValueError):
                backup.create_backup(data, root / 'backup')


if __name__ == '__main__':
    unittest.main()
