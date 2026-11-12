import io
import json
from pathlib import Path
import sys
import unittest
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from personal_pairing import NoRedirects, pair_remote, validated_origin


class Reply(io.BytesIO):
    def __init__(self, request, data, status=200, url=None):
        super().__init__(json.dumps(data).encode())
        self.status = status
        self.url = url or request.full_url


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.session = dict(apiVersion=1, membership="active", **{
            key: f"00000000-0000-4000-8000-{index:012}"
            for index, key in enumerate(["podId", "householdId", "accountId", "selfSleeperId"], 1)})
        self.requests = []

    def open(self, request, timeout):
        self.assertEqual(timeout, 15)
        self.requests.append(request)
        return Reply(request, self.session)

    def test_personal_credential_is_independent_and_verified_before_provisioning(self):
        result = pair_remote("https://pod.example", "a" * 43, "Luca", opener=self)
        self.assertTrue(result["personal"])
        self.assertEqual(result["identity"]["sleeperId"], self.session["selfSleeperId"])
        self.assertEqual(len(self.requests), 2)
        invitation = json.loads(self.requests[0].data)
        self.assertEqual(invitation["deviceName"], "Sleepypod bedside remote")
        self.assertEqual(invitation["deviceSecret"], result["token"])
        self.assertNotEqual(result["token"], "a" * 43)
        self.assertIsNone(self.requests[0].get_header("Authorization"))
        self.assertEqual(self.requests[1].get_header("Authorization"), "Bearer " + result["token"])
        self.assertIsNone(self.requests[1].data)

    def test_origin_rejects_public_http_and_credential_destinations(self):
        for value in ["http://pod.example", "http://127.0.0.1", "http://192.168.999.1", "https://user@pod.example",
                      "https://pod.example/api", "https://pod.example?token=x", "https://pod.example#x", "https://pod.example\n"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validated_origin(value, True)
        self.assertEqual(validated_origin("http://eight-pod.local:3000", True), "http://eight-pod.local:3000")
        self.assertEqual(validated_origin("http://10.0.1.105:3000", True), "http://10.0.1.105:3000")
        with self.assertRaises(ValueError):
            validated_origin("http://10.0.1.105:3000", False)

    def test_redirect_policy_never_forwards_the_invitation_or_bearer(self):
        self.assertIsNone(NoRedirects().redirect_request(None, None, 302, "redirect", {}, "https://elsewhere.example"))

    def test_changed_identity_never_produces_device_configuration(self):
        class Changed:
            calls = 0
            def open(inner, request, timeout):
                inner.calls += 1
                session = dict(self.session)
                if inner.calls == 2:
                    session["selfSleeperId"] = session["accountId"]
                return Reply(request, session)
        with self.assertRaisesRegex(ValueError, "identity changed"):
            pair_remote("https://pod.example", "a" * 43, "Luca", opener=Changed())

    def test_foreign_response_origin_is_rejected(self):
        class Redirected:
            def open(inner, request, timeout):
                return Reply(request, self.session, url="https://elsewhere.example")
        with self.assertRaisesRegex(ValueError, "selected Pod"):
            pair_remote("https://pod.example", "a" * 43, "Luca", opener=Redirected())

    def test_invalid_invitation_stops_before_network(self):
        for invitation in ["", "a" * 42, "a" * 129, "a" * 43 + "\n"]:
            with self.assertRaises(ValueError):
                pair_remote("https://pod.example", invitation, "Luca", opener=self)
        self.assertEqual(self.requests, [])

    def test_revoked_session_rejected(self):
        self.session["membership"] = "revoked"
        with self.assertRaises(ValueError):
            pair_remote("https://pod.example", "a" * 43, "Luca", opener=self)

    def test_network_failure_does_not_retry_or_expose_credentials(self):
        class Failed:
            calls = 0
            def open(inner, request, timeout):
                inner.calls += 1
                raise urllib.error.HTTPError(request.full_url, 401, "private-response", {}, None)
        transport = Failed()
        with self.assertRaises(ValueError) as caught:
            pair_remote("https://pod.example", "a" * 43, "Luca", opener=transport)
        self.assertEqual(transport.calls, 1)
        self.assertNotIn("private-response", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
