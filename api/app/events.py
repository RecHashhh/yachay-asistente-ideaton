import json
from typing import Any


def encode_sse(event: dict[str, Any]) -> bytes:
    """Serializa un evento en el formato data: que consume web/src/lib/api.ts."""
    payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    return f"data: {payload}\n\n".encode("utf-8")
