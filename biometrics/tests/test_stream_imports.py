"""Import the real processing graph without starting sensors or touching Pod data."""

from pathlib import Path
import subprocess
import sys
import unittest


biometrics_path = Path(__file__).resolve().parents[1]


class StreamImportTests(unittest.TestCase):
    def check_entrypoint(self, mode):
        # Isolate imports and the database; only logging is replaced, not the processing graph.
        probe = '''
from pathlib import Path
import runpy
import sys
import tempfile
from types import ModuleType
from unittest.mock import Mock

with tempfile.TemporaryDirectory() as directory:
    logger = Mock(folder_path=directory + '/')
    logging_module = ModuleType('get_logger')
    logging_module.get_logger = Mock(return_value=logger)
    sys.modules['get_logger'] = logging_module
    if sys.argv[1] == 'script':
        sys.path.insert(0, str(Path.cwd() / 'stream'))
        loaded = runpy.run_path('stream/stream.py', run_name='import_probe')
    else:
        loaded = runpy.run_module('stream.stream', run_name='import_probe')
    assert loaded['StreamProcessor'].__module__ == 'stream.stream_processor'
    from stream.biometric_processor import BiometricProcessor
    from stream.presence_heartbeat import PresenceHeartbeat
    assert callable(BiometricProcessor) and callable(PresenceHeartbeat)
'''
        result = subprocess.run([sys.executable, '-c', probe, mode], cwd=biometrics_path,
                                text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_module_entrypoint_imports_the_real_processing_graph(self):
        self.check_entrypoint('module')

    def test_legacy_script_entrypoint_does_not_shadow_stream_package(self):
        self.check_entrypoint('script')


if __name__ == '__main__':
    unittest.main()
