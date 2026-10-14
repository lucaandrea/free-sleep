"""Rate-limit presence reports while refreshing unchanged readings and retrying failures."""
import time


class PresenceHeartbeat:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.last_present = None
        self.last_success = float('-inf')
        self.last_attempt = float('-inf')

    def due(self, present):
        now = self.clock()
        if now - self.last_attempt < 5:
            return False
        return present != self.last_present or now - self.last_success >= 30

    def attempt(self):
        self.last_attempt = self.clock()

    def success(self, present):
        self.last_present = present
        self.last_success = self.clock()
