#!/usr/bin/env python3
"""Capture an installation privately and rehearse file restoration into a new directory."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tarfile
import tempfile

FORMAT = 'free-sleep-installation-recovery/1'
MAX_BYTES = 12 * 1024**3
MAX_MEMBERS = 300_000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    checksum = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def read_json(path):
    def unique(pairs):
        result = {}
        for name, value in pairs:
            require(name not in result, 'Duplicate manifest field')
            result[name] = value
        return result
    return json.loads(Path(path).read_text(), object_pairs_hook=unique)


def write_json(path, document):
    Path(path).write_text(json.dumps(document, indent=2, allow_nan=False) + '\n')
    os.chmod(path, 0o600)


def absolute_source(value):
    path = PurePosixPath(value)
    require(path.is_absolute() and str(path) == value and '..' not in path.parts and value != '/', 'Invalid source root')
    return path


def destination(path):
    output = Path(path).absolute()
    require(not output.exists() and not output.is_symlink(), 'Destination must be new')
    output = output.parent.resolve(strict=True) / output.name
    require(output.parent.is_dir(), 'Destination parent must exist')
    return output


def inventory(root, plan):
    """Do not follow source symlinks; record every selected entry and explicit omission."""
    require(plan.get('format') == 'free-sleep-recovery-plan/1', 'Unsupported recovery plan')
    sources = sorted({absolute_source(item) for item in plan['roots']}, key=lambda item: (len(item.parts), str(item)))
    excludes = {absolute_source(item) for item in plan.get('exclude', [])}
    require(sources and all(any(item == source or source in item.parents for source in sources) for item in excludes), 'Exclusion outside selected roots')
    entries = {}
    omitted = set()

    def visit(path, relative):
        if any(relative == item or item in relative.parents for item in excludes):
            omitted.add(str(relative))
            return
        metadata = path.lstat()
        require(stat.S_ISREG(metadata.st_mode) or stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode), 'Special file requires an explicit exclusion: ' + str(relative))
        name = 'rootfs/' + str(relative).lstrip('/')
        entries[name] = path
        require(len(entries) <= MAX_MEMBERS, 'Too many installation entries')
        if stat.S_ISDIR(metadata.st_mode):
            for child in sorted(path.iterdir()):
                visit(child, relative / child.name)

    for source in sources:
        if 'rootfs/' + str(source).lstrip('/') in entries:
            continue
        path = root.joinpath(*source.parts[1:])
        require(path.exists() or path.is_symlink(), 'Missing selected source: ' + str(source))
        for parent in list(path.parents)[:len(source.parts) - 2]:
            require(not parent.is_symlink(), 'Source root traverses a symlink: ' + str(source))
        visit(path, source)
    return entries, sorted(omitted)


class HashingReader:
    def __init__(self, stream):
        self.stream = stream
        self.checksum = hashlib.sha256()

    def read(self, size=-1):
        chunk = self.stream.read(size)
        self.checksum.update(chunk)
        return chunk


def stable_identity(metadata):
    return (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns, metadata.st_mode, metadata.st_uid, metadata.st_gid)


def capture(root, plan, output, observations=None):
    """Archive static installation files and reject changes; never stop or alter services."""
    root = Path(root).resolve(strict=True)
    output = destination(output)
    entries, omitted = inventory(root, plan)
    require(all(not (path == output or path in output.parents) for path in entries.values()), 'Output overlaps captured sources')
    staging = Path(tempfile.mkdtemp(prefix='.installation-capture-', dir=output.parent))
    os.chmod(staging, 0o700)
    try:
        manifest = {'format': FORMAT, 'createdAt': datetime.now(timezone.utc).isoformat(), 'plan': plan,
                    'omitted': omitted, 'entries': {}, 'runtimeRestoreTested': False,
                    'consistency': 'Per-file stable installation snapshot; live data needs a separate SQLite backup'}
        total_bytes = 0
        identities = {}
        with tarfile.open(staging / 'installation.tar.gz', 'w:gz', compresslevel=1, dereference=False) as archive:
            for name, path in entries.items():
                before = path.lstat()
                info = archive.gettarinfo(str(path), arcname=name)
                record = {'mode': stat.S_IMODE(before.st_mode), 'uid': before.st_uid, 'gid': before.st_gid}
                if stat.S_ISREG(before.st_mode):
                    total_bytes += before.st_size
                    require(total_bytes <= MAX_BYTES, 'Installation exceeds capture limit')
                    # Duplicate inodes are copied as files, never unsafe hardlink members.
                    info.type, info.linkname, info.size = tarfile.REGTYPE, '', before.st_size
                    with path.open('rb') as stream:
                        reader = HashingReader(stream)
                        archive.addfile(info, reader)
                    record.update(kind='file', size=before.st_size, sha256=reader.checksum.hexdigest())
                    require(record['sha256'] == digest(path), 'File content changed during capture: ' + name)
                elif stat.S_ISLNK(before.st_mode):
                    record.update(kind='symlink', target=os.readlink(path))
                    require(info.linkname == record['target'], 'Symlink changed during capture')
                    archive.addfile(info)
                else:
                    record.update(kind='directory')
                    archive.addfile(info)
                require(stable_identity(before) == stable_identity(path.lstat()), 'File metadata changed during capture: ' + name)
                manifest['entries'][name] = record
                identities[name] = stable_identity(path.lstat())
        current, current_omissions = inventory(root, plan)
        require(set(current) == set(entries) and current_omissions == omitted, 'Installation membership changed during capture')
        require(all(stable_identity(path.lstat()) == identities[name] for name, path in current.items()), 'Installation changed before capture completed')
        manifest['uncompressedBytes'] = total_bytes
        manifest['archiveSha256'] = digest(staging / 'installation.tar.gz')
        write_json(staging / 'observations.json', observations or {})
        manifest['observationsSha256'] = digest(staging / 'observations.json')
        write_json(staging / 'manifest.json', manifest)
        os.chmod(staging / 'installation.tar.gz', 0o600)
        require(not output.exists() and not output.is_symlink(), 'Destination appeared during capture')
        staging.rename(output)
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def validate_name(name):
    path = PurePosixPath(name)
    require(not path.is_absolute() and str(path) == name and '..' not in path.parts
            and len(path.parts) > 1 and path.parts[0] == 'rootfs' and '\\' not in name,
            'Unsafe archive member')
    return path


def verify_or_rehearse(bundle, output=None):
    """Verify metadata/content, then optionally restore privately without executing anything."""
    bundle = Path(bundle).resolve(strict=True)
    for name in ('manifest.json', 'installation.tar.gz', 'observations.json'):
        require((bundle / name).is_file() and not (bundle / name).is_symlink(), 'Missing regular recovery file')
    manifest_hash = digest(bundle / 'manifest.json')
    manifest = read_json(bundle / 'manifest.json')
    require(manifest.get('format') == FORMAT, 'Unsupported recovery format')
    require(digest(bundle / 'installation.tar.gz') == manifest['archiveSha256'], 'Archive checksum mismatch')
    require(digest(bundle / 'observations.json') == manifest['observationsSha256'], 'Observation checksum mismatch')
    expected = manifest['entries']
    require(isinstance(expected, dict) and 0 < len(expected) <= MAX_MEMBERS, 'Invalid entry manifest')
    paths = {name: validate_name(name) for name in expected}
    for name, path in paths.items():
        for parent in path.parents:
            record = expected.get(str(parent))
            require(record is None or record['kind'] == 'directory', 'Archive member traverses a link or file')
    result = {'format': FORMAT, 'archiveSha256': manifest['archiveSha256'], 'manifestSha256': manifest_hash,
              'verifiedEntries': 0, 'fileRestoreRehearsed': output is not None, 'runtimeRestoreTested': False,
              'originalPermissionsApplied': False}
    target = destination(output) if output is not None else None
    if target:
        require(bundle != target and bundle not in target.parents, 'Rehearsal must be outside the bundle')
    staging = Path(tempfile.mkdtemp(prefix='.installation-restore-', dir=target.parent)) if target else None
    observed = set()
    links = []
    total_bytes = 0
    try:
        with tarfile.open(bundle / 'installation.tar.gz', 'r:gz') as archive:
            for member in archive:
                validate_name(member.name)
                require(member.name in expected and member.name not in observed, 'Unexpected or duplicate member')
                observed.add(member.name)
                record = expected[member.name]
                require((member.mode, member.uid, member.gid) == (record['mode'], record['uid'], record['gid']), 'Archive ownership/mode metadata mismatch')
                path = staging.joinpath(*paths[member.name].parts) if staging else None
                if path:
                    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if member.isdir():
                    require(record['kind'] == 'directory', 'Entry type mismatch')
                    if path:
                        path.mkdir(exist_ok=True, mode=0o700)
                elif member.issym():
                    require(record['kind'] == 'symlink' and record['target'] == member.linkname, 'Symlink mismatch')
                    if path:
                        links.append((path, member.linkname))
                else:
                    require(member.isfile() and record['kind'] == 'file' and record['size'] == member.size, 'Entry type/size mismatch')
                    total_bytes += member.size
                    require(0 <= member.size <= MAX_BYTES and total_bytes <= MAX_BYTES, 'Archive exceeds restore limit')
                    checksum = hashlib.sha256()
                    with closing(archive.extractfile(member)) as stream:
                        restored = path.open('xb') if path else None
                        try:
                            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                                checksum.update(chunk)
                                if restored:
                                    restored.write(chunk)
                        finally:
                            if restored:
                                restored.close()
                                os.chmod(path, 0o600)
                    require(checksum.hexdigest() == record['sha256'], 'File checksum mismatch')
        require(observed == set(expected) and total_bytes == manifest['uncompressedBytes'], 'Incomplete archive')
        require(digest(bundle / 'manifest.json') == manifest_hash and digest(bundle / 'installation.tar.gz') == manifest['archiveSha256'], 'Bundle changed during verification')
        require(digest(bundle / 'observations.json') == manifest['observationsSha256'], 'Observations changed during verification')
        result['verifiedEntries'] = len(observed)
        if staging:
            # Create links last, after all writes. No archive entry may live under a link.
            for path, link in links:
                path.symlink_to(link)
            for name, record in expected.items():
                path = staging.joinpath(*paths[name].parts)
                if record['kind'] == 'file':
                    require(digest(path) == record['sha256'], 'Restored file mismatch')
                elif record['kind'] == 'symlink':
                    require(os.readlink(path) == record['target'], 'Restored symlink mismatch')
            # Intermediate directories inherit no public access, regardless of caller umask.
            for directory, _children, _files in os.walk(staging, followlinks=False):
                os.chmod(directory, 0o700)
            write_json(staging / 'verification.json', result)
            require(not target.exists() and not target.is_symlink(), 'Destination appeared during rehearsal')
            staging.rename(target)
        return result
    finally:
        if staging and staging.exists():
            shutil.rmtree(staging)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest='command', required=True)
    creator = subparsers.add_parser('capture')
    creator.add_argument('--root', type=Path, default=Path('/'))
    creator.add_argument('--plan', type=Path, required=True)
    creator.add_argument('--output', type=Path, required=True)
    creator.add_argument('--observations', type=Path)
    verifier = subparsers.add_parser('verify')
    verifier.add_argument('--bundle', type=Path, required=True)
    verifier.add_argument('--rehearse-to', type=Path)
    options = parser.parse_args()
    os.umask(0o077)
    if options.command == 'capture':
        manifest = capture(options.root, read_json(options.plan), options.output,
                           read_json(options.observations) if options.observations else None)
        print(json.dumps({'status': 'captured', 'entries': len(manifest['entries']), 'uncompressedBytes': manifest['uncompressedBytes'],
                          'archiveSha256': manifest['archiveSha256'], 'runtimeRestoreTested': False}))
    else:
        print(json.dumps(verify_or_rehearse(options.bundle, options.rehearse_to)))
