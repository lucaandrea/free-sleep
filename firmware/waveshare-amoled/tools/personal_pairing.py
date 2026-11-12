"""Create a separate revocable remote credential using an own-device invitation."""
import ipaddress
import json
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def validated_origin(value, allow_local_http=False):
    """Permit HTTPS or explicitly selected local HTTP; never forward secrets on redirects."""
    if any(character.isspace() for character in value):
        raise ValueError("Use only the Pod origin, without spaces.")
    parsed = urllib.parse.urlsplit(value.rstrip("/"))
    if (parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username
            or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError("Use only the Pod origin, without a path or credentials.")
    if parsed.scheme == "http":
        local = parsed.hostname.endswith(".local")
        try:
            address = ipaddress.ip_address(parsed.hostname)
            local = address.version == 4 and any(address in ipaddress.ip_network(network)
                for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
        except ValueError:
            pass
        if not allow_local_http or not local:
            raise ValueError("HTTP requires an explicitly approved private LAN origin.")
    return urllib.parse.urlunsplit(parsed)


def identity_from_session(session):
    if session.get("apiVersion") != 1 or session.get("membership") != "active":
        raise ValueError("The Pod did not confirm an active personal account.")
    identity = {"podId": session.get("podId"), "householdId": session.get("householdId"),
                "accountId": session.get("accountId"), "sleeperId": session.get("selfSleeperId")}
    for value in identity.values():
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError("The Pod returned an invalid account identity.")
    return identity


def pair_remote(origin, invitation, display_name, allow_local_http=False, opener=None):
    """Consume one invitation, then independently confirm the new credential's identity."""
    origin = validated_origin(origin, allow_local_http)
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", invitation):
        raise ValueError("Use the own-device invitation from your personal account.")
    if not display_name.strip() or len(display_name.strip()) > 80:
        raise ValueError("Enter your existing profile name.")
    opener = opener or urllib.request.build_opener(NoRedirects())
    token = secrets.token_urlsafe(32)

    def exchange(path, body=None, authenticated=False):
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            with opener.open(request, timeout=15) as response:
                if response.status != 200 or response.url != request.full_url:
                    raise ValueError("Pairing response did not come from the selected Pod.")
                data = response.read(65537)
                if len(data) > 65536:
                    raise ValueError("Pairing response was too large.")
                return json.loads(data)
        except (urllib.error.HTTPError, urllib.error.URLError) as error:
            raise ValueError("Pairing was not confirmed. Check the connection and the invitation in your app.") from error

    joined = exchange("/api/v1/household/join", {"invitation": invitation, "deviceSecret": token,
        "deviceName": "Sleepypod bedside remote", "displayName": display_name.strip()})
    identity = identity_from_session(joined)
    if identity_from_session(exchange("/api/v1/household/session", authenticated=True)) != identity:
        raise ValueError("Account identity changed during pairing.")
    return {"personal": True, "identity": identity, "token": token}
