import base64
import hashlib
import hmac
import json
import time
from typing import Any


class ContextTokenError(ValueError):
    pass


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("ascii"))


def issue_context_token(payload: dict[str, Any], *, secret: str, ttl_seconds: int) -> str:
    wrapped = {
        "exp": int(time.time()) + ttl_seconds,
        "payload": payload,
    }
    payload_bytes = json.dumps(wrapped, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(sig)}"


def parse_context_token(token: str, *, secret: str) -> dict[str, Any]:
    try:
        payload_b64, sig_b64 = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise ContextTokenError("Invalid token format") from exc

    payload_bytes = _b64url_decode(payload_b64)
    sig = _b64url_decode(sig_b64)

    expected_sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        raise ContextTokenError("Invalid token signature")

    data = json.loads(payload_bytes.decode("utf-8"))
    if int(data["exp"]) < int(time.time()):
        raise ContextTokenError("Token expired")

    return data["payload"]
