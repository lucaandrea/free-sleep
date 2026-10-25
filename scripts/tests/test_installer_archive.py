"""Verify failed downloads cannot replace an existing Pod checkout."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


class InstallerArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.repository = self.folder / 'installed'
        self.repository.mkdir()
        (self.repository / 'previous-release').write_text('keep on failure')
        self.commands = self.folder / 'commands'
        self.commands.mkdir()
        self.write_command('systemctl', '#!/bin/sh\nexit 3\n')
        self.write_command('chown', '#!/bin/sh\nexit 0\n')
        self.write_command('curl', '''#!/bin/sh
if [ "${DOWNLOAD_FAILURE:-0}" != 0 ]; then exit "$DOWNLOAD_FAILURE"; fi
cp "$TEST_ARCHIVE" free-sleep.zip
''')
        self.archive = self.folder / 'input.zip'

    def write_command(self, name, source):
        path = self.commands / name
        path.write_text(source)
        path.chmod(0o755)

    def run_download(self, **overrides):
        source = (Path(__file__).resolve().parents[1] / 'install.sh').read_text()
        source = source.split('# Synchronize installed biometrics', 1)[0]
        source = source.replace('/home/dac/free-sleep', str(self.repository))
        environment = dict(os.environ, PATH=str(self.commands) + ':' + os.environ['PATH'],
                           TEST_ARCHIVE=str(self.archive), **overrides)
        return subprocess.run(['bash'], input=source, text=True, capture_output=True,
                              cwd=self.folder, env=environment)

    def test_failed_download_keeps_installed_release(self):
        result = self.run_download(DOWNLOAD_FAILURE='22')
        self.assertEqual(result.returncode, 22)
        self.assertTrue((self.repository / 'previous-release').exists())

    def test_archive_without_compiled_server_keeps_installed_release(self):
        with zipfile.ZipFile(self.archive, 'w') as archive:
            archive.writestr('free-sleep-main/server/package.json', '{}')
        result = self.run_download()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.repository / 'previous-release').exists())

    def test_valid_built_archive_replaces_checkout(self):
        with zipfile.ZipFile(self.archive, 'w') as archive:
            archive.writestr('free-sleep-main/server/package.json', '{}')
            archive.writestr('free-sleep-main/server/dist/server.js', 'reviewed release')
        result = self.run_download()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.repository / 'server/dist/server.js').read_text(), 'reviewed release')


if __name__ == '__main__':
    unittest.main()
