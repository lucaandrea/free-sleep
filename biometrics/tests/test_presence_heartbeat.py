import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stream.presence_heartbeat import PresenceHeartbeat


class PresenceHeartbeatTests(unittest.TestCase):
    def test_unchanged_presence_refreshes_and_failures_retry_without_flooding(self):
        now = [0]
        reporter = PresenceHeartbeat(lambda: now[0])
        self.assertTrue(reporter.due(True))
        reporter.attempt()
        now[0] = 4
        self.assertFalse(reporter.due(True))
        now[0] = 5
        self.assertTrue(reporter.due(True))
        reporter.attempt()
        reporter.success(True)
        now[0] = 34
        self.assertFalse(reporter.due(True))
        now[0] = 35
        self.assertTrue(reporter.due(True))
        reporter.attempt()
        reporter.success(True)
        now[0] = 40
        self.assertTrue(reporter.due(False))


if __name__ == '__main__':
    unittest.main()
