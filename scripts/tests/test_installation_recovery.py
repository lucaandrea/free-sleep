import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).parents[1] / 'migration/recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.device = self.root / 'device'
        self.application = self.device / 'opt/app'
        self.application.mkdir(parents=True)
        (self.application / 'server.js').write_text('synthetic server')
        os.chmod(self.application / 'server.js', 0o755)
        (self.application / '.env').write_text('SYNTHETIC_TOKEN=fixture-only')
        (self.application / 'cache').mkdir()
        (self.application / 'cache/transient').write_text('excluded')
        (self.application / 'relative').symlink_to('server.js')
        (self.application / 'absolute').symlink_to('/outside/never-written')
        (self.application / 'masked').symlink_to('/dev/null')
        os.link(self.application / 'server.js', self.application / 'hardcopy')
        self.plan = {'format': 'free-sleep-recovery-plan/1', 'roots': ['/opt/app'], 'exclude': ['/opt/app/cache']}
        self.bundle = self.root / 'bundle'
        self.restored = self.root / 'restored'

    def capture(self):
        return recovery.capture(self.device, self.plan, self.bundle, {'services': {'example': 'active'}})

    def alter_archive(self, transform):
        archive_path = self.bundle / 'installation.tar.gz'
        with tarfile.open(archive_path) as archive:
            members = [(member, archive.extractfile(member).read() if member.isfile() else None) for member in archive]
        transform(members)
        with tarfile.open(archive_path, 'w:gz') as archive:
            for member, content in members:
                archive.addfile(member, io.BytesIO(content) if content is not None else None)
        manifest = recovery.read_json(self.bundle / 'manifest.json')
        manifest['archiveSha256'] = recovery.digest(archive_path)
        recovery.write_json(self.bundle / 'manifest.json', manifest)

    def assert_no_restore(self):
        self.assertFalse(self.restored.exists())
        self.assertFalse(list(self.root.glob('.installation-restore-*')))

    def test_round_trip_preserves_contents_link_targets_and_archive_metadata(self):
        manifest = self.capture()
        source_before = (self.application / 'server.js').read_bytes()
        result = recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assertTrue(result['fileRestoreRehearsed'])
        self.assertFalse(result['runtimeRestoreTested'])
        self.assertEqual(result['verifiedEntries'], len(manifest['entries']))
        restored = self.restored / 'rootfs/opt/app'
        self.assertEqual((restored / 'server.js').read_bytes(), source_before)
        self.assertEqual((restored / 'hardcopy').read_bytes(), source_before)
        self.assertEqual((restored / '.env').read_bytes(), (self.application / '.env').read_bytes())
        self.assertEqual(os.readlink(restored / 'absolute'), '/outside/never-written')
        self.assertEqual(os.readlink(restored / 'masked'), '/dev/null')
        self.assertEqual(os.readlink(restored / 'relative'), 'server.js')
        self.assertFalse((restored / 'cache').exists())
        self.assertEqual(manifest['omitted'], ['/opt/app/cache'])
        self.assertEqual(manifest['entries']['rootfs/opt/app/server.js']['mode'], 0o755)
        self.assertEqual((restored / 'server.js').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.restored.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.application / 'server.js').stat().st_mode & 0o777, 0o755)
        for filename in ('installation.tar.gz', 'manifest.json', 'observations.json'):
            self.assertEqual((self.bundle / filename).stat().st_mode & 0o777, 0o600)

    def test_verification_without_extracting_and_without_exposing_private_values(self):
        self.capture()
        result = recovery.verify_or_rehearse(self.bundle)
        self.assertFalse(result['fileRestoreRehearsed'])
        self.assertNotIn('fixture-only', json.dumps(result))
        self.assertFalse(self.restored.exists())

    def test_refuses_existing_capture_and_rehearsal_targets(self):
        self.capture()
        with self.assertRaisesRegex(ValueError, 'new'):
            self.capture()
        self.restored.mkdir()
        (self.restored / 'keep').write_text('unchanged')
        with self.assertRaisesRegex(ValueError, 'new'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assertEqual((self.restored / 'keep').read_text(), 'unchanged')

    def test_refuses_recursive_capture_and_missing_roots(self):
        with self.assertRaisesRegex(ValueError, 'overlaps'):
            recovery.capture(self.device, self.plan, self.application / 'backup')
        self.plan['roots'].append('/missing')
        with self.assertRaisesRegex(ValueError, 'Missing'):
            self.capture()
        self.assertFalse(self.bundle.exists())

    def test_rejects_source_root_through_symlink(self):
        (self.device / 'alias').symlink_to(self.application, target_is_directory=True)
        self.plan = {'format': 'free-sleep-recovery-plan/1', 'roots': ['/alias/server.js']}
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.capture()

    def test_fails_capture_if_a_source_file_changes(self):
        original_digest = recovery.digest
        def mutating_digest(path):
            if Path(path).name == 'server.js':
                Path(path).write_text('changed during capture')
            return original_digest(path)
        with patch.object(recovery, 'digest', side_effect=mutating_digest):
            with self.assertRaisesRegex(ValueError, 'changed'):
                self.capture()
        self.assertFalse(self.bundle.exists())
        self.assertFalse(list(self.root.glob('.installation-capture-*')))

    def test_rejects_special_files_until_explicitly_excluded(self):
        os.mkfifo(self.application / 'socket-like-fifo')
        with self.assertRaisesRegex(ValueError, 'Special file'):
            self.capture()
        self.plan['exclude'].append('/opt/app/socket-like-fifo')
        self.capture()
        recovery.verify_or_rehearse(self.bundle)

    def test_rejects_changed_archive_or_observations(self):
        self.capture()
        (self.bundle / 'observations.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Observation checksum'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assert_no_restore()
        manifest = recovery.read_json(self.bundle / 'manifest.json')
        manifest['observationsSha256'] = recovery.digest(self.bundle / 'observations.json')
        recovery.write_json(self.bundle / 'manifest.json', manifest)
        with (self.bundle / 'installation.tar.gz').open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'Archive checksum'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assert_no_restore()

    def test_rejects_tampered_file_even_with_updated_archive_checksum(self):
        self.capture()
        def tamper(members):
            for index, (member, content) in enumerate(members):
                if member.name.endswith('/server.js'):
                    members[index] = (member, b'x' * len(content))
        self.alter_archive(tamper)
        with self.assertRaisesRegex(ValueError, 'File checksum'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assert_no_restore()

    def test_rejects_link_children_before_any_write(self):
        self.capture()
        manifest = recovery.read_json(self.bundle / 'manifest.json')
        manifest['entries']['rootfs/opt/app/absolute/escape'] = {'kind': 'file'}
        recovery.write_json(self.bundle / 'manifest.json', manifest)
        with self.assertRaisesRegex(ValueError, 'traverses'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assert_no_restore()

    def test_rejects_changed_link_target_and_permission_metadata(self):
        self.capture()
        archive = self.bundle / 'installation.tar.gz'
        original = archive.read_bytes()
        for change in ('target', 'mode'):
            with self.subTest(change=change):
                archive.write_bytes(original)
                def tamper(members):
                    for member, _content in members:
                        if change == 'target' and member.name.endswith('/absolute'):
                            member.linkname = '/different/target'
                        if change == 'mode' and member.name.endswith('/server.js'):
                            member.mode = 0o777
                self.alter_archive(tamper)
                with self.assertRaisesRegex(ValueError, 'mismatch'):
                    recovery.verify_or_rehearse(self.bundle, self.restored)
                self.assert_no_restore()

    def test_rejects_duplicate_members_and_traversal(self):
        self.capture()
        def duplicate(members):
            members.append(members[0])
        self.alter_archive(duplicate)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            recovery.verify_or_rehearse(self.bundle, self.restored)
        self.assert_no_restore()
        for name in ('/rootfs/etc/file', 'rootfs/../../escape', 'rootfs//alias', 'rootfs/./alias', 'rootfs/back\\slash'):
            with self.assertRaises(ValueError):
                recovery.validate_name(name)


if __name__ == '__main__':
    unittest.main()
