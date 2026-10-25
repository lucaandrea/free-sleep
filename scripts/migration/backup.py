#!/usr/bin/env python3
"""Create a private, verified migration snapshot without stopping the Pod."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tarfile
import tempfile
from contextlib import closing
from datetime import datetime, timezone


def sqlite_snapshot(source, destination):
    """Use SQLite's backup transaction so committed WAL pages are included."""
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as original:
        with closing(sqlite3.connect(destination)) as snapshot:
            original.backup(snapshot)
            result = snapshot.execute('PRAGMA integrity_check').fetchone()[0]
            if result != 'ok':
                raise RuntimeError('Database snapshot failed integrity verification')
            if snapshot.execute('PRAGMA journal_mode=DELETE').fetchone()[0] != 'delete':
                raise RuntimeError('Could not finalize a standalone database snapshot')
    # Some SQLite builds leave the now-unused shared-memory index after closing.
    for suffix in ('-wal', '-shm'):
        Path(str(destination) + suffix).unlink(missing_ok=True)
    os.chmod(destination, 0o600)


def digest(path):
    checksum = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def stable_copy(source, destination):
    """Reject configuration changing during the copy instead of saving a torn file."""
    for attempt in range(3):
        previous = digest(source)
        shutil.copyfile(source, destination)
        if previous == digest(source) == digest(destination):
            os.chmod(destination, 0o600)
            return
    raise RuntimeError('Configuration changed repeatedly during backup: ' + source.name)


def create_backup(data_folder, output_folder, configuration=()):
    data_folder = Path(data_folder).resolve(strict=True)
    output_folder = Path(output_folder).resolve()
    if output_folder == data_folder or data_folder in output_folder.parents:
        raise ValueError('Backup output must be outside the live data folder')
    output_folder.mkdir(parents=True, exist_ok=False, mode=0o700)
    os.chmod(output_folder, 0o700)
    manifest = {'format': 'free-sleep-migration/1', 'createdAt': datetime.now(timezone.utc).isoformat(),
                'databasesVerified': [], 'files': {}, 'configurationFiles': [],
                'consistency': 'SQLite transactional snapshots; independently verified configuration files'}
    with tempfile.TemporaryDirectory(dir=output_folder) as temporary:
        staging = Path(temporary)
        data = staging / 'data'
        private = staging / 'private'
        data.mkdir(mode=0o700)
        private.mkdir(mode=0o700)
        for source in sorted(data_folder.rglob('*')):
            relative = source.relative_to(data_folder)
            if source.is_symlink():
                raise ValueError('Refusing a symlink in persistent data: ' + str(relative))
            if not source.is_file() or 'logs' in relative.parts or source.name.endswith(('-wal', '-shm')):
                continue
            target_root = private if source.suffix == '.env' else data
            target = target_root / relative
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if source.suffix in ('.db', '.sqlite', '.sqlite3'):
                sqlite_snapshot(source, target)
                manifest['databasesVerified'].append(str(relative))
            else:
                stable_copy(source, target)
            manifest['files'][str(target.relative_to(staging))] = digest(target)
        for item in configuration:
            source = Path(item).resolve(strict=True)
            if not source.is_file():
                raise ValueError('Configuration arguments must name regular files')
            target = private / 'system' / str(source).lstrip('/')
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            stable_copy(source, target)
            manifest['configurationFiles'].append(str(source))
            manifest['files'][str(target.relative_to(staging))] = digest(target)
        for name in ('data', 'private'):
            archive_path = output_folder / (name + '.tar.gz')
            with tarfile.open(archive_path, 'w:gz') as archive:
                archive.add(staging / name, arcname=name)
            os.chmod(archive_path, 0o600)
        manifest['archives'] = {name: digest(output_folder / name) for name in ('data.tar.gz', 'private.tar.gz')}
        manifest_path = output_folder / 'manifest.json'
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        os.chmod(manifest_path, 0o600)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--configuration', action='append', default=[])
    options = parser.parse_args()
    os.umask(0o077)
    result = create_backup(options.data, options.output, options.configuration)
    print(json.dumps({'verifiedDatabases': result['databasesVerified'], 'archives': list(result['archives']),
                      'status': 'verified', 'output': str(options.output)}))
